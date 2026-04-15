from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class ReportCreate(BaseModel):
    tool_id:    int
    tool_name:  str
    issue_type: Literal["incorrect_info", "broken_link", "outdated_data", "other"]
    description: Optional[str] = None


class ReportResponse(BaseModel):
    id:          int
    user_id:     int
    tool_id:     int
    tool_name:   str
    issue_type:  str
    description: Optional[str] = None
    status:      str
    created_at:  datetime

    model_config = {"from_attributes": True}


class AdminReportResponse(BaseModel):
    id:          int
    user_id:     int
    user_name:   Optional[str] = None
    user_email:  str
    tool_id:     int
    tool_name:   str
    issue_type:  str
    description: Optional[str] = None
    status:      str
    created_at:  datetime

    model_config = {"from_attributes": True}
