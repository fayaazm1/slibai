"""
JWT creation and verification for the SLIBai authentication system. Kept separate
from auth/dependencies.py so the crypto logic lives in one testable place and the
FastAPI dependency wiring stays elsewhere. Route handlers never call jose directly —
they go through create_access_token here and the get_current_user dependency calls
verify_token. The SECRET_KEY fallback is intentionally obvious for dev convenience
but it will expose all tokens if deployed without the env var set — always set
SECRET_KEY in production.
"""
import os
from datetime import datetime, timedelta
from jose import jwt, JWTError

# Must be overridden in production via the SECRET_KEY environment variable.
# The fallback exists purely so local dev starts without extra setup — it is
# not safe to ship.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production-slibai-xyz123!")

# HS256 is symmetric — same key signs and verifies. Simpler than RS256 for a
# single-service deployment where we never need a third party to verify tokens.
ALGORITHM = "HS256"

# 7 days is a deliberate balance. Short enough that a stolen token has a limited
# window of usefulness. Long enough that real users aren't getting kicked out
# mid-week and frustrated with repeated logins.
ACCESS_TOKEN_EXPIRE_DAYS = 7


def create_access_token(user_id: int, email: str) -> str:
    """
    Mints a signed JWT for an authenticated user.

    Embeds user_id as the standard 'sub' claim and email as a convenience field
    so the frontend can display the user's address without a separate API call.
    Expiry is baked into the token itself — jose checks it automatically on decode.

    Args:
        user_id (int): The user's database primary key, stored as a string in 'sub'
            per the JWT spec.
        email (str): The user's email address, included as a non-standard claim.

    Returns:
        str: A signed JWT string, valid for ACCESS_TOKEN_EXPIRE_DAYS days.
    """
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict | None:
    """
    Decodes and validates a JWT, returning the payload dict if valid.

    JWTError covers both signature failures and expired tokens — we don't
    distinguish between them at this layer. The caller (get_current_user in
    dependencies.py) treats any None return as a 401.

    Args:
        token (str): The raw JWT string from the Authorization header.

    Returns:
        dict | None: The decoded payload with 'sub', 'email', and 'exp' keys,
            or None if the token is invalid, expired, or tampered with.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
