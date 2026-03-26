from pydantic import BaseModel
from typing import Optional


class AITool(BaseModel):
    id: int
    name: str
    category: str
    function: str
    description: str
    developer: Optional[str] = ""
    version: Optional[str] = ""
    cost: Optional[str] = ""
    compatibility: Optional[str] = ""
    dependencies: Optional[str] = ""
    social_impact: Optional[str] = ""
    example_code: Optional[str] = ""
    official_url: Optional[str] = ""