from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from app.database import Base


class ToolRequest(Base):
    """User-submitted requests for AI libraries not yet in the catalogue."""
    __tablename__ = "tool_requests"

    id                   = Column(Integer, primary_key=True)
    submitted_name       = Column(String(255), nullable=False)
    normalized_name      = Column(String(255), nullable=True, index=True)
    source_context       = Column(String(50),  default="scanner")          # scanner | manual
    repo_url             = Column(String(500), nullable=True)
    submitted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status               = Column(String(20),  default="pending", index=True)  # pending | approved | rejected
    notes                = Column(Text, nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at          = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
