from pydantic import BaseModel, Field
from typing import Optional, List, Any


class CodeGenRequest(BaseModel):
    use_case: str = Field(..., description=(
        "chatbot | image_classification | text_summarization | "
        "speech_to_text | ai_agent | semantic_search | document_qa | recommendation_system"
    ))
    language: str = Field(..., description="python | javascript | typescript | java | cpp")
    skill_level: Optional[str] = Field("intermediate", description="beginner | intermediate | advanced")
    code_style: Optional[str] = Field("functional", description="functional | oop | async")


class CodeGenResponse(BaseModel):
    supported: bool
    use_case: str
    use_case_label: str
    language: str
    language_label: str
    skill_level: str
    tool_name: Optional[str]
    install_command: Optional[str]
    code: Optional[str]
    explanation: str
    notes: List[str]
    related_tools: List[Any]
