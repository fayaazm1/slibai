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
    return get_all_tools_db(db) if _USE_DB else get_all_tools()


@router.get("/search")
def read_search_tools(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    return search_tools_db(db, q) if _USE_DB else search_tools(q)


@router.get("/compare")
def read_compare_tools(
    ids: str = Query(..., description="Comma-separated IDs like 1,2"),
    db: Session = Depends(get_db),
):
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
    results = (
        filter_tools_db(db, category=category, cost=cost, language=language, developer=developer)
        if _USE_DB
        else filter_tools(category=category, cost=cost, language=language, developer=developer)
    )
    return {"results": results, "total_results": len(results)}


@router.get("/stats/categories")
def read_category_stats(db: Session = Depends(get_db)):
    return get_category_stats_db(db) if _USE_DB else get_category_stats()


@router.get("/{tool_id}")
def read_tool_by_id(tool_id: int, db: Session = Depends(get_db)):
    tool = get_tool_by_id_db(db, tool_id) if _USE_DB else get_tool_by_id(tool_id)

    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")

    return tool