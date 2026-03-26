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
