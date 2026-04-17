"""
All user-specific routes — profile, bookmarks, activity, use cases, insights, recommendations.
Every endpoint requires a valid JWT (Bearer token).
"""

from collections import Counter
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.password import hash_password, verify_password
from app.database import get_db
from app.models.activity import UserActivity
from app.models.bookmark import UserBookmark
from app.models.use_case import UseCase
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.user import (
    ActivityLog, ActivityResponse,
    BookmarkCreate, BookmarkResponse,
    ChangePasswordRequest, ProfileUpdate,
    UseCaseCreate, UseCaseResponse,
)
from app.services.tool_service import get_all_tools

router = APIRouter(prefix="/user", tags=["user"])


# ── Profile ───────────────────────────────────────────────────────────────────

@router.patch("/profile", response_model=UserResponse)
def update_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.name is not None:
        current_user.name = body.name
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.provider != "local":
        raise HTTPException(status_code=400, detail="OAuth users cannot change their password here")
    if not current_user.hashed_password:
        raise HTTPException(status_code=400, detail="No password set for this account")
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


# ── Bookmarks ─────────────────────────────────────────────────────────────────

@router.get("/bookmarks", response_model=List[BookmarkResponse])
def get_bookmarks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(UserBookmark)
        .filter(UserBookmark.user_id == current_user.id)
        .order_by(UserBookmark.created_at.desc())
        .all()
    )


@router.post("/bookmarks", response_model=BookmarkResponse, status_code=201)
def add_bookmark(
    body: BookmarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(UserBookmark).filter(
        UserBookmark.user_id == current_user.id,
        UserBookmark.tool_id == body.tool_id,
    ).first()
    if existing:
        return existing

    bookmark = UserBookmark(
        user_id=current_user.id,
        tool_id=body.tool_id,
        tool_name=body.tool_name,
        tool_category=body.tool_category,
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark


@router.delete("/bookmarks/{tool_id}")
def remove_bookmark(
    tool_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bookmark = db.query(UserBookmark).filter(
        UserBookmark.user_id == current_user.id,
        UserBookmark.tool_id == tool_id,
    ).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(bookmark)
    db.commit()
    return {"message": "Bookmark removed"}


# ── Activity (recently viewed) ────────────────────────────────────────────────

@router.post("/activity", status_code=201)
def log_activity(
    body: ActivityLog,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # If already viewed, update timestamp to move it to top of recents
    existing = db.query(UserActivity).filter(
        UserActivity.user_id == current_user.id,
        UserActivity.tool_id == body.tool_id,
    ).first()
    if existing:
        existing.created_at = datetime.utcnow()
        db.commit()
        return {"message": "Activity updated"}

    activity = UserActivity(
        user_id=current_user.id,
        tool_id=body.tool_id,
        tool_name=body.tool_name,
        tool_category=body.tool_category,
    )
    db.add(activity)
    db.commit()
    return {"message": "Activity logged"}


@router.get("/activity/recent", response_model=List[ActivityResponse])
def get_recent_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(UserActivity)
        .filter(UserActivity.user_id == current_user.id)
        .order_by(UserActivity.created_at.desc())
        .limit(20)
        .all()
    )


# ── Use Cases ─────────────────────────────────────────────────────────────────

@router.get("/use-cases", response_model=List[UseCaseResponse])
def get_use_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(UseCase)
        .filter(UseCase.user_id == current_user.id)
        .order_by(UseCase.created_at.desc())
        .all()
    )


@router.post("/use-cases", response_model=UseCaseResponse, status_code=201)
def create_use_case(
    body: UseCaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    use_case = UseCase(
        user_id=current_user.id,
        title=body.title,
        description=body.description,
    )
    db.add(use_case)
    db.commit()
    db.refresh(use_case)
    return use_case


@router.delete("/use-cases/{use_case_id}")
def delete_use_case(
    use_case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    use_case = db.query(UseCase).filter(
        UseCase.id == use_case_id,
        UseCase.user_id == current_user.id,
    ).first()
    if not use_case:
        raise HTTPException(status_code=404, detail="Use case not found")
    db.delete(use_case)
    db.commit()
    return {"message": "Use case deleted"}


# ── Insights ──────────────────────────────────────────────────────────────────

@router.get("/insights")
def get_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    activities = db.query(UserActivity).filter(UserActivity.user_id == current_user.id).all()
    bookmarks = db.query(UserBookmark).filter(UserBookmark.user_id == current_user.id).all()
    use_cases = db.query(UseCase).filter(UseCase.user_id == current_user.id).all()

    category_counts = Counter(a.tool_category for a in activities if a.tool_category)
    top_category = category_counts.most_common(1)[0][0] if category_counts else None

    return {
        "total_viewed": len(activities),
        "total_bookmarks": len(bookmarks),
        "total_use_cases": len(use_cases),
        "top_category": top_category,
        "category_breakdown": [
            {"category": cat, "count": cnt}
            for cat, cnt in category_counts.most_common(10)
        ],
        "recent_activity": [
            {
                "tool_id": a.tool_id,
                "tool_name": a.tool_name,
                "tool_category": a.tool_category,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in sorted(activities, key=lambda x: x.created_at, reverse=True)[:10]
        ],
    }


# ── Recommendations ───────────────────────────────────────────────────────────

@router.get("/recommendations")
def get_recommendations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    activities = db.query(UserActivity).filter(UserActivity.user_id == current_user.id).all()
    bookmarks = db.query(UserBookmark).filter(UserBookmark.user_id == current_user.id).all()

    seen_ids = {a.tool_id for a in activities} | {b.tool_id for b in bookmarks}
    categories = (
        [a.tool_category for a in activities if a.tool_category]
        + [b.tool_category for b in bookmarks if b.tool_category]
    )
    top_categories = [cat for cat, _ in Counter(categories).most_common(3)]

    all_tools = get_all_tools()

    if not top_categories:
        return all_tools[:6]

    recommended = [
        t for t in all_tools
        if t.get("category") in top_categories and t.get("id") not in seen_ids
    ]
    return recommended[:6] or all_tools[:6]
