# Routes for submitting and viewing tool reports.
# Users can only report once per issue type per tool while it's still pending —
# we block duplicates so the admin queue doesn't fill up with the same complaint.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.report import ToolReport
from app.schemas.report import ReportCreate, ReportResponse

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportResponse, status_code=201)
def create_report(
    body: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Prevent spam: one pending report per user per tool per issue type
    duplicate = (
        db.query(ToolReport)
        .filter(
            ToolReport.user_id == current_user.id,
            ToolReport.tool_id == body.tool_id,
            ToolReport.issue_type == body.issue_type,
            ToolReport.status == "pending",
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="You already have a pending report for this issue on this tool.",
        )

    report = ToolReport(
        user_id=current_user.id,
        tool_id=body.tool_id,
        tool_name=body.tool_name,
        issue_type=body.issue_type,
        description=body.description,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/my", response_model=List[ReportResponse])
def my_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ToolReport)
        .filter(ToolReport.user_id == current_user.id)
        .order_by(ToolReport.created_at.desc())
        .all()
    )
