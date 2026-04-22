# Repo AI Stack Scanner — POST /scan
#
# Accepts a GitHub repo URL, fetches its dependency files via the GitHub API,
# parses library names, and matches them against the SLIBai tool catalogue.
#
# Files fetched (best-effort — silently skipped if absent):
#   requirements.txt, setup.py, pyproject.toml,
#   package.json, Pipfile, environment.yml

import os
import re
import time
from difflib import SequenceMatcher
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.scan_log import ScanLog
from app.models.tool import Tool
from app.models.tool_request import ToolRequest
from app.models.user import User

router = APIRouter(prefix="/scan", tags=["scan"])

# Module-level rate limit state — shared across all requests in the same process.
# Avoids hammering GitHub after a 403 by refusing further fetches until reset time.
_rate_limit_reset: float = 0.0

# Infrastructure and utility packages that commonly appear in AI repo dependency
# files but are NOT AI tools — skipping them before catalogue matching prevents
# false positives and keeps results clean.
_SKIP_LIBS = {
    # Web frameworks / ASGI-WSGI servers
    "fastapi", "flask", "django", "uvicorn", "starlette", "gunicorn",
    "tornado", "sanic", "hypercorn",
    # HTTP clients and networking
    "requests", "httpx", "aiohttp", "urllib3", "httpcore",
    # Data validation / serialisation
    "pydantic", "marshmallow", "cerberus",
    # Databases, ORMs, caching
    "sqlalchemy", "alembic", "psycopg2", "psycopg2-binary", "pymysql",
    "redis", "pymongo", "motor", "databases",
    # Cloud / storage SDKs
    "boto3", "botocore", "google-cloud-storage", "azure-storage-blob",
    # Dev tools — linting, testing, formatting
    "pytest", "black", "flake8", "mypy", "isort", "pre-commit",
    "pylint", "bandit", "coverage", "pytest-cov",
    # CLI, logging, progress
    "click", "typer", "rich", "tqdm", "loguru", "colorama",
    # Config and environment
    "python-dotenv", "pyyaml", "toml", "tomli", "configparser", "dynaconf",
    # Build and packaging
    "packaging", "setuptools", "wheel", "build", "pip",
    # Crypto and general utilities
    "cryptography", "certifi", "six", "attrs", "urllib3",
    "paramiko", "fabric",
    # Ambiguous single-word names that are too generic to match meaningfully
    "audio", "video", "vision", "text", "data", "core", "utils",
    "retrieval", "serving", "benchmark", "evaluation", "testing",
    "common", "helpers", "tools",
    # Misc
    "__main__", "safetensors",
}

GITHUB_API = "https://api.github.com"
_HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "SLIBAI-Scanner/1.0",
}
_TOKEN = os.getenv("GITHUB_TOKEN", "")
if _TOKEN:
    _HEADERS["Authorization"] = f"Bearer {_TOKEN}"

# ── Known import-name → canonical PyPI/npm name aliases ─────────────────────
# Many libraries are imported under a different name than their install name.
# This map normalizes both sides before matching.
_ALIASES: dict[str, str] = {
    "torch":          "pytorch",
    "cv2":            "opencv",
    "sklearn":        "scikit-learn",
    "skimage":        "scikit-image",
    "PIL":            "pillow",
    "bs4":            "beautifulsoup4",
    "tf":             "tensorflow",
    "jnp":            "jax",
    "mx":             "mxnet",
    "xgb":            "xgboost",
    "lgb":            "lightgbm",
    "spacy":          "spacy",
    "nltk":           "nltk",
    "transformers":   "hugging face transformers",
    "datasets":       "hugging face transformers",
    "diffusers":      "diffusers",
    "langchain":      "langchain",
    "openai":         "openai api",
    "anthropic":      "anthropic",
    "pinecone":       "pinecone",
    "chromadb":       "chroma",
    "weaviate":       "weaviate",
    "faiss":          "faiss",
    "mlflow":         "mlflow",
    "wandb":          "weights & biases",
    "ray":            "ray",
    "bentoml":        "bentoml",
    "triton":         "triton",
    "onnxruntime":    "onnx",
    "onnx":           "onnx",
}


