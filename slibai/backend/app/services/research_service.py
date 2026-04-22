# Research Service — Sample-Based AI Library Usage Analysis
#
# METHODOLOGY:
#   This service performs SAMPLE-BASED ANALYSIS of AI library usage on GitHub.
#   It is NOT a census of all GitHub repositories.
#
#   Sampling strategy:
#     - Search query: "topic:<topic> language:python stars:>50"
#     - Topics: machine-learning, deep-learning, nlp, llm
#     - Per-topic limit: configurable (default 25 repos per topic)
#     - Only requirements.txt is checked per repo (fast and most common format)
#
#   Limitations:
#     - Results are representative of popular, well-maintained Python AI repos
#     - Repos with stars < 50 are excluded (reduces noise from toy/abandoned projects)
#     - Some repos may use conda or pyproject.toml — those are not counted
#     - GitHub API rate limit: 60 req/hr unauthenticated, 5000/hr with GITHUB_TOKEN
#
#   Assumptions:
#     - requirements.txt presence implies the library is actively used
#     - Star count >= 50 is a reasonable proxy for "real-world adoption"

import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "research_results.json"

GITHUB_API = "https://api.github.com"
_HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "SLIBAI-Research/1.0",
}
_TOKEN = os.getenv("GITHUB_TOKEN", "")
if _TOKEN:
    _HEADERS["Authorization"] = f"Bearer {_TOKEN}"

# ── Strict AI-Only Library Taxonomy ──────────────────────────────────────────
# Only true AI frameworks, models, and toolkits are included here.
# General-purpose scientific computing (numpy, pandas, pillow, scipy) and
# infrastructure libraries (requests, uvicorn, pytest) are intentionally excluded.

LIBRARY_TAXONOMY: dict[str, str] = {
    # ML Frameworks — core deep-learning runtimes
    "tensorflow":            "ML Frameworks",
    "torch":                 "ML Frameworks",
    "keras":                 "ML Frameworks",
    "jax":                   "ML Frameworks",
    "flax":                  "ML Frameworks",
    "paddlepaddle":          "ML Frameworks",
    "mxnet":                 "ML Frameworks",

    # Classical ML — purpose-built ML algorithm libraries
    "scikit-learn":          "Classical ML",
    "xgboost":               "Classical ML",
    "lightgbm":              "Classical ML",
    "catboost":              "Classical ML",

    # NLP / LLMs — language models, agents, and NLP toolkits
    "transformers":          "NLP / LLMs",
    "langchain":             "NLP / LLMs",
    "langgraph":             "NLP / LLMs",
    "langchain-core":        "NLP / LLMs",
    "langchain-community":   "NLP / LLMs",
    "openai":                "NLP / LLMs",
    "anthropic":             "NLP / LLMs",
    "tiktoken":              "NLP / LLMs",
    "sentence-transformers": "NLP / LLMs",
    "spacy":                 "NLP / LLMs",
    "nltk":                  "NLP / LLMs",
    "allennlp":              "NLP / LLMs",
    "haystack":              "NLP / LLMs",
    "farm-haystack":         "NLP / LLMs",
    "cohere":                "NLP / LLMs",
    "llama-index":           "NLP / LLMs",
    "peft":                  "NLP / LLMs",
    "trl":                   "NLP / LLMs",
    "bitsandbytes":          "NLP / LLMs",

    # Computer Vision / Multimodal — vision models and CV frameworks
    "opencv-python":         "Computer Vision",
    "ultralytics":           "Computer Vision",
    "mediapipe":             "Computer Vision",
    "diffusers":             "Computer Vision",
    "detectron2":            "Computer Vision",
    "mmcv":                  "Computer Vision",
    "timm":                  "Computer Vision",

    # Speech & Audio AI — speech recognition and audio AI
    "whisper":               "Speech & Audio AI",
    "openai-whisper":        "Speech & Audio AI",
    "faster-whisper":        "Speech & Audio AI",
    "whisperx":              "Speech & Audio AI",
    "speechbrain":           "Speech & Audio AI",
    "vosk":                  "Speech & Audio AI",
    "pyannote-audio":        "Speech & Audio AI",

    # AI Data & Vector — vector databases and semantic search
    "faiss-cpu":             "AI Data & Vector",
    "faiss-gpu":             "AI Data & Vector",
    "faiss":                 "AI Data & Vector",
    "chromadb":              "AI Data & Vector",
    "pinecone-client":       "AI Data & Vector",
    "pinecone":              "AI Data & Vector",
    "weaviate-client":       "AI Data & Vector",
    "pymilvus":              "AI Data & Vector",

    # MLOps & Serving — experiment tracking, deployment, inference
    "mlflow":                "MLOps & Serving",
    "wandb":                 "MLOps & Serving",
    "ray":                   "MLOps & Serving",
    "deepspeed":             "MLOps & Serving",
    "onnxruntime":           "MLOps & Serving",
    "onnx":                  "MLOps & Serving",
    "openvino":              "MLOps & Serving",
    "bentoml":               "MLOps & Serving",
    "vllm":                  "MLOps & Serving",
    "llama-cpp-python":      "MLOps & Serving",
    "ctransformers":         "MLOps & Serving",
    "triton":                "MLOps & Serving",
}

