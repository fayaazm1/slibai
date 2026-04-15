"""
Admin crawler endpoints — trigger crawl and check status.
Both endpoints require a valid JWT from an admin account.
"""

from fastapi import APIRouter, BackgroundTasks, Depends
from app.crawler.runner import run_crawl, get_status
from app.auth.dependencies import get_admin_user
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/crawl")
def trigger_crawl(
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
):
    """Trigger a crawl in the background. Returns immediately; poll /admin/crawl/status."""
    status = get_status()
    if status.get("running"):
        return {"message": "A crawl is already running.", "status": status}
    background_tasks.add_task(run_crawl)
    return {"message": "Crawl started in background. Poll /admin/crawl/status for updates."}


@router.get("/crawl/status")
def crawl_status(_: User = Depends(get_admin_user)):
    """Return the current crawl state and last-run statistics."""
    return get_status()