# ── URL parsing ──────────────────────────────────────────────────────────────

def _parse_repo(url: str) -> tuple[str, str]:
    """Extract owner and repo name from a GitHub URL. Raises ValueError on bad input."""
    url = url.strip().rstrip("/")
    # accept: https://github.com/owner/repo  or  github.com/owner/repo
    m = re.search(r"github\.com/([^/]+)/([^/\s]+)", url)
    if not m:
        raise ValueError(f"Could not parse GitHub owner/repo from: {url}")
    owner = m.group(1)
    repo  = m.group(2).removesuffix(".git")
    return owner, repo


# ── Dependency file fetchers ─────────────────────────────────────────────────

def _fetch_file(owner: str, repo: str, path: str) -> str | None:
    """
    Fetch a single file via GitHub Contents API.

    Returns the decoded text content, or None if the file is missing or any
    error occurs — a missing file is normal and should never abort the scan.
    Retries once on 5xx errors. Tracks rate-limit reset time on 403.
    """
    global _rate_limit_reset

    # Abort early if we know the rate limit hasn't reset yet
    if _rate_limit_reset and time.time() < _rate_limit_reset:
        return None

    for attempt in range(2):
        try:
            r = requests.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
                headers=_HEADERS,
                timeout=10,
            )
            if r.status_code == 200:
                import base64
                data = r.json()
                return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
            if r.status_code == 403:
                reset_ts  = r.headers.get("X-RateLimit-Reset", "")
                remaining = r.headers.get("X-RateLimit-Remaining", "?")
                if reset_ts:
                    _rate_limit_reset = float(reset_ts)
                print(f"[Scan] GitHub rate limit hit (remaining={remaining}, reset={reset_ts})")
                return None
            if r.status_code >= 500 and attempt == 0:
                time.sleep(1)
                continue
            return None
        except requests.Timeout:
            print(f"[Scan] Timeout fetching {owner}/{repo}/{path}")
            return None
        except Exception as e:
            print(f"[Scan] Error fetching {owner}/{repo}/{path}: {e}")
            return None
    return None


# ── Dependency parsers ───────────────────────────────────────────────────────

def _parse_requirements_txt(text: str) -> list[str]:
    libs = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "-", "git+", "http")):
            continue
        # strip version specifiers and extras: torch>=1.8.0[cuda] → torch
        name = re.split(r"[>=<!~\[\s;]", line)[0].strip()
        if name:
            libs.append(name.lower())
    return libs


def _parse_package_json(text: str) -> list[str]:
    import json
    try:
        data = json.loads(text)
        deps: dict = {}
        deps.update(data.get("dependencies", {}))
        deps.update(data.get("devDependencies", {}))
        return [k.lower() for k in deps]
    except Exception:
        return []


def _parse_pyproject_toml(text: str) -> list[str]:
    libs = []
    in_deps = False
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r'\[.*dependencies.*\]', stripped, re.IGNORECASE):
            in_deps = True
            continue
        if stripped.startswith("[") and in_deps:
            in_deps = False
        if in_deps and "=" in stripped:
            name = stripped.split("=")[0].strip().strip('"').strip("'")
            if name and not name.startswith("#"):
                libs.append(re.split(r"[>=<!~\[\s]", name)[0].lower())
    return libs


def _parse_pipfile(text: str) -> list[str]:
    libs = []
    in_packages = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped in ("[packages]", "[dev-packages]"):
            in_packages = True
            continue
        if stripped.startswith("[") and in_packages:
            in_packages = False
        if in_packages and "=" in stripped:
            name = stripped.split("=")[0].strip()
            if name and not name.startswith("#"):
                libs.append(name.lower())
    return libs


