from pydantic import BaseModel
from typing import Optional


class CodeGenRequest(BaseModel):
    tool_name: str
    language: str                    # python | javascript | typescript | java | cpp
    use_case: Optional[str] = None
    # optional tool metadata — used to write a better-targeted prompt
    category: Optional[str] = None
    tool_function: Optional[str] = None


class CodeGenResponse(BaseModel):
    install_command: Optional[str]
    code: str
    explanation: str


class CodeExplainRequest(BaseModel):
    code: str
    language: str
    tool_name: str


class CodeExplainResponse(BaseModel):
    explanation: str
