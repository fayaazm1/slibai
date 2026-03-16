"""
SLIBai Backend — FastAPI application
Software Library Directory & Finder: AI
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import json
import os
from fuzzywuzzy import fuzz, process

app = FastAPI(
    title="SLIBai API",
    description="Software Library Directory and Finder - AI",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load data ──────────────────────────────────────────────────────────────────

DATA_PATH = os.path.join(os.path.dirname(__file__), "ai_tools.json")

def load_tools() -> List[dict]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

TOOLS: List[dict] = []

@app.on_event("startup")
def startup():
    global TOOLS
    TOOLS = load_tools()
    print(f"[SLIBai] Loaded {len(TOOLS)} AI tools.")


# ── Helper ─────────────────────────────────────────────────────────────────────

def _matches_filters(tool: dict, category: str, cost: str, type_: str) -> bool:
    if category and tool.get("category", "").lower() != category.lower():
        return False
    if cost and tool.get("cost", "").lower() != cost.lower():
        return False
    if type_ and tool.get("type", "").lower() != type_.lower():
        return False
    return True


def _fuzzy_score(tool: dict, query: str) -> int:
    """Return the best fuzzy match score for a query against a tool."""
    candidates = [
        tool.get("name", ""),
        tool.get("description", ""),
        tool.get("function", ""),
        tool.get("category", ""),
        " ".join(tool.get("tags", [])),
        tool.get("developer", ""),
    ]
    scores = [fuzz.partial_ratio(query.lower(), c.lower()) for c in candidates if c]
    return max(scores) if scores else 0


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/api/tools")
def list_tools(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    cost: Optional[str] = Query(None),
    type: Optional[str] = Query(None, alias="type"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all tools with optional filters and fuzzy search."""
    results = TOOLS

    # Fuzzy search
    if search and search.strip():
        scored = [(t, _fuzzy_score(t, search.strip())) for t in results]
        results = [t for t, s in scored if s >= 50]
        results = sorted(results, key=lambda t: _fuzzy_score(t, search.strip()), reverse=True)

    # Filters
    results = [t for t in results if _matches_filters(t, category or "", cost or "", type or "")]

    total = len(results)
    page = results[offset: offset + limit]

    return {"total": total, "offset": offset, "limit": limit, "results": page}


@app.get("/api/tools/{tool_id}")
def get_tool(tool_id: int):
    """Get a single tool by ID."""
    tool = next((t for t in TOOLS if t["id"] == tool_id), None)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool


@app.get("/api/search")
def search_tools(q: str = Query(..., min_length=1)):
    """Fuzzy search returning ranked results."""
    q = q.strip()
    scored = [(t, _fuzzy_score(t, q)) for t in TOOLS]
    ranked = sorted([(t, s) for t, s in scored if s >= 45], key=lambda x: x[1], reverse=True)
    return {
        "query": q,
        "total": len(ranked),
        "results": [{"score": s, "tool": t} for t, s in ranked[:30]],
    }


@app.get("/api/compare")
def compare_tools(ids: str = Query(..., description="Comma-separated tool IDs e.g. 1,2,3")):
    """Return multiple tools for side-by-side comparison."""
    try:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IDs format")

    if len(id_list) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 IDs to compare")
    if len(id_list) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 tools can be compared at once")

    tools = []
    for tid in id_list:
        t = next((t for t in TOOLS if t["id"] == tid), None)
        if not t:
            raise HTTPException(status_code=404, detail=f"Tool with ID {tid} not found")
        tools.append(t)

    return {"count": len(tools), "tools": tools}


@app.get("/api/stats")
def get_stats():
    """Return aggregated library statistics."""
    from collections import Counter

    categories = Counter(t.get("category", "Unknown") for t in TOOLS)
    costs = Counter(t.get("cost", "Unknown") for t in TOOLS)
    types = Counter(t.get("type", "Unknown") for t in TOOLS)
    developers = Counter(t.get("developer", "Unknown") for t in TOOLS)
    years = Counter(t.get("release_year") for t in TOOLS if t.get("release_year"))

    # Top tags
    all_tags = []
    for t in TOOLS:
        all_tags.extend(t.get("tags", []))
    top_tags = Counter(all_tags).most_common(20)

    # Licenses
    licenses = Counter(t.get("license", "Unknown") for t in TOOLS)

    return {
        "total_tools": len(TOOLS),
        "by_category": dict(sorted(categories.items(), key=lambda x: x[1], reverse=True)),
        "by_cost": dict(costs),
        "by_type": dict(sorted(types.items(), key=lambda x: x[1], reverse=True)),
        "by_developer": dict(sorted(developers.items(), key=lambda x: x[1], reverse=True)[:15]),
        "by_year": dict(sorted(years.items())),
        "top_tags": [{"tag": t, "count": c} for t, c in top_tags],
        "by_license": dict(sorted(licenses.items(), key=lambda x: x[1], reverse=True)[:10]),
    }


@app.get("/api/categories")
def get_categories():
    """Return all unique categories and types."""
    categories = sorted(set(t.get("category", "") for t in TOOLS if t.get("category")))
    types = sorted(set(t.get("type", "") for t in TOOLS if t.get("type")))
    costs = sorted(set(t.get("cost", "") for t in TOOLS if t.get("cost")))
    return {"categories": categories, "types": types, "costs": costs}


@app.get("/api/code-example/{tool_id}")
def get_code_example(tool_id: int):
    """Return the code example for a tool."""
    tool = next((t for t in TOOLS if t["id"] == tool_id), None)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return {
        "id": tool["id"],
        "name": tool["name"],
        "language": tool.get("programming_languages", ["Python"])[0],
        "code": tool.get("code_example", "# No example available for this tool."),
    }


@app.get("/")
def root():
    return {"message": "SLIBai API is running", "docs": "/docs", "total_tools": len(TOOLS)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
