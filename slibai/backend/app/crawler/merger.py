# This file handles merging newly crawled tools into our existing ai_tools.json.
#
# A few rules we follow:
#   - Tools we added manually are never touched by the auto-removal logic.
#   - If a crawled tool shows up again, we update it with the latest info.
#   - If a crawled tool goes missing for 3 crawls in a row, we assume it's
#     dead or irrelevant and remove it.
#   - We always write to a temp file first, then rename it — that way a crash
#     mid-write can't corrupt the database.

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "ai_tools.json"
META_FILE = Path(__file__).resolve().parent.parent / "data" / "crawl_meta.json"

# How many crawls a tool can be missing before we drop it
MAX_STALE_CRAWLS = 3


def _load(path: Path):
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def _atomic_write(path: Path, data) -> None:
    # Write to a .tmp file first, then rename to the real file.
    # This prevents a half-written file if something crashes mid-save.
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def _norm(name: str) -> str:
    # Lowercase + strip so "TensorFlow" and "tensorflow" are treated as the same tool
    return name.lower().strip()


def _norm_url(url: str) -> str:
    return url.rstrip("/").lower()


def merge(new_tools: list) -> dict:
    """
    Takes the list of tools just crawled and merges them into ai_tools.json.
    Returns a small summary of what changed: how many were added, updated, or removed.
    """
    existing: list = _load(DATA_FILE)
    now = datetime.now(timezone.utc).isoformat()

    # Build three lookup tables so we can quickly find if a tool already exists.
    # We check in this order: source ID first (most reliable), then URL, then name.
    working = [dict(t) for t in existing]

    by_source: dict[str, int] = {}   # e.g. "github::12345" → position in list
    by_name:   dict[str, int] = {}   # e.g. "tensorflow"    → position in list
    by_url:    dict[str, int] = {}   # e.g. "https://..."   → position in list

    for i, tool in enumerate(working):
        src = tool.get("source", "manual")
        sid = tool.get("source_id", "")
        if src and sid:
            by_source[f"{src}::{sid}"] = i
        name_key = _norm(tool.get("name", ""))
        if name_key:
            by_name[name_key] = i
        url_key = _norm_url(tool.get("official_url", ""))
        if url_key:
            by_url[url_key] = i

    next_id  = max((t.get("id", 0) for t in working), default=0) + 1
    seen_idx: set[int] = set()
    stats = {"added": 0, "updated": 0, "removed": 0, "total": 0}

    for new in new_tools:
        src      = new.get("source", "unknown")
        sid      = new.get("source_id", "")
        name_key = _norm(new.get("name", ""))
        url_key  = _norm_url(new.get("official_url", ""))

        # Try to find this tool in our existing data
        idx = by_source.get(f"{src}::{sid}") if src and sid else None
        if idx is None:
            idx = by_url.get(url_key) if url_key else None
        if idx is None:
            idx = by_name.get(name_key) if name_key else None

        if idx is not None:
            existing_tool = working[idx]
            is_manual = existing_tool.get("source", "manual") == "manual"

            if is_manual:
                # This tool was manually added by us — don't overwrite our
                # description or other hand-written fields, just refresh the
                # live stats like star count and URL health.
                working[idx]["last_crawled"] = now
                working[idx]["url_status"]   = new.get("url_status", "valid")
                if "stars" in new:
                    working[idx]["stars"] = new["stars"]
            else:
                # Auto-sourced tool — safe to fully refresh with latest data
                working[idx] = {
                    **existing_tool,
                    **new,
                    "id":           existing_tool["id"],
                    "last_crawled": now,
                    "stale_count":  0,
                }

            seen_idx.add(idx)
            stats["updated"] += 1

        else:
            # Never seen this tool before — add it
            entry = {
                **new,
                "id":           next_id,
                "last_crawled": now,
                "stale_count":  0,
            }
            working.append(entry)
            new_idx = len(working) - 1
            if src and sid:
                by_source[f"{src}::{sid}"] = new_idx
            if name_key:
                by_name[name_key] = new_idx
            if url_key:
                by_url[url_key] = new_idx
            seen_idx.add(new_idx)
            next_id += 1
            stats["added"] += 1

    # Go through everything and decide what to keep.
    # Manual tools always stay. Auto tools that weren't seen this crawl
    # get a strike — three strikes and they're out.
    final = []
    for i, tool in enumerate(working):
        is_manual = tool.get("source", "manual") == "manual"

        if is_manual:
            final.append(tool)

        elif i in seen_idx:
            tool["stale_count"] = 0
            final.append(tool)

        else:
            stale = tool.get("stale_count", 0) + 1
            if stale >= MAX_STALE_CRAWLS:
                stats["removed"] += 1
            else:
                tool["stale_count"] = stale
                final.append(tool)

    stats["total"] = len(final)

    # Save everything
    _atomic_write(DATA_FILE, final)

    # Also update the crawl metadata file so we can see when the last crawl ran
    meta = _load(META_FILE) if META_FILE.exists() else {}
    if not isinstance(meta, dict):
        meta = {}
    meta["last_crawled"] = now
    meta["last_stats"]   = stats
    meta["total_tools"]  = stats["total"]
    _atomic_write(META_FILE, meta)

    return stats


