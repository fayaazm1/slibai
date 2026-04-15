from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class UserBookmark(Base):
    __tablename__ = "user_bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_id = Column(Integer, nullable=False)
    tool_name = Column(String, nullable=False)
    tool_category = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
