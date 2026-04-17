from fastapi import APIRouter, HTTPException, Query
from app.services.tool_service import (
    get_all_tools,
    get_tool_by_id,
    search_tools,
    compare_tools,
    get_category_stats,
)

router = APIRouter(prefix="/tools", tags=["AI Tools"])


@router.get("/")
def read_all_tools():
    return get_all_tools()


@router.get("/search")
def read_search_tools(q: str = Query(..., min_length=1)):
    return search_tools(q)  # returns { results, detected_category, query }


@router.get("/compare")
def read_compare_tools(ids: str = Query(..., description="Comma-separated IDs like 1,2")):
    try:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="IDs must be integers separated by commas.")

    tools = compare_tools(id_list)

    if not tools:
        raise HTTPException(status_code=404, detail="No matching tools found.")

    return tools


@router.get("/stats/categories")
def read_category_stats():
    return get_category_stats()


@router.get("/{tool_id}")
def read_tool_by_id(tool_id: int):
    tool = get_tool_by_id(tool_id)

    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")

    return tool