# Pulls AI/ML tool data from GitHub using their Search API.
# We search by topic (e.g. "deep-learning", "llm") and only grab repos
# with 500+ stars so we're not picking up random half-finished projects.
#
# If you set a GITHUB_TOKEN environment variable, the rate limit goes from
# 60 requests/hour up to 5000 — worth doing if you're running frequent crawls.

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

# These are the topics we search on GitHub. Each one maps to a crawl request.
TOPICS = [
    "machine-learning",
    "deep-learning",
    "natural-language-processing",
    "computer-vision",
    "generative-ai",
    "llm",
    "reinforcement-learning",
    "mlops",
    "audio-processing",
    "speech-recognition",
    "diffusion-models",
    "transformer-models",
]

# Maps GitHub repo topics to our app's category names.
# We go through a repo's topics in order and return the first match.
_TOPIC_TO_CATEGORY = {
    "deep-learning": "Deep Learning",
    "neural-networks": "Deep Learning",
    "transformer-models": "Deep Learning",
    "natural-language-processing": "Natural Language Processing (NLP)",
    "nlp": "Natural Language Processing (NLP)",
    "text-generation": "Natural Language Processing (NLP)",
    "text-classification": "Natural Language Processing (NLP)",
    "question-answering": "Natural Language Processing (NLP)",
    "computer-vision": "Computer Vision",
    "image-classification": "Computer Vision",
    "object-detection": "Computer Vision",
    "image-segmentation": "Computer Vision",
    "generative-ai": "Generative AI",
    "llm": "Generative AI",
    "large-language-model": "Generative AI",
    "diffusion-models": "Generative AI",
    "text-to-image": "Generative AI",
    "reinforcement-learning": "Reinforcement Learning",
    "machine-learning": "Machine Learning",
    "scikit-learn": "Machine Learning",
    "data-science": "Data Science",
    "data-visualization": "Data Science",
    "mlops": "MLOps",
    "model-deployment": "MLOps",
    "experiment-tracking": "MLOps",
    "audio-processing": "Audio & Speech",
    "speech-recognition": "Audio & Speech",
    "text-to-speech": "Audio & Speech",
    "automatic-speech-recognition": "Audio & Speech",
}

# Same idea but for the "function" field — what the tool actually does
_TOPIC_TO_FUNCTION = {
    "deep-learning": "Deep Learning Framework",
    "natural-language-processing": "NLP Toolkit",
    "computer-vision": "Computer Vision Library",
    "generative-ai": "Generative AI Platform",
    "llm": "Large Language Model",
    "reinforcement-learning": "RL Framework",
    "machine-learning": "Machine Learning Library",
    "data-science": "Data Science Toolkit",
    "mlops": "MLOps Platform",
    "audio-processing": "Audio Processing Library",
    "speech-recognition": "Speech Recognition System",
    "diffusion-models": "Diffusion Model Library",
}

# Typical use cases per topic — used to fill in the use_cases field
_TOPIC_TO_USE_CASES = {
    "deep-learning": ["image classification", "model training", "neural network design"],
    "natural-language-processing": ["text classification", "named entity recognition", "question answering"],
    "computer-vision": ["image recognition", "object detection", "video analysis"],
    "generative-ai": ["content generation", "image synthesis", "creative writing"],
    "llm": ["chatbots", "code generation", "text summarization"],
    "reinforcement-learning": ["game playing", "robotics control", "optimization"],
    "speech-recognition": ["voice commands", "transcription", "language identification"],
    "text-to-speech": ["accessibility tools", "virtual assistants", "content narration"],
    "mlops": ["model deployment", "experiment tracking", "pipeline automation"],
    "data-science": ["data analysis", "predictive modeling", "statistical analysis"],
    "audio-processing": ["audio enhancement", "music generation", "sound classification"],
    "diffusion-models": ["image generation", "video synthesis", "style transfer"],
}

# Maps the repo's primary language to what platforms it runs on
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
    return "Machine Learning"


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


def _respect_rate_limit(headers: dict) -> None:
    # GitHub tells us how many requests we have left in the response headers.
    # If we're running low, we wait until the rate limit window resets.
    remaining = int(headers.get("X-RateLimit-Remaining", 10))
    if remaining < 5:
        reset_at = int(headers.get("X-RateLimit-Reset", time.time() + 60))
        sleep_for = max(1, reset_at - time.time() + 1)
        print(f"[GitHub] Rate limit low ({remaining} left). Sleeping {sleep_for:.0f}s.")
        time.sleep(min(sleep_for, 120))
    else:
        time.sleep(0.4)  # small pause between requests so we don't hammer the API


def crawl(max_per_topic: int = 10, min_stars: int = 500) -> list:
    # We keep track of repo IDs we've already seen so the same repo
    # doesn't show up twice if it matches multiple topics.
    seen_repo_ids: set = set()
    tools = []

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

                # Skip repos that have been archived or disabled — no point showing dead tools
                if repo.get("archived") or repo.get("disabled"):
                    continue

                topics = repo.get("topics", [])
                lang = repo.get("language") or "Python"
                raw_name = repo.get("name", "unknown")
                display_name = raw_name.replace("-", " ").replace("_", " ").title()

                tool = {
                    "source": "github",
                    "source_id": repo_id,
                    "name": display_name,
                    "category": _infer_category(topics),
                    "function": _infer_function(topics),
                    "description": repo.get("description") or f"{display_name} — a {_infer_category(topics)} library.",
                    "developer": repo.get("owner", {}).get("login", "Unknown"),
                    "version": "latest",
                    "cost": _infer_cost(repo.get("license")),
                    "compatibility": _LANG_TO_COMPATIBILITY.get(lang, [lang]),
                    "dependencies": [],
                    "social_impact": f"Starred by {repo.get('stargazers_count', 0):,} developers on GitHub.",
                    "example_code": "",
                    "official_url": repo.get("homepage") or repo["html_url"],
                    "tags": topics[:10],
                    "use_cases": _infer_use_cases(topics),
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

    print(f"[GitHub] Crawled {len(tools)} unique tools across {len(TOPICS)} topics.")
    return tools
