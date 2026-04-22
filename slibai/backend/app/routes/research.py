# Research Dashboard Endpoints
#
# These endpoints expose the results of sample-based AI library usage analysis.
# The underlying data comes from research_service.py which crawls GitHub repos.
#
# All data reflects SAMPLE-BASED ANALYSIS — not a census of GitHub.
# See research_service.py for full methodology documentation.

import threading

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_admin_user
from app.database import get_db
from app.models.tool import Tool
from app.models.user import User
from app.services.research_service import load_results, run_research_scan, get_progress

router = APIRouter(prefix="/research", tags=["research"])

# ── Scan job state (mirrors pattern from crawler runner.py) ──────────────────
_scan_lock = threading.Lock()
_scan_running = False


def _run_scan_background() -> None:
    global _scan_running
    try:
        run_research_scan()
    except Exception as e:
        print(f"[Research] Background scan error: {e}")
    finally:
        _scan_running = False


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/summary")
def get_summary():
    """
    Returns high-level metadata about the last research scan.

    Note: Based on sample-based analysis of GitHub repositories.
    See /research/top-libraries for per-library breakdown.
    """
    data = load_results()
    if not data:
        raise HTTPException(
            status_code=404,
            detail="No research scan data available yet. Run POST /research/run-scan first.",
        )
    return {
        "scan_date":     data["scan_date"],
        "repos_scanned": data["repos_scanned"],
        "unique_libs":   data["unique_libs"],
        "methodology":   data["methodology"],
        "data_source":   data.get("data_source", ""),
        "limitations":   data.get("limitations", []),
        "assumptions":   data.get("assumptions", []),
    }


@router.get("/top-libraries")
def get_top_libraries(limit: int = 10, db: Session = Depends(get_db)):
    """
    Returns the top N most-used AI libraries across sampled GitHub repos.

    Each entry includes:
      - rank, name, count, percentage, category
      - in_catalogue: whether this library exists in the SLIBai tool DB
      - tool_id / tool_name: if in_catalogue, the matching tool's ID and name

    Based on sample-based analysis — see /research/summary for methodology.
    """
    data = load_results()
    if not data:
        raise HTTPException(
            status_code=404,
            detail="No research scan data available yet. Run POST /research/run-scan first.",
        )

    # build a lookup from normalized tool names to (id, name) for catalogue matching
    rows = db.query(Tool).all()
    catalogue: dict[str, tuple[int, str]] = {}
    for row in rows:
        key = row.name.lower().replace("-", "").replace("_", "").replace(" ", "")
        catalogue[key] = (row.id, row.name)
        # also index by tags for broader matching
        for tag in (row.tags or []):
            tk = tag.lower().replace("-", "").replace("_", "")
            if tk not in catalogue:
                catalogue[tk] = (row.id, row.name)

    results = data.get("results", [])[:limit]
    enriched = []
    for entry in results:
        norm_lib = entry["name"].replace("-", "").replace("_", "").replace(" ", "")
        match = catalogue.get(norm_lib)
        enriched.append({
            **entry,
            "in_catalogue": match is not None,
            "tool_id":      match[0] if match else None,
            "tool_name":    match[1] if match else None,
        })

    return {
        "data":          enriched,
        "total_results": len(data.get("results", [])),
        "note":          "Based on sampled GitHub repositories using search filters. Not a census of all GitHub.",
    }


@router.get("/category-breakdown")
def get_category_breakdown():
    """Returns library counts aggregated by functional category."""
    data = load_results()
    if not data:
        raise HTTPException(status_code=404, detail="No research data available.")

    cat_counts: dict[str, int] = {}
    cat_repos:  dict[str, int] = {}  # total count (repos that use at least one lib in category)

    for entry in data.get("results", []):
        cat = entry["category"]
        cat_counts[cat]  = cat_counts.get(cat, 0) + 1
        cat_repos[cat]   = cat_repos.get(cat, 0) + entry["count"]

    breakdown = [
        {"category": cat, "library_count": cat_counts[cat], "total_uses": cat_repos[cat]}
        for cat in sorted(cat_counts, key=lambda c: cat_repos[c], reverse=True)
    ]
    return {"data": breakdown}


@router.post("/run-scan")
def trigger_research_scan(
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
):
    """
    Trigger a new research scan (admin only).

    Fetches live data from GitHub using the sampling methodology in research_service.py.
    Runs in the background — poll /research/summary for updated results.

    Warning: consumes GitHub API quota (~100-200 requests per scan).
    Set GITHUB_TOKEN env var for higher rate limits (5000 req/hr vs 60/hr).
    """
    global _scan_running
    with _scan_lock:
        if _scan_running:
            raise HTTPException(status_code=409, detail="A research scan is already running.")
        _scan_running = True

    background_tasks.add_task(_run_scan_background)
    return {
        "message": "Research scan started in background.",
        "note":    "Poll GET /research/summary to see updated results when complete.",
    }


@router.get("/scan-status")
def scan_status():
    """Returns full progress details for the current or last research scan."""
    return get_progress()
