from sqlalchemy import Column, Integer, String, DateTime, func
from app.database import Base


class ScanLog(Base):
    """Lightweight log of each repo scan — used for research analytics."""
    __tablename__ = "scan_logs"

    id               = Column(Integer, primary_key=True)
    repo_url         = Column(String(500), nullable=False)
    total_found      = Column(Integer, default=0)
    matched_count    = Column(Integer, default=0)
    not_matched_count = Column(Integer, default=0)
    created_at       = Column(DateTime, server_default=func.now())
