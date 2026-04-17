import os
import json
import re
import time
import logging

from google import genai
from google.genai import errors as genai_errors
from fastapi import APIRouter, HTTPException

from app.schemas.codegen import (
    CodeGenRequest, CodeGenResponse,
    CodeExplainRequest, CodeExplainResponse,
)

router = APIRouter(prefix="/codegen", tags=["codegen"])
logger = logging.getLogger(__name__)

MODEL = "gemini-2.5-flash"

# simple in-memory caches — reset on server restart, fine for a capstone
_gen_cache: dict[str, CodeGenResponse] = {}
_explain_cache: dict[str, CodeExplainResponse] = {}
_CACHE_MAX = 100  # clear both caches when either hits this limit to prevent memory growth

_LANG_LABELS = {
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "java": "Java",
    "cpp": "C++",
}

_FILE_EXTENSIONS = {
    "python": "py",
    "javascript": "js",
    "typescript": "ts",
    "java": "java",
    "cpp": "cpp",
}


def _cache_key(tool_name: str, language: str, use_case: str | None) -> str:
    return f"{tool_name.lower()}:{language.lower()}:{(use_case or '').lower().strip()}"


def _build_gen_prompt(
    tool_name: str,
    language: str,
    use_case: str | None,
    category: str | None,
    tool_function: str | None,
) -> str:
    lang_label = _LANG_LABELS.get(language.lower(), language)

    # build a rich context block so Gemini understands the tool better
    context_lines = [f"Tool / library: {tool_name}"]
    if category:
        context_lines.append(f"Category: {category}")
    if tool_function:
        context_lines.append(f"Primary function: {tool_function}")
    context_lines.append(f"Target language: {lang_label}")
    if use_case:
        context_lines.append(f"Use case / goal: {use_case}")
    else:
        context_lines.append("Use case / goal: general getting-started example")

    context = "\n".join(context_lines)

    return f"""You are a senior software engineer writing high-quality example code for a developer library directory.

{context}

Return ONLY valid JSON with no markdown fences and no extra text, shaped exactly like this:
{{
  "install_command": "<the correct pip / npm / maven / gradle install command, or null if no install is needed>",
  "code": "<a complete, working, well-commented code snippet — include all necessary imports at the top, use modern non-deprecated APIs, and make the code realistically runnable>",
  "explanation": "<2-4 sentences: what the code does, any prerequisites, and one practical tip for using this library>"
}}

Requirements for the code field:
- Always include import statements at the top
- Use the current stable API — avoid deprecated calls
- Keep it focused: 15-40 lines is ideal
- Add short inline comments on non-obvious lines
- If the library does not natively support {lang_label}, set code to a clear note explaining that and set install_command to null
"""


def _build_explain_prompt(code: str, language: str, tool_name: str) -> str:
    lang_label = _LANG_LABELS.get(language.lower(), language)
    return f"""You are explaining a {lang_label} code snippet that uses the {tool_name} library to a developer.

Code:
```
{code}
```

Write a plain-English explanation in 3-5 bullet points. Each bullet should cover:
- What a specific part of the code does
- Why it is written that way
- Any gotchas or important notes

Return ONLY a JSON object like this — no markdown fences:
{{
  "explanation": "<bullet points as a single string, each bullet separated by \\n• >"
}}
"""


def _call_gemini(client: genai.Client, prompt: str, retries: int = 3) -> str:
    """Call Gemini with exponential back-off on 503 errors."""
    for attempt in range(1, retries + 1):
        try:
            logger.info("Gemini request — model=%s attempt=%d", MODEL, attempt)
            response = client.models.generate_content(model=MODEL, contents=prompt)
            return response.text.strip()
        except genai_errors.ClientError as e:
            if "429" in str(e) or "quota" in str(e).lower():
                logger.warning("Gemini 429 quota exceeded")
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Gemini API quota exceeded — you have hit the free-tier rate limit. "
                        "Please wait a minute and try again."
                    ),
                )
            raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")
        except genai_errors.ServerError as e:
            if attempt < retries:
                wait = 2 ** attempt
                logger.warning("Gemini 503 attempt %d — retrying in %ds", attempt, wait)
                time.sleep(wait)
                continue
            raise HTTPException(
                status_code=503,
                detail="Gemini is temporarily unavailable. Please try again in a moment.",
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")


def _parse_json(raw: str) -> dict:
    """Strip accidental markdown fences and parse JSON."""
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Gemini returned non-JSON: %s", raw[:300])
        raise HTTPException(status_code=502, detail="Gemini returned malformed output. Please try again.")


@router.post("/generate", response_model=CodeGenResponse)
def generate_code(body: CodeGenRequest):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")

    # check cache first
    key = _cache_key(body.tool_name, body.language, body.use_case)
    if key in _gen_cache:
        logger.info("Cache hit — tool=%s language=%s", body.tool_name, body.language)
        return _gen_cache[key]

    logger.info("Code generation request — tool=%s language=%s", body.tool_name, body.language)

    client = genai.Client(api_key=api_key)
    prompt = _build_gen_prompt(
        body.tool_name, body.language, body.use_case,
        body.category, body.tool_function,
    )
    raw = _call_gemini(client, prompt)
    data = _parse_json(raw)

    result = CodeGenResponse(
        install_command=data.get("install_command"),
        code=data.get("code", ""),
        explanation=data.get("explanation", ""),
    )

    if len(_gen_cache) >= _CACHE_MAX:
        _gen_cache.clear()
        logger.info("Generation cache cleared (hit %d entry limit)", _CACHE_MAX)
    _gen_cache[key] = result
    logger.info("Code generation succeeded — tool=%s language=%s", body.tool_name, body.language)
    return result


@router.post("/explain", response_model=CodeExplainResponse)
def explain_code(body: CodeExplainRequest):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")

    # cache explain results by a hash of the code + language so repeated clicks are instant
    explain_key = f"{body.tool_name.lower()}:{body.language.lower()}:{hash(body.code)}"
    if explain_key in _explain_cache:
        logger.info("Explain cache hit — tool=%s language=%s", body.tool_name, body.language)
        return _explain_cache[explain_key]

    logger.info("Explain request — tool=%s language=%s", body.tool_name, body.language)

    client = genai.Client(api_key=api_key)
    prompt = _build_explain_prompt(body.code, body.language, body.tool_name)
    raw = _call_gemini(client, prompt)
    data = _parse_json(raw)

    result = CodeExplainResponse(explanation=data.get("explanation", ""))

    if len(_explain_cache) >= _CACHE_MAX:
        _explain_cache.clear()
        logger.info("Explain cache cleared (hit %d entry limit)", _CACHE_MAX)
    _explain_cache[explain_key] = result
    return result
