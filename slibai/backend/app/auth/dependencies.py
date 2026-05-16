"""
FastAPI dependency functions that sit between the HTTP layer and route handlers,
verifying identity and permissions before the handler runs. Kept separate from
jwt_utils.py so token verification and database user lookup stay in different
layers — jwt_utils knows nothing about the database, and this file knows nothing
about how tokens are signed. Any route needing an authenticated user declares
Depends(get_current_user); admin-only routes declare Depends(get_admin_user).
One gotcha: FastAPI's HTTPBearer returns 403 (not 401) when the Authorization
header is missing entirely — if the frontend sees an unexpected 403 on a public
route that was accidentally declared with a dependency, that's why.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.auth.jwt_utils import verify_token

# Automatically extracts the token from "Authorization: Bearer <token>" headers.
# FastAPI uses this to generate the lock icon in the OpenAPI docs and to return
# 403 when the header is missing before we even get to verify_token.
_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolves an authenticated User from the JWT in the Authorization header.

    Two distinct failure modes both raise 401: a bad or expired token (verify_token
    returns None), and a user who was deleted or deactivated after the token was
    issued. Keeping both as 401 rather than distinguishing them avoids leaking
    information about whether a specific user ID exists in the system.

    Args:
        credentials (HTTPAuthorizationCredentials): The Bearer token extracted
            from the Authorization header by FastAPI's HTTPBearer scheme.
        db (Session): Database session injected by get_db for the user lookup.

    Returns:
        User: The authenticated, active User ORM object, ready for the route handler.

    Note:
        JWT spec requires the 'sub' claim to be a string, so we cast it to int
        before the database query — the User.id column is an integer primary key.
    """
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    # sub is a string in the token (JWT spec), User.id is an integer in the DB
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Wraps get_current_user and additionally requires the is_admin flag to be set.

    Returns 403 rather than 401 because the user is fully authenticated at this
    point — they just don't have the right permission level. The frontend handles
    401 (re-login) and 403 (show "access denied") differently.

    Args:
        current_user (User): Already-verified active user from get_current_user.

    Returns:
        User: The same User object, confirmed to have admin privileges.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