def _parse_environment_yml(text: str) -> list[str]:
    libs = []
    in_deps = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == "dependencies:":
            in_deps = True
            continue
        if in_deps and stripped.startswith("- "):
            raw = stripped[2:].strip()
            # skip pip sub-block header and conda channel specs
            if raw == "pip:" or "::" in raw:
                continue
            # strip version: numpy=1.21 or numpy>=1.21
            name = re.split(r"[>=<!~\s]", raw)[0].strip()
            if name:
                libs.append(name.lower())
        elif in_deps and not stripped.startswith("-") and stripped and not stripped.startswith("#"):
            in_deps = False
    return libs


def _fetch_all_deps(owner: str, repo: str) -> tuple[list[str], list[str]]:
    """
    Fetch all supported dependency files and return (raw_libs, files_found).
    Each file is attempted independently — a missing file is silently skipped.
    """
    fetchers: list[tuple[str, callable]] = [
        ("requirements.txt",  _parse_requirements_txt),
        ("requirements/base.txt", _parse_requirements_txt),
        ("requirements/prod.txt", _parse_requirements_txt),
        ("setup.py",          lambda t: re.findall(r'["\']([a-zA-Z0-9_\-]+)["\']', t)),
        ("pyproject.toml",    _parse_pyproject_toml),
        ("package.json",      _parse_package_json),
        ("Pipfile",           _parse_pipfile),
        ("environment.yml",   _parse_environment_yml),
    ]

    all_libs: list[str] = []
    found_files: list[str] = []

    for path, parser in fetchers:
        text = _fetch_file(owner, repo, path)
        if text:
            found_files.append(path)
            all_libs.extend(parser(text))

    # deduplicate while preserving first-seen order
    seen: set[str] = set()
    unique: list[str] = []
    for lib in all_libs:
        if lib and lib not in seen:
            seen.add(lib)
            unique.append(lib)

    return unique, found_files


# ── Catalogue matching ───────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    """Lowercase and remove separators for comparison. No suffix stripping to avoid false positives."""
    s = s.lower().strip()
    s = re.sub(r"[-_\.\s]+", "", s)  # drop separators only
    return s


def _match_library(lib: str, tools: list[dict]) -> dict | None:
    """
    Match a dependency name against the SLIBai tool catalogue.

    Two-pass strategy — deliberately conservative to avoid false positives:

    Pass 1 — Exact name match after normalization (strips separators only).
              Alias lookup via _ALIASES maps common import names (torch → pytorch,
              cv2 → opencv, sklearn → scikit-learn) to their canonical install names
              before matching.  Confidence: 1.0 (direct) or 0.9 (via alias).

    Pass 2 — High-confidence fuzzy match (SequenceMatcher ratio ≥ 0.92).
              Only runs for names ≥ 6 characters to avoid short strings producing
              accidental near-matches.  Confidence: the raw ratio value.

    Substring matching was intentionally removed: it produced too many false
    positives (e.g. a library containing "light" substring matching a tool whose
    tag happened to include that word).  The _ALIASES table is the correct and
    explicit mechanism for import-name aliasing.
    """
    norm_lib  = _normalize(lib)
    alias_lib = _normalize(_ALIASES.get(lib, _ALIASES.get(lib.lower(), lib)))

    for tool in tools:
        norm_name = _normalize(tool["name"])

        # Pass 1 — exact normalized match (most reliable signal)
        if norm_lib == norm_name:
            return {"library": lib, "tool_id": tool["id"], "tool_name": tool["name"], "confidence": 1.0}
        if alias_lib == norm_name:
            return {"library": lib, "tool_id": tool["id"], "tool_name": tool["name"], "confidence": 0.9}

        # Pass 2 — tight fuzzy match; threshold 0.92 means only ~1 char difference
        # is tolerated in short names, preventing near-miss false positives
        if len(norm_lib) >= 6:
            ratio = SequenceMatcher(None, norm_lib, norm_name).ratio()
            if ratio >= 0.92:
                return {"library": lib, "tool_id": tool["id"], "tool_name": tool["name"], "confidence": round(ratio, 2)}

    return None


