from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.database import Base


class UserActivity(Base):
    __tablename__ = "user_activity"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_id = Column(Integer, nullable=False)
    tool_name = Column(String, nullable=False)
    tool_category = Column(String, nullable=True)
    # Python-side default so we can update it when the same tool is re-viewed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
