"""
Admin-only report management.
  GET    /admin/reports               — list all reports (optional ?status=pending|resolved)
  PATCH  /admin/reports/{id}/resolve  — mark a report as resolved
  DELETE /admin/reports/{id}          — delete a report
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.auth.dependencies import get_admin_user
from app.database import get_db
from app.models.user import User
from app.models.report import ToolReport
from app.schemas.report import AdminReportResponse

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])


def _enrich(report: ToolReport, db: Session) -> AdminReportResponse:
    """Attach user name + email to a report row."""
    user = db.query(User).filter(User.id == report.user_id).first()
    return AdminReportResponse(
        id=report.id,
        user_id=report.user_id,
        user_name=user.name if user else None,
        user_email=user.email if user else "unknown",
        tool_id=report.tool_id,
        tool_name=report.tool_name,
        issue_type=report.issue_type,
        description=report.description,
        status=report.status,
        created_at=report.created_at,
    )


@router.get("", response_model=List[AdminReportResponse])
def list_reports(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    query = db.query(ToolReport)
    if status in ("pending", "resolved"):
        query = query.filter(ToolReport.status == status)
    reports = query.order_by(ToolReport.created_at.desc()).all()
    return [_enrich(r, db) for r in reports]


@router.patch("/{report_id}/resolve", response_model=AdminReportResponse)
def resolve_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    report = db.query(ToolReport).filter(ToolReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = "resolved"
    db.commit()
    db.refresh(report)
    return _enrich(report, db)


@router.delete("/{report_id}", status_code=200)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    report = db.query(ToolReport).filter(ToolReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(report)
    db.commit()
    return {"message": "Report deleted"}