# ── Request / Response schemas ───────────────────────────────────────────────

class ScanRequest(BaseModel):
    repo_url: str


class MatchedLib(BaseModel):
    library:   str
    tool_id:   int
    tool_name: str
    confidence: float


class UnmatchedLib(BaseModel):
    library: str


class ScanResponse(BaseModel):
    repo_url:              str
    files_found:           list[str]
    total_found:           int
    matched:               list[MatchedLib]
    not_matched:           list[UnmatchedLib]
    scan_duration_ms:      int
    no_dependency_files:   bool = False


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("", response_model=ScanResponse)
def scan_repo(body: ScanRequest, db: Session = Depends(get_db)):
    """
    Scan a GitHub repository's dependency files and match found libraries
    against the SLIBai AI tool catalogue.
    """
    # Fail fast with a clear message if GitHub has rate-limited us
    if _rate_limit_reset and time.time() < _rate_limit_reset:
        wait_sec = int(_rate_limit_reset - time.time()) + 1
        raise HTTPException(
            status_code=429,
            detail=f"GitHub API rate limit reached. Please wait ~{wait_sec}s and try again.",
        )

    start = time.time()

    try:
        owner, repo_name = _parse_repo(body.repo_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    libs, files_found = _fetch_all_deps(owner, repo_name)

    if not libs and not files_found:
        raise HTTPException(
            status_code=404,
            detail="No supported dependency files found. Make sure the repository is public and has "
                   "requirements.txt, package.json, pyproject.toml, Pipfile, or environment.yml.",
        )

    # load only active catalogue tools for matching
    rows = db.query(Tool).filter(Tool.is_active.isnot(False)).all()
    catalogue = [
        {"id": r.id, "name": r.name, "developer": r.developer or "", "tags": r.tags or []}
        for r in rows
    ]

    matched:     list[MatchedLib]   = []
    not_matched: list[UnmatchedLib] = []

    for lib in libs:
        if lib in _SKIP_LIBS:
            not_matched.append(UnmatchedLib(library=lib))
            continue
        result = _match_library(lib, catalogue)
        if result:
            matched.append(MatchedLib(**result))
        else:
            not_matched.append(UnmatchedLib(library=lib))

    # log scan metadata to DB for research analytics
    try:
        log = ScanLog(
            repo_url=body.repo_url,
            total_found=len(libs),
            matched_count=len(matched),
            not_matched_count=len(not_matched),
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()  # log failure must never break the scan response

    duration_ms = int((time.time() - start) * 1000)

    return ScanResponse(
        repo_url=body.repo_url,
        files_found=files_found,
        total_found=len(libs),
        matched=matched,
        not_matched=not_matched,
        scan_duration_ms=duration_ms,
    )


# ── Tool Request submission (signed-in users only) ────────────────────────────

class ToolRequestBody(BaseModel):
    submitted_name: str
    repo_url: Optional[str] = None


@router.post("/request", status_code=201)
def submit_tool_request(
    body: ToolRequestBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a request to add a library to the SLIBai catalogue."""
    name = body.submitted_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="submitted_name is required.")

    normalized = re.sub(r"[-_\s]+", "-", name.lower())

    # Dedup: same user, same name, still pending
    existing = db.query(ToolRequest).filter(
        ToolRequest.normalized_name == normalized,
        ToolRequest.submitted_by_user_id == current_user.id,
        ToolRequest.status == "pending",
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"You already have a pending request for '{existing.submitted_name}'.",
        )

    req = ToolRequest(
        submitted_name=name,
        normalized_name=normalized,
        source_context="scanner",
        repo_url=body.repo_url,
        submitted_by_user_id=current_user.id,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"message": f"Request for '{name}' submitted successfully.", "id": req.id}
