"""
Admin-only routes — User Management.
All endpoints require a valid JWT from an admin account.

  GET    /admin/users           — list all users
  DELETE /admin/users/{id}      — delete a user (cannot delete yourself)
  PATCH  /admin/users/{id}/deactivate  — deactivate (soft-ban) a user
  PATCH  /admin/users/{id}/activate    — re-activate a user

Deactivate is a soft-ban — the user record stays in the database and all their
data is preserved, but get_current_user in dependencies.py rejects any JWT they
hold with a 401. Delete is permanent — the row is gone and cannot be recovered.
The self-protection guard on delete and deactivate exists because locking yourself
out of the only admin account would require direct database access to fix.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.auth.dependencies import get_admin_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import AdminUserResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[AdminUserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Returns all users in the system, ordered by most recently created.

    No pagination — fine for demo scale, but would need limits and offset
    params before this goes near a real user base.

    Args:
        db (Session): Database session.
        _ (User): Admin user from get_admin_user — enforces auth only.

    Returns:
        list[AdminUserResponse]: All user records with admin-visible fields.
    """
    return db.query(User).order_by(User.created_at.desc()).all()


@router.delete("/users/{user_id}", status_code=200)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Permanently deletes a user account. Cannot be undone.

    The self-protection check prevents an admin from deleting their own account
    and potentially leaving the system with no admin access. If that happened,
    recovery would require a direct database fix.

    Args:
        user_id (int): ID of the user to delete.
        db (Session): Database session.
        admin (User): The requesting admin — used for the self-protection check.

    Returns:
        dict: Confirmation message with the deleted user's email.
    """
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": f"User {user.email} deleted"}


@router.patch("/users/{user_id}/deactivate", response_model=AdminUserResponse)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Soft-bans a user — their account stays in the database but their JWT is
    rejected by get_current_user until an admin re-activates them.

    Prefer this over delete when the goal is to block access temporarily or
    preserve the user's data. The self-protection guard is here for the same
    reason as delete — deactivating yourself would lock you out of the admin panel.

    Args:
        user_id (int): ID of the user to deactivate.
        db (Session): Database session.
        admin (User): The requesting admin — used for the self-protection check.

    Returns:
        AdminUserResponse: The updated user record with is_active set to False.
    """
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate yourself")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/activate", response_model=AdminUserResponse)
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Re-enables a previously deactivated account.

    No self-protection needed here — activating yourself when you're already
    active is a no-op and causes no harm.

    Args:
        user_id (int): ID of the user to activate.
        db (Session): Database session.
        _ (User): Admin user from get_admin_user — enforces auth only.

    Returns:
        AdminUserResponse: The updated user record with is_active set to True.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)
    return user
