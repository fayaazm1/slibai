# This is the main entry point for running a crawl.
# It calls both sources (GitHub and HuggingFace), combines the results,
# and passes everything to the merger to update ai_tools.json.
#
# We use a threading lock so two crawls can't run at the same time —
# e.g. if the scheduler fires while someone manually triggered one via the API.

import os
import threading
from datetime import datetime, timezone

from app.crawler.sources import github, huggingface
from app.crawler.merger import merge, merge_to_db, META_FILE, _load

# When true, crawl results are also written into PostgreSQL after the JSON merge.
# The JSON merge always runs regardless — DB write is additive, not a replacement.
_WRITE_TO_DB = os.getenv("USE_DB_FOR_CRAWLER_WRITES", "false").lower() == "true"

_lock = threading.Lock()

# In-memory status so the /admin/crawl/status endpoint can report back.
# We also persist this to crawl_meta.json so it survives server restarts.
_status: dict = {
    "running": False,
    "last_run": None,
    "last_stats": None,
    "error": None,
}


def get_status() -> dict:
    snap = dict(_status)
    # Pull from the saved metadata file in case the server was restarted
    # since the last crawl ran
    meta = _load(META_FILE) if META_FILE.exists() else {}
    if isinstance(meta, dict):
        snap.setdefault("last_run",   meta.get("last_crawled"))
        snap.setdefault("last_stats", meta.get("last_stats"))
        snap["total_tools"] = meta.get("total_tools")
    return snap


def run_crawl(
    github_per_topic: int = 10,
    hf_limit: int = 40,
) -> dict:
    with _lock:
        if _status["running"]:
            return {"status": "already_running"}
        _status["running"] = True
        _status["error"]   = None

    try:
        print("[Crawler] ── Starting crawl ──")
        all_tools: list = []

        # Hit GitHub first — it's our main source
        print("[Crawler] Crawling GitHub …")
        try:
            gh = github.crawl(max_per_topic=github_per_topic)
            all_tools.extend(gh)
        except Exception as e:
            # Don't bail on the whole crawl if just one source fails
            print(f"[Crawler] GitHub source failed: {e}")

        # Then HuggingFace for spaces/demos
        print("[Crawler] Crawling HuggingFace …")
        try:
            hf = huggingface.crawl(limit=hf_limit)
            all_tools.extend(hf)
        except Exception as e:
            print(f"[Crawler] HuggingFace source failed: {e}")

        print(f"[Crawler] {len(all_tools)} total tools collected — merging …")

        stats = merge(all_tools)
        print(f"[Crawler] JSON merge done ✓  added={stats['added']}  updated={stats['updated']}  "
              f"removed={stats['removed']}  total={stats['total']}")

        if _WRITE_TO_DB:
            try:
                from app.database import SessionLocal
                db = SessionLocal()
                try:
                    db_stats = merge_to_db(all_tools, db)
                    print(f"[Crawler] DB merge done ✓  added={db_stats['added']}  "
                          f"updated={db_stats['updated']}  removed={db_stats['removed']}  "
                          f"total={db_stats['total']}")
                    stats["db"] = db_stats
                finally:
                    db.close()
            except Exception as e:
                # DB write failure never kills the crawl — JSON is the source of truth for now
                print(f"[Crawler] DB merge failed (JSON is still up to date): {e}")

        _status["last_run"]   = datetime.now(timezone.utc).isoformat()
        _status["last_stats"] = stats
        return {"status": "success", "stats": stats}

    except Exception as e:
        _status["error"] = str(e)
        print(f"[Crawler] Fatal error: {e}")
        return {"status": "error", "error": str(e)}

    finally:
        _status["running"] = False


def run_crawl_in_background() -> threading.Thread:
    # Spawns the crawl in a background thread so the caller doesn't have to wait
    t = threading.Thread(target=run_crawl, daemon=True, name="slibai-crawler")
    t.start()
    return t
