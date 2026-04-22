import os
from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime
from sqlalchemy.types import JSON
from app.database import Base

# Use JSONB on PostgreSQL (faster, indexable), fall back to plain JSON on SQLite.
# SQLAlchemy's JSON type handles this transparently per dialect.
_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./slibai.db")
if "postgresql" in _DATABASE_URL:
    from sqlalchemy.dialects.postgresql import JSONB as _JSON
else:
    _JSON = JSON  # SQLite fallback — behaves identically for reads/writes


class Tool(Base):
    __tablename__ = "tools"

    # Preserve the original JSON id values exactly — do NOT auto-assign new ones.
    # Bookmarks, activity, and reports all store these IDs as plain integers, so
    # keeping them identical is critical. autoincrement=False lets us insert id=1..186.
    id = Column(Integer, primary_key=True, autoincrement=False)

    # Core identity
    name        = Column(String(255), nullable=False, index=True)
    category    = Column(String(100), nullable=False, index=True)
    function    = Column(String(255), nullable=False)
    description = Column(Text,        nullable=False)
    developer   = Column(String(255), nullable=True, index=True)
    version     = Column(String(50),  nullable=True)

    # Pricing — indexed because the filter endpoint queries on cost
    cost = Column(String(100), nullable=True, index=True)

    # Array fields — confirmed as lists in every tool via field type audit.
    # Stored as JSONB on PostgreSQL, JSON on SQLite.
    compatibility = Column(_JSON, nullable=True)   # ["Python", "Linux", "macOS"]
    dependencies  = Column(_JSON, nullable=True)   # ["NumPy", "CUDA (optional)"]
    tags          = Column(_JSON, nullable=True)   # ["deep-learning", "gpu"]
    use_cases     = Column(_JSON, nullable=True)   # ["train custom neural networks"]

    # Long text
    social_impact = Column(Text, nullable=True)
    example_code  = Column(Text, nullable=True)   # sparse — only 26/186 tools have this

    # URLs
    official_url = Column(String(500), nullable=True)
    github_url   = Column(String(500), nullable=True)

    # Crawler metadata — keeping these so we don't lose merge history when the
    # crawler eventually switches from JSON to DB writes (Phase 5)
    source      = Column(String(50),  nullable=True)   # "github" | "huggingface" | "manual"
    source_id   = Column(String(100), nullable=True)   # e.g. GitHub repo numeric ID
    url_status  = Column(String(20),  nullable=True, default="valid")
    stars       = Column(Integer,     nullable=True)
    stale_count = Column(Integer,     nullable=True, default=0)

    # Stored as timezone-aware DateTime; the JSON value is an ISO string with +00:00
    last_crawled = Column(DateTime(timezone=True), nullable=True)
    last_updated = Column(String(50), nullable=True)   # raw string from GitHub, not always parseable

    # Classification — only present in ~half the tools, so nullable
    scope = Column(String(50), nullable=True)   # "in_scope_primary" | "in_scope_secondary"
    type  = Column(String(50), nullable=True)   # "framework" | "library" | "saas-integrated" etc.

    # Soft-delete — False means hidden from browse/search/scanner; True (default) means visible
    is_active = Column(Boolean, nullable=False, default=True, server_default='true')
