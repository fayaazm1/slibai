"""
Admin-only endpoints for triggering and monitoring the crawler. Kept separate from
routes/tools.py because these mutate data and require admin auth — public read-only
browsing lives elsewhere. The crawl runs in a FastAPI BackgroundTask so the HTTP
response returns immediately while the work happens asynchronously. A second admin
hitting POST /admin/crawl while a crawl is already in progress gets a 200 with a
"already running" message rather than a 409, which is friendlier for the admin panel
UI. The threading lock in runner.py provides a second layer of protection against
the APScheduler daily job and a manual trigger overlapping.
"""
# Endpoints for triggering and checking the crawler — admin-only.

from fastapi import APIRouter, BackgroundTasks, Depends
from app.crawler.runner import run_crawl, get_status
from app.auth.dependencies import get_admin_user
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/crawl")
def trigger_crawl(
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),  # declared for auth enforcement only — user object not needed here
):
    """
    Kicks off a background crawl if one isn't already running.

    Returns immediately — the actual crawl happens in a background thread and
    progress is readable via /admin/crawl/status. The running check here prevents
    a second admin from launching a parallel crawl through this endpoint; the
    threading lock in runner.py handles the same scenario for the APScheduler
    daily job that fires independently every 24 hours.

    Args:
        background_tasks (BackgroundTasks): FastAPI's background task queue.
        _ (User): Admin user from get_admin_user — only here to enforce auth,
            the handler doesn't use the object directly.

    Returns:
        dict: Status message and current crawl state if one is already running,
            or a confirmation that the crawl was queued.
    """
    status = get_status()
    if status.get("running"):
        return {"message": "A crawl is already running.", "status": status}
    background_tasks.add_task(run_crawl)
    return {"message": "Crawl started in background. Poll /admin/crawl/status for updates."}


@router.get("/crawl/status")
def crawl_status(_: User = Depends(get_admin_user)):
    """
    Returns the current crawl state and stats from the last completed run.

    The admin panel polls this while a crawl is in progress to show a live
    status indicator. Also useful for checking when the last scheduled crawl
    ran and how many tools were added, updated, or removed.

    Args:
        _ (User): Admin user from get_admin_user — only here to enforce auth.

    Returns:
        dict: Current running state, progress fields, and last-run stats from
            runner.get_status().
    """
    return get_status()
