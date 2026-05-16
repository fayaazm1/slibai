"""
All the auth stuff lives here — signup, signin, password reset, and OAuth for Google/GitHub.
Nothing fancy, just the basics to get users in and out safely.

JWT creation delegates to auth/jwt_utils.py and password hashing to auth/password.py —
this file only orchestrates the flows. The brute-force protection is in-memory and
resets on server restart, which is an acceptable tradeoff for a demo deployment but
would need a Redis-backed solution before going to real production. OAuth callbacks
redirect to FRONTEND_URL after success so both local dev and Render work without
hardcoding a domain.
"""

import os
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.email import send_reset_email
from app.auth.jwt_utils import create_access_token
from app.auth.password import hash_password, verify_password
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    SignInRequest,
    SignUpRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Brute-force protection (#6) ──────────────────────────────────────────────
# In-memory per-email tracker. Resets on server restart — acceptable for beta.
_failed_logins: dict[str, list[float]] = defaultdict(list)
# 5 attempts before lockout — low enough to stop automated attacks, high enough
# that a real user misremembering their password isn't immediately locked out
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 300  # 5-minute sliding window


def _check_login_rate_limit(email: str) -> None:
    """
    Raises 429 if the given email has hit the failed login threshold.

    Prunes stale entries from the tracker on every call so the dict doesn't
    grow unbounded over time — only timestamps within the sliding window count.

    Args:
        email (str): The email address being checked.
    """
    now = time.time()
    recent = [t for t in _failed_logins[email] if now - t < _WINDOW_SECONDS]
    _failed_logins[email] = recent
    if len(recent) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Please try again in 5 minutes.",
        )


def _record_failed_login(email: str) -> None:
    """
    Records the current timestamp as a failed login attempt for the given email.

    Called on both wrong-email and wrong-password outcomes so an attacker can't
    determine which field was incorrect by observing when the counter increments.

    Args:
        email (str): The email address the failed attempt was made against.
    """
    _failed_logins[email].append(time.time())


# grab URLs and OAuth keys from env so nothing is hardcoded
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = f"{BACKEND_URL}/auth/google/callback"

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = f"{BACKEND_URL}/auth/github/callback"


# small helper so we don't repeat the same token-building logic everywhere

def _token_response(user: User) -> TokenResponse:
    """
    Builds the standard TokenResponse returned by every successful auth endpoint.

    Centralizing this means signup, signin, and both OAuth callbacks all return
    the same shape without duplicating the create_access_token call.

    Args:
        user (User): The authenticated User ORM object.

    Returns:
        TokenResponse: Contains the JWT access_token and serialized user profile.
    """
    token = create_access_token(user.id, user.email)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


# regular email/password signup and signin