def merge_to_db(new_tools: list, db: "Session") -> dict:
    """
    DB equivalent of merge() — upserts crawled tools into PostgreSQL.

    Rules (mirroring the JSON merger exactly):
      - Match on source + source_id first, then official_url, then name.
      - Manual tools (source=None or source='manual'): only refresh stars,
        url_status, last_crawled. Never overwrite hand-written fields.
      - Auto tools: full field update, preserve id.
      - New tools (no match): insert with next available id.
      - Tools not seen this crawl: increment stale_count. Remove at >= 3.

    Called only when USE_DB_FOR_CRAWLER_WRITES=true. JSON path is unchanged.
    """
    from app.models.tool import Tool
    from sqlalchemy import func

    now_dt = datetime.now(timezone.utc)
    now_str = now_dt.isoformat()

    # Load all existing DB rows into memory for matching
    existing_rows = db.query(Tool).all()

    # Build the same three lookup tables as the JSON merger
    by_source: dict[str, Tool] = {}
    by_name:   dict[str, Tool] = {}
    by_url:    dict[str, Tool] = {}

    for row in existing_rows:
        if row.source and row.source_id:
            by_source[f"{row.source}::{row.source_id}"] = row
        name_key = _norm(row.name or "")
        if name_key:
            by_name[name_key] = row
        url_key = _norm_url(row.official_url or "")
        if url_key:
            by_url[url_key] = row

    max_id = db.query(func.max(Tool.id)).scalar() or 0
    next_id = max_id + 1

    seen_ids: set[int] = set()
    stats = {"added": 0, "updated": 0, "removed": 0, "total": 0}

    for new in new_tools:
        src      = new.get("source", "unknown")
        sid      = new.get("source_id", "")
        name_key = _norm(new.get("name", ""))
        url_key  = _norm_url(new.get("official_url", ""))

        # Try to find existing row using the same priority order as the JSON merger
        row = by_source.get(f"{src}::{sid}") if src and sid else None
        if row is None:
            row = by_url.get(url_key) if url_key else None
        if row is None:
            row = by_name.get(name_key) if name_key else None

        if row is not None:
            is_manual = (row.source is None or row.source == "manual")

            if is_manual:
                # Manual tools: only refresh live stats — never overwrite curated fields
                row.last_crawled = now_dt
                row.url_status   = new.get("url_status", "valid")
                if "stars" in new:
                    row.stars = new["stars"]
            else:
                # Auto-sourced tool: full refresh, preserve id
                row.name         = new.get("name", row.name)
                row.category     = new.get("category", row.category)
                row.function     = new.get("function", row.function)
                row.description  = new.get("description", row.description)
                row.developer    = new.get("developer", row.developer)
                row.version      = new.get("version", row.version)
                row.cost         = new.get("cost", row.cost)
                row.compatibility = new.get("compatibility", row.compatibility)
                row.dependencies = new.get("dependencies", row.dependencies)
                row.tags         = new.get("tags", row.tags)
                row.use_cases    = new.get("use_cases", row.use_cases)
                row.social_impact = new.get("social_impact", row.social_impact)
                row.example_code = new.get("example_code", row.example_code)
                row.official_url = new.get("official_url", row.official_url)
                row.github_url   = new.get("github_url", row.github_url)
                row.url_status   = new.get("url_status", "valid")
                row.stars        = new.get("stars", row.stars)
                row.last_updated = new.get("last_updated", row.last_updated)
                row.last_crawled = now_dt
                row.stale_count  = 0

            seen_ids.add(row.id)
            stats["updated"] += 1

        else:
            # New tool — insert with next available id
            tool = Tool(
                id           = next_id,
                name         = new.get("name", ""),
                category     = new.get("category", ""),
                function     = new.get("function", ""),
                description  = new.get("description", ""),
                developer    = new.get("developer"),
                version      = new.get("version"),
                cost         = new.get("cost"),
                compatibility = new.get("compatibility"),
                dependencies  = new.get("dependencies"),
                tags          = new.get("tags"),
                use_cases     = new.get("use_cases"),
                social_impact = new.get("social_impact"),
                example_code  = new.get("example_code"),
                official_url  = new.get("official_url"),
                github_url    = new.get("github_url"),
                source        = src,
                source_id     = str(sid) if sid else None,
                url_status    = new.get("url_status", "valid"),
                stars         = new.get("stars"),
                stale_count   = 0,
                last_crawled  = now_dt,
                last_updated  = new.get("last_updated"),
            )
            db.add(tool)

            # Register in lookup tables so later tools in this batch don't re-insert
            if src and sid:
                by_source[f"{src}::{sid}"] = tool
            if name_key:
                by_name[name_key] = tool
            url_key2 = _norm_url(new.get("official_url", ""))
            if url_key2:
                by_url[url_key2] = tool

            seen_ids.add(next_id)
            next_id += 1
            stats["added"] += 1

    # Apply stale logic to auto-sourced tools that weren't seen this crawl
    for row in existing_rows:
        if row.id in seen_ids:
            continue
        is_manual = (row.source is None or row.source == "manual")
        if is_manual:
            continue  # manual tools are never staleness-removed
        stale = (row.stale_count or 0) + 1
        if stale >= MAX_STALE_CRAWLS:
            db.delete(row)
            stats["removed"] += 1
        else:
            row.stale_count = stale

    db.commit()

    stats["total"] = db.query(func.count(Tool.id)).scalar()
    return stats
