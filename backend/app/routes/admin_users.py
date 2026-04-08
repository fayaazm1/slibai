"""
Admin-only routes — User Management.
All endpoints require a valid JWT from an admin account.

  GET    /admin/users           — list all users
  DELETE /admin/users/{id}      — delete a user (cannot delete yourself)
  PATCH  /admin/users/{id}/deactivate  — deactivate (soft-ban) a user
  PATCH  /admin/users/{id}/activate    — re-activate a user
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
    return db.query(User).order_by(User.created_at.desc()).all()


@router.delete("/users/{user_id}", status_code=200)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
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
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)
    return user