@router.post("/signup", response_model=TokenResponse, status_code=201)
def signup(body: SignUpRequest, db: Session = Depends(get_db)):
    """
    Creates a new local user account and returns a JWT.

    The first-admin bootstrap gives admin privileges to whoever signs up when
    no admin exists yet — convenient for setting up a fresh deployment without
    needing a separate seed script.

    Args:
        body (SignUpRequest): Email, name, and plaintext password.
        db (Session): Database session.

    Returns:
        TokenResponse: JWT and user profile for the newly created account.
    """
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # first admin is whoever signs up when no admin exists yet
    is_first_user = db.query(User).filter(User.is_admin == True).count() == 0

    user = User(
        email=body.email,
        name=body.name,
        hashed_password=hash_password(body.password),
        provider="local",
        is_admin=is_first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post("/signin", response_model=TokenResponse)
def signin(body: SignInRequest, db: Session = Depends(get_db)):
    """
    Authenticates a local user and returns a JWT.

    Rate limit check runs before the database query so failed attempts are
    counted regardless of whether the email exists in the system. Both
    wrong-email and wrong-password cases return identical 401 details to
    avoid leaking which field was incorrect to an attacker.

    Args:
        body (SignInRequest): Email and plaintext password.
        db (Session): Database session.

    Returns:
        TokenResponse: JWT and user profile on success.
    """
    _check_login_rate_limit(body.email)

    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.hashed_password:
        _record_failed_login(body.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.hashed_password):
        _record_failed_login(body.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    return _token_response(user)


# forgot/reset password flow

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Generates a password reset token and sends it to the user's email address.

    Always returns 200 regardless of whether the email exists — we don't want
    to tell callers whether a given address is registered. If the email send
    fails, the token is cleared immediately so a broken partial state doesn't
    leave a valid-but-undelivered token sitting in the database.

    Args:
        body (ForgotPasswordRequest): The email address requesting a reset.
        db (Session): Database session.

    Returns:
        dict: A generic success message regardless of outcome.
    """
    user = db.query(User).filter(User.email == body.email).first()
    # always return 200 — we don't want to tell people whether an email is registered or not
    if not user or user.provider != "local":
        return {"message": "If that email is registered you will receive a reset link."}

    # token_urlsafe(32) gives 256 bits of entropy — more than enough to be unguessable
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    # 1 hour gives someone enough time to check their email without rushing, but is short
    # enough that a token sitting in a compromised inbox doesn't stay valid indefinitely
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    try:
        send_reset_email(to_email=user.email, reset_link=reset_link)
    except Exception as exc:
        # log server-side only — never expose SMTP details in the API response
        print(f"[Auth] Reset email failed for {user.email}: {exc}")
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        raise HTTPException(
            status_code=500,
            detail="Could not send reset email. Please try again later.",
        )

    return {"message": "Password reset link sent to your email."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Validates a reset token and updates the user's password.

    The token is nulled out immediately after a successful reset so it cannot
    be reused — each token is strictly single-use. Expiry is also checked
    before the password update to reject tokens that are valid but stale.

    Args:
        body (ResetPasswordRequest): The reset token and the new plaintext password.
        db (Session): Database session.

    Returns:
        dict: Confirmation message on success.
    """
    user = db.query(User).filter(User.reset_token == body.token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset token has expired")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user.hashed_password = hash_password(body.new_password)
    # clear the token immediately — tokens are single-use and cannot be replayed
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"message": "Password updated successfully"}


# returns whoever is currently logged in (used by the frontend to stay in sync)

@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """
    Returns the currently authenticated user's profile.

    The frontend calls this on startup to re-hydrate auth state from a stored
    token — if this returns 401, the token has expired and the user needs to
    sign in again.

    Args:
        current_user (User): Injected by get_current_user dependency.

    Returns:
        UserResponse: The authenticated user's profile fields.
    """
    return current_user


# Google OAuth

@router.get("/google")
def google_login():
    """
    Redirects the browser to Google's OAuth consent screen.

    Returns 501 if GOOGLE_CLIENT_ID isn't set so the error is clear during
    local dev rather than failing silently at the Google redirect.

    Returns:
        RedirectResponse: Sends the browser to Google's authorization URL.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured — set GOOGLE_CLIENT_ID env var")
    params = urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
    """
    Handles the OAuth callback from Google after the user grants consent.

    Trades the authorization code for an access token, fetches the user's
    profile, then creates or updates the local user record. Merges accounts
    by email — if a user already exists with that address they're linked to
    Google rather than creating a duplicate account. On success redirects to
    the frontend root with the JWT in the query string.

    Args:
        code (str): The one-time authorization code provided by Google.
        db (Session): Database session.

    Returns:
        RedirectResponse: Frontend URL with JWT on success, or signin page with
            an error param on failure.
    """
    async with httpx.AsyncClient() as client:
        # trade the code Google gave us for an actual access token
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}/signin?error=google_failed")

        access_token = token_res.json().get("access_token")

        # now fetch the user's profile with that token
        info_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        info = info_res.json()

    email = info.get("email")
    name = info.get("name", "")
    provider_id = info.get("id")

    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=no_email")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, name=name, provider="google", provider_id=provider_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # link or refresh the provider_id regardless of which provider they signed up with
        if user.provider_id != provider_id:
            user.provider_id = provider_id
            db.commit()

    jwt_token = create_access_token(user.id, user.email)
    return RedirectResponse(f"{FRONTEND_URL}/?token={jwt_token}")


# GitHub OAuth

@router.get("/github")
def github_login():
    """
    Redirects the browser to GitHub's OAuth authorization page.

    Returns 501 if GITHUB_CLIENT_ID isn't set so the error is clear during
    local dev rather than failing at the GitHub redirect.

    Returns:
        RedirectResponse: Sends the browser to GitHub's authorization URL.
    """
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured — set GITHUB_CLIENT_ID env var")
    params = urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_REDIRECT_URI,
        "scope": "user:email",
    })
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{params}")


@router.get("/github/callback")
async def github_callback(code: str, db: Session = Depends(get_db)):
    """
    Handles the OAuth callback from GitHub after the user authorizes the app.

    Trades the code for an access token, fetches the user's profile, then
    creates or updates the local user record. GitHub sometimes hides the
    primary email in the profile response — the emails endpoint fallback is
    necessary for users with private email settings on GitHub.

    Args:
        code (str): The one-time authorization code provided by GitHub.
        db (Session): Database session.

    Returns:
        RedirectResponse: Frontend URL with JWT on success, or signin page with
            an error param on failure.
    """
    async with httpx.AsyncClient() as client:
        # trade the code GitHub gave us for an access token
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
        )
        access_token = token_res.json().get("access_token")
        if not access_token:
            return RedirectResponse(f"{FRONTEND_URL}/signin?error=github_failed")

        headers = {"Authorization": f"Bearer {access_token}"}

        # pull the user's GitHub profile
        profile_res = await client.get("https://api.github.com/user", headers=headers)
        profile = profile_res.json()

        # GitHub sometimes hides the email in the profile, so we check the emails endpoint too
        email = profile.get("email")
        if not email:
            emails_res = await client.get("https://api.github.com/user/emails", headers=headers)
            for e in emails_res.json():
                if e.get("primary") and e.get("verified"):
                    email = e["email"]
                    break

    name = profile.get("name") or profile.get("login", "")
    provider_id = str(profile.get("id"))

    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=no_email")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, name=name, provider="github", provider_id=provider_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # link or refresh the provider_id regardless of which provider they signed up with
        if user.provider_id != provider_id:
            user.provider_id = provider_id
            db.commit()

    jwt_token = create_access_token(user.id, user.email)
    return RedirectResponse(f"{FRONTEND_URL}/?token={jwt_token}")
