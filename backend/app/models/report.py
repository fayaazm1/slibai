from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from app.database import Base


class ToolReport(Base):
    __tablename__ = "tool_reports"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_id     = Column(Integer, nullable=False)
    tool_name   = Column(String, nullable=False)
    issue_type  = Column(String, nullable=False)   # incorrect_info | broken_link | outdated_data | other
    description = Column(Text, nullable=True)
    status      = Column(String, default="pending")  # pending | resolved
    created_at  = Column(DateTime, default=datetime.utcnow)
