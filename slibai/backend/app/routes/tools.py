"""
Public read-only endpoints for browsing, searching, comparing, and filtering tools —
no authentication required. Route logic is deliberately thin: each handler picks the
JSON or DB service function based on _USE_DB and delegates all query logic to
tool_service.py. The /{tool_id} route is declared last in this file because FastAPI
matches routes in registration order — if it came before /search or /compare, those
literal path segments would be caught as tool_id values and return 404 instead of
routing correctly. Keep any new named sub-routes above the wildcard.
"""
# public tool endpoints — read-only, no auth required
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.tool_service import (
    get_all_tools,
    get_tool_by_id,
    get_all_tools_db,
    get_tool_by_id_db,
    search_tools,
    search_tools_db,
    compare_tools,
    compare_tools_db,
    filter_tools,
    filter_tools_db,
    get_category_stats,
    get_category_stats_db,
)

router = APIRouter(prefix="/tools", tags=["AI Tools"])

# set USE_DB_FOR_TOOLS=true in .env to read from PostgreSQL instead of the JSON file
_USE_DB = os.getenv("USE_DB_FOR_TOOLS", "false").lower() == "true"


@router.get("/")
def read_all_tools(db: Session = Depends(get_db)):
    """
    Returns every active tool in the catalogue.

    No pagination or filtering — the full list. Fine at current catalogue size
    but would need limits if the dataset grew into the thousands.

    Args:
        db (Session): Database session, only used when _USE_DB is true.

    Returns:
        list: All active tool dicts in id order.
    """
    return get_all_tools_db(db) if _USE_DB else get_all_tools()


@router.get("/search")
def read_search_tools(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """
    Runs the scored search and returns ranked results.

    min_length=1 on the query parameter prevents empty-string searches from
    reaching the scoring engine, which would just return nothing useful anyway.

    Args:
        q (str): The user's search string, at least 1 character.
        db (Session): Database session, only used when _USE_DB is true.

    Returns:
        dict: Keys are "results" (ranked list), "detected_category", "total_results",
            and "query". See tool_service._run_search for the full shape.
    """
    return search_tools_db(db, q) if _USE_DB else search_tools(q)


@router.get("/compare")
def read_compare_tools(
    ids: str = Query(..., description="Comma-separated IDs like 1,2"),
    db: Session = Depends(get_db),
):
    """
    Accepts a comma-separated list of tool IDs and returns those tools for
    side-by-side comparison.

    The try/except catches ValueError from int() when the ids string contains
    a non-numeric value — e.g. ids=1,abc — and returns a 400 rather than a 500.

    Args:
        ids (str): Comma-separated integer IDs, e.g. "1,4,7".
        db (Session): Database session, only used when _USE_DB is true.

    Returns:
        list: Tool dicts for the requested IDs. Tools not found are silently omitted.

    Note:
        Returns 404 only if none of the requested IDs exist at all, not if
        just some are missing — partial results are returned without error.
    """
    try:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="IDs must be integers separated by commas.")

    tools = compare_tools_db(db, id_list) if _USE_DB else compare_tools(id_list)

    if not tools:
        raise HTTPException(status_code=404, detail="No matching tools found.")

    return tools


@router.get("/filter")
def read_filter_tools(
    category: Optional[str] = None,
    cost: Optional[str] = None,
    language: Optional[str] = None,
    developer: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Filters tools by any combination of category, cost, language, and developer.

    All parameters are optional and combined as AND conditions — passing none
    returns the full catalogue, same as read_all_tools.

    Args:
        category (str | None): Exact category name match, e.g. "NLP".
        cost (str | None): Substring match on the cost field, e.g. "free".
        language (str | None): Language to find in the compatibility list.
        developer (str | None): Substring match on the developer field.
        db (Session): Database session, only used when _USE_DB is true.

    Returns:
        dict: Keys are "results" (list of matching tool dicts) and "total_results" (int).
    """
    results = (
        filter_tools_db(db, category=category, cost=cost, language=language, developer=developer)
        if _USE_DB
        else filter_tools(category=category, cost=cost, language=language, developer=developer)
    )
    return {"results": results, "total_results": len(results)}


@router.get("/stats/categories")
def read_category_stats(db: Session = Depends(get_db)):
    """
    Returns per-category tool counts for the Stats page.

    Always covers the full active catalogue — no filtering applied here.

    Args:
        db (Session): Database session, only used when _USE_DB is true.

    Returns:
        list: Dicts with "category" and "count" keys, one per active category.
    """
    return get_category_stats_db(db) if _USE_DB else get_category_stats()


# /{tool_id} must stay last — FastAPI matches routes in order and this wildcard
# would swallow /search, /compare, /filter, and /stats if registered earlier
@router.get("/{tool_id}")
def read_tool_by_id(tool_id: int, db: Session = Depends(get_db)):
    """
    Returns a single tool by its integer ID.

    Args:
        tool_id (int): The tool's primary key as stored in the catalogue.
        db (Session): Database session, only used when _USE_DB is true.

    Returns:
        dict: The tool record if found and active.

    Note:
        Returns 404 for both missing tools and inactive tools — we don't
        distinguish between "never existed" and "soft-deleted" at this layer.
    """
    tool = get_tool_by_id_db(db, tool_id) if _USE_DB else get_tool_by_id(tool_id)

    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")

    return tool
