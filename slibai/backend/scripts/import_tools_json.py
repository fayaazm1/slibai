"""
One-time script: load ai_tools.json into the `tools` PostgreSQL table.

Run from the backend directory:
    python -m scripts.import_tools_json

Safe to run multiple times — existing rows are skipped (no duplicates, no overwrites).
The JSON file is never modified.

DO NOT run this automatically on startup. Run it manually after Phase 1 is deployed
and you have confirmed the `tools` table exists in the database.
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timezone

# Make sure we can import app modules when running as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal, engine, Base
from app.models import tool as _tool_module  # noqa — ensures Tool is registered with Base
from app.models.tool import Tool

DATA_FILE = Path(__file__).resolve().parent.parent / "app" / "data" / "ai_tools.json"


def _parse_dt(value: str | None):
    """Parse an ISO datetime string to a timezone-aware datetime, or return None."""
    if not value:
        return None
    try:
        # Python 3.11+ handles the +00:00 suffix natively
        dt = datetime.fromisoformat(value)
        # Make sure it's timezone-aware
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _coerce_list(value) -> list | None:
    """Guarantee a list or None — never a raw string."""
    if value is None:
        return None
    if isinstance(value, list):
        return value
    # Shouldn't happen based on the field audit, but handle gracefully
    return [value]


def run_import(dry_run: bool = False) -> None:
    print(f"Reading from: {DATA_FILE}")
    if not DATA_FILE.exists():
        print("ERROR: ai_tools.json not found.")
        sys.exit(1)

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        raw_tools = json.load(f)

    print(f"Found {len(raw_tools)} tools in JSON.")

    # Ensure the tools table exists (safe — create_all is additive only)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing_ids = {row.id for row in db.query(Tool.id).all()}
        print(f"Tools already in DB: {len(existing_ids)}")

        inserted = 0
        skipped = 0

        for raw in raw_tools:
            tool_id = raw.get("id")
            if tool_id in existing_ids:
                skipped += 1
                continue

            tool = Tool(
                id           = tool_id,
                name         = raw.get("name", ""),
                category     = raw.get("category", ""),
                function     = raw.get("function", ""),
                description  = raw.get("description", ""),
                developer    = raw.get("developer"),
                version      = raw.get("version"),
                cost         = raw.get("cost"),

                # Array fields — always lists in the JSON per field type audit
                compatibility = _coerce_list(raw.get("compatibility")),
                dependencies  = _coerce_list(raw.get("dependencies")),
                tags          = _coerce_list(raw.get("tags")),
                use_cases     = _coerce_list(raw.get("use_cases")),

                social_impact = raw.get("social_impact"),
                example_code  = raw.get("example_code"),
                official_url  = raw.get("official_url"),
                github_url    = raw.get("github_url"),

                # Crawler metadata
                source      = raw.get("source"),
                source_id   = str(raw["source_id"]) if raw.get("source_id") else None,
                url_status  = raw.get("url_status", "valid"),
                stars       = raw.get("stars"),
                stale_count = raw.get("stale_count", 0),

                last_crawled = _parse_dt(raw.get("last_crawled")),
                last_updated = raw.get("last_updated"),

                scope = raw.get("scope"),
                type  = raw.get("type"),
            )

            if not dry_run:
                db.add(tool)
            inserted += 1

        if not dry_run:
            db.commit()
            print(f"Done. Inserted: {inserted}, Skipped (already existed): {skipped}")
        else:
            print(f"[DRY RUN] Would insert: {inserted}, Would skip: {skipped}")

    except Exception as e:
        db.rollback()
        print(f"ERROR during import: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    if dry:
        print("=== DRY RUN — no changes will be written ===")
    run_import(dry_run=dry)
