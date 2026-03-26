# Pulls AI/ML tool data from GitHub using their Search API.
# Only repos that are actual developer tools — libraries, frameworks, SDKs,
# model runtimes, etc. Courses, tutorials, awesome lists and demo apps are
# filtered out before anything hits the database.
#
# Set GITHUB_TOKEN in your environment to get 5000 req/hr instead of 60.

import os
import time
import requests

GITHUB_API = "https://api.github.com"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

_HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "SLIBAI-Crawler/1.0",
}
if GITHUB_TOKEN:
    _HEADERS["Authorization"] = f"Bearer {GITHUB_TOKEN}"

# Topics focused on actual developer tools — not educational content
TOPICS = [
    "llm",
    "large-language-model",
    "natural-language-processing",
    "computer-vision",
    "speech-recognition",
    "text-to-speech",
    "mlops",
    "model-serving",
    "vector-database",
    "fine-tuning",
    "diffusion-models",
    "ai-agents",
    "rag",
    "object-detection",
    "deep-learning",
]

# Any repo whose name or description contains one of these words gets skipped.
# This is how we avoid pulling in courses, guides, awesome lists, etc.
_EXCLUDE_KEYWORDS = {
    "tutorial", "tutorials", "course", "courses", "beginner", "beginners",
    "awesome", "guide", "guides", "roadmap", "learn", "learning", "book",
    "handbook", "cheatsheet", "cheat-sheet", "playbook", "notes", "syllabus",
    "lecture", "lectures", "workshop", "examples", "demo", "demos",
    "leaderboard", "benchmark", "benchmarks", "survey", "paper", "papers",
    "collection", "list", "lists", "resources", "resource", "curated",
    "from-scratch", "scratch", "interview", "interview-prep",
}

# Maps GitHub topics to our AI-focused category taxonomy
_TOPIC_TO_CATEGORY = {
    "llm": "LLM / Generative AI",
    "large-language-model": "LLM / Generative AI",
    "generative-ai": "LLM / Generative AI",
    "text-generation": "LLM / Generative AI",
    "diffusion-models": "LLM / Generative AI",
    "text-to-image": "LLM / Generative AI",
    "natural-language-processing": "NLP",
    "nlp": "NLP",
    "text-classification": "NLP",
    "question-answering": "NLP",
    "named-entity-recognition": "NLP",
    "computer-vision": "Computer Vision",
    "image-classification": "Computer Vision",
    "object-detection": "Computer Vision",
    "image-segmentation": "Computer Vision",
    "speech-recognition": "Speech / Audio AI",
    "automatic-speech-recognition": "Speech / Audio AI",
    "text-to-speech": "Speech / Audio AI",
    "audio-processing": "Speech / Audio AI",
    "mlops": "MLOps / LLMOps",
    "experiment-tracking": "MLOps / LLMOps",
    "model-deployment": "Model Serving / Inference",
    "model-serving": "Model Serving / Inference",
    "inference": "Model Serving / Inference",
    "vector-database": "Vector Databases",
    "vector-search": "Vector Databases",
    "embeddings": "Vector Databases",
    "fine-tuning": "Fine-Tuning / Training",
    "deep-learning": "Fine-Tuning / Training",
    "neural-networks": "Fine-Tuning / Training",
    "reinforcement-learning": "AI Agents",
    "ai-agents": "AI Agents",
    "rag": "AI Agents",
}

# What the tool actually does — shown in the UI as the subtitle
_TOPIC_TO_FUNCTION = {
    "llm": "Large Language Model",
    "large-language-model": "Large Language Model",
    "natural-language-processing": "NLP Library",
    "computer-vision": "Computer Vision Library",
    "generative-ai": "Generative AI Platform",
    "diffusion-models": "Diffusion Model Library",
    "speech-recognition": "Speech Recognition Library",
    "text-to-speech": "Text-to-Speech Library",
    "mlops": "MLOps Tool",
    "model-serving": "Model Serving Framework",
    "vector-database": "Vector Database",
    "fine-tuning": "Fine-Tuning Framework",
    "deep-learning": "Deep Learning Framework",
    "ai-agents": "AI Agent Framework",
    "rag": "RAG Framework",
    "object-detection": "Object Detection Library",
}

# Developer-focused use cases per topic
_TOPIC_TO_USE_CASES = {
    "llm": ["build LLM-powered apps", "chatbot development", "code generation", "text summarization"],
    "natural-language-processing": ["text classification", "named entity recognition", "NLP pipelines"],
    "computer-vision": ["object detection", "image classification", "video analysis"],
    "generative-ai": ["image generation", "content creation", "creative tools"],
    "diffusion-models": ["text-to-image generation", "image editing", "style transfer"],
    "speech-recognition": ["audio transcription", "voice commands", "meeting notes"],
    "text-to-speech": ["voice synthesis", "accessibility tools", "audiobook generation"],
    "mlops": ["experiment tracking", "model deployment", "ML pipeline automation"],
    "model-serving": ["serve ML models as APIs", "scalable inference", "A/B model testing"],
    "vector-database": ["semantic search", "RAG systems", "embedding storage"],
    "fine-tuning": ["fine-tune LLMs", "custom model training", "domain adaptation"],
    "deep-learning": ["neural network training", "transfer learning", "GPU model training"],
    "ai-agents": ["autonomous agents", "tool-using LLMs", "multi-step task execution"],
    "rag": ["document Q&A", "enterprise knowledge base", "retrieval-augmented generation"],
    "object-detection": ["real-time detection", "video surveillance", "autonomous vehicles"],
}

