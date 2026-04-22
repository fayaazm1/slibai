from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_admin_user, get_current_user
from app.database import get_db
from app.models.tool import Tool
from app.models.tool_request import ToolRequest
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin-tools"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ToolCreateBody(BaseModel):
    name: str
    category: str
    function: str
    description: str
    developer: Optional[str] = None
    cost: Optional[str] = None
    official_url: Optional[str] = None
    tags: Optional[list[str]] = None


class ToolEditBody(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    function: Optional[str] = None
    description: Optional[str] = None
    developer: Optional[str] = None
    cost: Optional[str] = None
    official_url: Optional[str] = None
    tags: Optional[list[str]] = None


class ToolRequestRejectBody(BaseModel):
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tool_out(t: Tool) -> dict:
    return {
        "id":           t.id,
        "name":         t.name,
        "category":     t.category,
        "function":     t.function,
        "description":  t.description,
        "developer":    t.developer,
        "cost":         t.cost,
        "official_url": t.official_url,
        "tags":         t.tags or [],
        "is_active":    t.is_active,
    }


def _req_out(r: ToolRequest, db: Session) -> dict:
    email = None
    if r.submitted_by_user_id:
        u = db.query(User).filter(User.id == r.submitted_by_user_id).first()
        email = u.email if u else None
    return {
        "id":                    r.id,
        "submitted_name":        r.submitted_name,
        "normalized_name":       r.normalized_name,
        "source_context":        r.source_context,
        "repo_url":              r.repo_url,
        "submitted_by_user_id":  r.submitted_by_user_id,
        "submitter_email":       email,
        "status":                r.status,
        "notes":                 r.notes,
        "created_at":            r.created_at.isoformat() if r.created_at else None,
        "reviewed_at":           r.reviewed_at.isoformat() if r.reviewed_at else None,
    }


# ── Library CRUD ──────────────────────────────────────────────────────────────

@router.get("/tools")
def list_tools(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    rows = db.query(Tool).order_by(Tool.id).all()
    return [_tool_out(r) for r in rows]


@router.post("/tools", status_code=201)
def add_tool(
    body: ToolCreateBody,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    existing = db.query(Tool).filter(func.lower(Tool.name) == body.name.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"A tool named '{existing.name}' already exists (id={existing.id}).")

    max_id = db.query(func.max(Tool.id)).scalar() or 0
    new_id = max_id + 1

    tool = Tool(
        id=new_id,
        name=body.name.strip(),
        category=body.category.strip(),
        function=body.function.strip(),
        description=body.description.strip(),
        developer=body.developer,
        cost=body.cost,
        official_url=body.official_url,
        tags=body.tags or [],
        is_active=True,
        source="manual",
    )
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return _tool_out(tool)


@router.patch("/tools/{tool_id}")
def edit_tool(
    tool_id: int,
    body: ToolEditBody,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tool, field, value)
    db.commit()
    db.refresh(tool)
    return _tool_out(tool)


@router.patch("/tools/{tool_id}/deactivate")
def deactivate_tool(
    tool_id: int,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")
    tool.is_active = False
    db.commit()
    db.refresh(tool)
    return _tool_out(tool)


@router.patch("/tools/{tool_id}/activate")
def activate_tool(
    tool_id: int,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")
    tool.is_active = True
    db.commit()
    db.refresh(tool)
    return _tool_out(tool)


# ── Tool Request review ───────────────────────────────────────────────────────

@router.get("/tool-requests/count")
def pending_request_count(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    count = db.query(ToolRequest).filter(ToolRequest.status == "pending").count()
    return {"count": count}


@router.get("/tool-requests")
def list_tool_requests(
    status: Optional[str] = None,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    q = db.query(ToolRequest)
    if status:
        q = q.filter(ToolRequest.status == status)
    rows = q.order_by(ToolRequest.created_at.desc()).all()
    return [_req_out(r, db) for r in rows]


@router.patch("/tool-requests/{req_id}/approve")
def approve_tool_request(
    req_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    req = db.query(ToolRequest).filter(ToolRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    req.status = "approved"
    req.reviewed_at = datetime.now(timezone.utc)
    req.reviewed_by_admin_id = admin.id
    db.commit()
    db.refresh(req)
    return _req_out(req, db)


@router.patch("/tool-requests/{req_id}/reject")
def reject_tool_request(
    req_id: int,
    body: ToolRequestRejectBody = ToolRequestRejectBody(),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    req = db.query(ToolRequest).filter(ToolRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    req.status = "rejected"
    req.reviewed_at = datetime.now(timezone.utc)
    req.reviewed_by_admin_id = admin.id
    if body.notes:
        req.notes = body.notes
    db.commit()
    db.refresh(req)
    return _req_out(req, db)
