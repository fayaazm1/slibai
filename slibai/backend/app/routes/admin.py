"""
Admin endpoints — crawl control and status.
No auth for now (capstone project). Add API key middleware before production.
"""

from fastapi import APIRouter, BackgroundTasks
from app.crawler.runner import run_crawl, run_crawl_in_background, get_status

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/crawl")
def trigger_crawl(background_tasks: BackgroundTasks):
    """
    Trigger a crawl in the background.
    Returns immediately; poll /admin/crawl/status for progress.
    """
    status = get_status()
    if status.get("running"):
        return {"message": "A crawl is already running.", "status": status}

    background_tasks.add_task(run_crawl)
    return {"message": "Crawl started in background. Poll /admin/crawl/status for updates."}


@router.get("/crawl/status")
def crawl_status():
    """Return the current crawl state and last-run statistics."""
    return get_status()