_LANG_TO_COMPATIBILITY = {
    "Python": ["Python", "Linux", "Windows", "macOS"],
    "JavaScript": ["JavaScript", "Node.js", "Web Browser"],
    "TypeScript": ["TypeScript", "Node.js", "Web Browser"],
    "Julia": ["Julia", "Linux", "macOS"],
    "R": ["R", "Linux", "Windows", "macOS"],
    "C++": ["C++", "Linux", "Windows", "macOS"],
    "Rust": ["Rust", "Linux", "Windows", "macOS"],
    "Go": ["Go", "Linux", "Windows", "macOS"],
}


def _infer_category(topics: list) -> str:
    for t in topics:
        if t in _TOPIC_TO_CATEGORY:
            return _TOPIC_TO_CATEGORY[t]
    return "Fine-Tuning / Training"


def _infer_function(topics: list) -> str:
    for t in topics:
        if t in _TOPIC_TO_FUNCTION:
            return _TOPIC_TO_FUNCTION[t]
    return "AI Library"


def _infer_use_cases(topics: list) -> list:
    for t in topics:
        if t in _TOPIC_TO_USE_CASES:
            return _TOPIC_TO_USE_CASES[t]
    return []


def _infer_cost(license_info: dict | None) -> str:
    if not license_info:
        return "See Repository"
    spdx = license_info.get("spdx_id", "")
    open_licenses = {
        "MIT", "Apache-2.0", "GPL-2.0", "GPL-3.0",
        "LGPL-2.1", "LGPL-3.0", "BSD-2-Clause", "BSD-3-Clause",
        "CC0-1.0", "Unlicense", "ISC", "MPL-2.0",
    }
    if spdx in open_licenses:
        return "Free / Open Source"
    if spdx == "NOASSERTION":
        return "See Repository"
    return "Check Repository"


def _is_junk(repo: dict) -> bool:
    # Check the repo name and description for words that indicate it's
    # a course, guide, awesome list, or demo — not a usable developer tool.
    name = repo.get("name", "").lower().replace("-", " ").replace("_", " ")
    desc = (repo.get("description") or "").lower()
    combined = name + " " + desc
    return any(kw in combined.split() for kw in _EXCLUDE_KEYWORDS)


def _respect_rate_limit(headers: dict) -> None:
    # back off if we're close to hitting GitHub's rate limit
    remaining = int(headers.get("X-RateLimit-Remaining", 10))
    if remaining < 5:
        reset_at = int(headers.get("X-RateLimit-Reset", time.time() + 60))
        sleep_for = max(1, reset_at - time.time() + 1)
        print(f"[GitHub] Rate limit low ({remaining} left). Sleeping {sleep_for:.0f}s.")
        time.sleep(min(sleep_for, 120))
    else:
        time.sleep(0.4)


def crawl(max_per_topic: int = 10, min_stars: int = 500) -> list:
    # track seen repo IDs so the same repo doesn't appear twice
    # if it matches more than one of our topics
    seen_repo_ids: set = set()
    tools = []
    skipped = 0

    for topic in TOPICS:
        try:
            resp = requests.get(
                f"{GITHUB_API}/search/repositories",
                headers=_HEADERS,
                params={
                    "q": f"topic:{topic} stars:>={min_stars} is:public",
                    "sort": "stars",
                    "order": "desc",
                    "per_page": max_per_topic,
                },
                timeout=12,
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])

            for repo in items:
                repo_id = str(repo["id"])
                if repo_id in seen_repo_ids:
                    continue
                seen_repo_ids.add(repo_id)

                # skip archived / disabled repos
                if repo.get("archived") or repo.get("disabled"):
                    skipped += 1
                    continue

                # skip courses, tutorials, awesome lists, demos, etc.
                if _is_junk(repo):
                    skipped += 1
                    continue

                topics_list = repo.get("topics", [])
                lang = repo.get("language") or "Python"
                raw_name = repo.get("name", "unknown")
                display_name = raw_name.replace("-", " ").replace("_", " ").title()

                tool = {
                    "source": "github",
                    "source_id": repo_id,
                    "name": display_name,
                    "category": _infer_category(topics_list),
                    "function": _infer_function(topics_list),
                    "description": repo.get("description") or f"{display_name} — a {_infer_category(topics_list)} tool.",
                    "developer": repo.get("owner", {}).get("login", "Unknown"),
                    "version": "latest",
                    "cost": _infer_cost(repo.get("license")),
                    "compatibility": _LANG_TO_COMPATIBILITY.get(lang, [lang]),
                    "dependencies": [],
                    "social_impact": f"Starred by {repo.get('stargazers_count', 0):,} developers on GitHub.",
                    "example_code": "",
                    "official_url": repo.get("homepage") or repo["html_url"],
                    "tags": topics_list[:10],
                    "use_cases": _infer_use_cases(topics_list),
                    "url_status": "valid",
                    "stars": repo.get("stargazers_count", 0),
                    "github_url": repo["html_url"],
                    "last_updated": repo.get("updated_at", ""),
                }
                tools.append(tool)

            _respect_rate_limit(resp.headers)

        except requests.HTTPError as e:
            print(f"[GitHub] HTTP error on topic '{topic}': {e}")
        except Exception as e:
            print(f"[GitHub] Unexpected error on topic '{topic}': {e}")

    print(f"[GitHub] Crawled {len(tools)} tools, skipped {skipped} junk/archived repos.")
    return tools