# ── Import-name → canonical PyPI name aliases ─────────────────────────────────
# Maps common import names / variant spellings to their canonical taxonomy key.
# Applied after underscore→hyphen normalization in the scan loop.

_ALIASES: dict[str, str] = {
    "sklearn":  "scikit-learn",
    "cv2":      "opencv-python",
    "pytorch":  "torch",
}

# ── GitHub search queries for sampling ───────────────────────────────────────
SEARCH_QUERIES = [
    "topic:machine-learning language:python stars:>50",
    "topic:deep-learning language:python stars:>50",
    "topic:nlp language:python stars:>50",
    "topic:llm language:python stars:>50",
]

# ── Scan Progress Tracking ────────────────────────────────────────────────────
# Simple in-process progress dict — no Redis/Celery needed for demo purposes.
# Thread-safe via _progress_lock; readers get a snapshot via get_progress().

_progress_lock = threading.Lock()
_progress: dict = {
    "running":           False,
    "current_stage":     "",
    "queries_total":     len(SEARCH_QUERIES),
    "queries_completed": 0,
    "repos_total":       0,
    "repos_scanned":     0,
    "current_query":     None,
    "started_at":        None,
    "finished_at":       None,
    "error":             None,
}


def get_progress() -> dict:
    """Return a thread-safe snapshot of the current scan progress."""
    with _progress_lock:
        return dict(_progress)


def _set(**kwargs) -> None:
    """Update one or more progress fields atomically."""
    with _progress_lock:
        _progress.update(kwargs)


# ── GitHub helpers ────────────────────────────────────────────────────────────

def _search_repos(query: str, per_page: int = 25) -> list[dict]:
    """Search GitHub for repos matching a query. Returns list of {owner, repo, stars}."""
    try:
        r = requests.get(
            f"{GITHUB_API}/search/repositories",
            headers=_HEADERS,
            params={"q": query, "sort": "stars", "order": "desc", "per_page": per_page},
            timeout=15,
        )
        r.raise_for_status()
        items = r.json().get("items", [])
        return [
            {"owner": i["owner"]["login"], "repo": i["name"], "stars": i["stargazers_count"]}
            for i in items
        ]
    except Exception as e:
        print(f"[Research] Search failed for '{query}': {e}")
        return []


def _fetch_requirements(owner: str, repo: str) -> str | None:
    """Fetch raw requirements.txt content. Returns None if absent or on error."""
    try:
        import base64
        r = requests.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/requirements.txt",
            headers=_HEADERS,
            timeout=10,
        )
        if r.status_code == 200:
            return base64.b64decode(r.json()["content"]).decode("utf-8", errors="ignore")
        return None
    except Exception:
        return None


def _parse_requirements(text: str) -> list[str]:
    """Extract normalized library names from requirements.txt content."""
    libs = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "-", "git+", "http")):
            continue
        name = re.split(r"[>=<!~\[\s;]", line)[0].strip().lower()
        if name:
            libs.append(name)
    return libs


def _respect_rate_limit(headers: dict) -> None:
    remaining = int(headers.get("X-RateLimit-Remaining", 10))
    if remaining < 5:
        reset_at = int(headers.get("X-RateLimit-Reset", time.time() + 60))
        sleep_for = max(1, reset_at - time.time() + 2)
        print(f"[Research] Rate limit low ({remaining} left) — sleeping {sleep_for:.0f}s")
        time.sleep(min(sleep_for, 120))
    else:
        time.sleep(0.4)  # gentle pacing


# ── Main scan ─────────────────────────────────────────────────────────────────

