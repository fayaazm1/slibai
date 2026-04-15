from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class BookmarkCreate(BaseModel):
    tool_id: int
    tool_name: str
    tool_category: Optional[str] = None


class BookmarkResponse(BaseModel):
    id: int
    tool_id: int
    tool_name: str
    tool_category: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityLog(BaseModel):
    tool_id: int
    tool_name: str
    tool_category: Optional[str] = None


class ActivityResponse(BaseModel):
    id: int
    tool_id: int
    tool_name: str
    tool_category: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UseCaseCreate(BaseModel):
    title: str
    description: Optional[str] = None


class UseCaseResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