def run_research_scan(repos_per_query: int = 25) -> dict:
    """
    Run a sample-based analysis of AI library usage across GitHub repos.

    Methodology:
      - Searches GitHub using 4 topic-based queries (machine-learning, deep-learning, nlp, llm)
      - Samples up to `repos_per_query` repositories per query (default 25, max 100)
      - Fetches requirements.txt from each repo
      - Counts occurrences of libraries listed in LIBRARY_TAXONOMY
      - Results are saved to research_results.json

    Progress is tracked in _progress and readable via get_progress() at any time.
    """
    _set(
        running=True,
        current_stage="Starting scan",
        queries_total=len(SEARCH_QUERIES),
        queries_completed=0,
        repos_total=0,
        repos_scanned=0,
        current_query=None,
        started_at=datetime.now(timezone.utc).isoformat(),
        finished_at=None,
        error=None,
    )
    print(f"[Research] Starting sample-based analysis — {len(SEARCH_QUERIES)} queries × up to {repos_per_query} repos each")

    try:
        seen_repos: set[str] = set()
        repos_with_reqs = 0          # repos that actually had requirements.txt
        lib_counts: dict[str, int] = {}
        lib_categories: dict[str, str] = {}

        for qi, query in enumerate(SEARCH_QUERIES):
            _set(current_stage="Searching GitHub", current_query=query)
            print(f"[Research] Query {qi + 1}/{len(SEARCH_QUERIES)}: {query}")

            repos = _search_repos(query, per_page=min(repos_per_query, 100))

            # Expand repos_total with newly discovered repos (deduplicated)
            new_repos = [r for r in repos if f"{r['owner']}/{r['repo']}" not in seen_repos]
            with _progress_lock:
                _progress["repos_total"] += len(new_repos)

            _set(current_stage=f"Scanning repos — query {qi + 1}/{len(SEARCH_QUERIES)}")

            for repo_info in repos:
                key = f"{repo_info['owner']}/{repo_info['repo']}"
                if key in seen_repos:
                    continue
                seen_repos.add(key)

                # Advance scanned counter whether or not requirements.txt exists
                with _progress_lock:
                    _progress["repos_scanned"] += 1

                req_text = _fetch_requirements(repo_info["owner"], repo_info["repo"])
                if not req_text:
                    time.sleep(0.4)
                    continue

                repos_with_reqs += 1
                libs_in_repo = _parse_requirements(req_text)

                # One repo contributes at most 1 to each library's count.
                # Normalize underscores → hyphens, then apply explicit aliases
                # (e.g. sklearn → scikit-learn, cv2 → opencv-python).
                for lib in set(libs_in_repo):
                    canonical = lib.replace("_", "-")
                    canonical = _ALIASES.get(canonical, canonical)
                    if canonical in LIBRARY_TAXONOMY:
                        lib_counts[canonical] = lib_counts.get(canonical, 0) + 1
                        lib_categories[canonical] = LIBRARY_TAXONOMY[canonical]

                time.sleep(0.4)  # gentle pacing to avoid rate-limit spikes

            _set(queries_completed=qi + 1)
            if qi < len(SEARCH_QUERIES) - 1:
                time.sleep(1.5)  # pause between search queries

        _set(current_stage="Saving results")
        print(f"[Research] Scanned {repos_with_reqs} repos with requirements.txt, found {len(lib_counts)} taxonomy libraries")

        sorted_libs = sorted(lib_counts.items(), key=lambda x: x[1], reverse=True)
        results = [
            {
                "rank":       i + 1,
                "name":       name,
                "count":      count,
                "percentage": round(count / repos_with_reqs * 100, 1) if repos_with_reqs else 0,
                "category":   lib_categories.get(name, "Other"),
            }
            for i, (name, count) in enumerate(sorted_libs)
        ]

        output = {
            "scan_date":     datetime.now(timezone.utc).isoformat(),
            "repos_scanned": repos_with_reqs,
            "unique_libs":   len(lib_counts),

            "methodology": (
                "Sample-based analysis using the GitHub Search API (REST v3). "
                "Four topic-based queries were executed — machine-learning, deep-learning, nlp, llm — "
                f"each returning up to {repos_per_query} repositories sorted by star count descending. "
                "Only Python repositories with ≥ 50 GitHub stars were included. "
                "requirements.txt was fetched from each repository and parsed to extract dependency names. "
                "Library counts reflect unique per-repository occurrences (one repo contributes at most 1 "
                "to each library's count). Results represent the sampled population — not all GitHub."
            ),

            "data_source": (
                "GitHub REST API v3 — /search/repositories (query + filter) and "
                "/repos/{owner}/{repo}/contents/requirements.txt (dependency extraction)"
            ),

            "limitations": [
                "Coverage is restricted to repositories with GitHub star count ≥ 50 — "
                "smaller or private projects are not represented",
                "Only requirements.txt is parsed; conda environment.yml and pyproject.toml "
                "repositories are excluded from the count",
                "GitHub Search API returns a maximum of 1 000 results per query regardless "
                "of total matching repositories",
                "Results are a point-in-time snapshot; library popularity trends over time "
                "are not captured",
                "Topic tags on GitHub are user-assigned and may be inconsistent or missing",
            ],

            "assumptions": [
                "Presence of a library in requirements.txt indicates it is actively used "
                "in the project (not just a transitive or optional dependency)",
                "GitHub star count ≥ 50 is a reasonable proxy for non-trivial, actively "
                "maintained real-world projects",
                "Python-tagged repositories are broadly representative of the Python "
                "ML/AI ecosystem",
                "Each unique (owner, repo) pair is counted at most once, so highly-starred "
                "repositories do not disproportionately inflate counts",
                "Library names in requirements.txt match their canonical PyPI install name "
                "(after underscore → hyphen normalisation)",
            ],

            "results": results,
        }

        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)

        _set(
            running=False,
            current_stage="Complete",
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
        print(f"[Research] Results saved to {DATA_FILE}")
        return output

    except Exception as e:
        err_msg = str(e)
        _set(
            running=False,
            current_stage="Failed",
            error=err_msg,
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
        print(f"[Research] Scan failed: {err_msg}")
        raise


def load_results() -> dict | None:
    """Load the last saved research results. Returns None if no scan has been run."""
    if not DATA_FILE.exists():
        return None
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None
