# Pulls trending AI spaces from HuggingFace Hub.
# Spaces are interactive demos and apps that people build on top of AI models —
# things like image generators, chatbots, transcription tools, etc.
#
# No API key needed here, HuggingFace's public API is open.
# We sort by likes so we're getting the ones people actually use.

import requests

HF_API = "https://huggingface.co/api"

# HuggingFace tags their spaces with pipeline types like "text-generation"
# or "image-classification". We map those to our category names.
_TAG_TO_CATEGORY = {
    "text-generation": "Generative AI",
    "text2text-generation": "Generative AI",
    "image-generation": "Generative AI",
    "text-to-image": "Generative AI",
    "image-to-image": "Generative AI",
    "unconditional-image-generation": "Generative AI",
    "text-classification": "Natural Language Processing (NLP)",
    "token-classification": "Natural Language Processing (NLP)",
    "question-answering": "Natural Language Processing (NLP)",
    "summarization": "Natural Language Processing (NLP)",
    "translation": "Natural Language Processing (NLP)",
    "conversational": "Natural Language Processing (NLP)",
    "fill-mask": "Natural Language Processing (NLP)",
    "sentence-similarity": "Natural Language Processing (NLP)",
    "feature-extraction": "Natural Language Processing (NLP)",
    "image-classification": "Computer Vision",
    "object-detection": "Computer Vision",
    "image-segmentation": "Computer Vision",
    "depth-estimation": "Computer Vision",
    "video-classification": "Computer Vision",
    "zero-shot-image-classification": "Computer Vision",
    "automatic-speech-recognition": "Audio & Speech",
    "text-to-speech": "Audio & Speech",
    "audio-classification": "Audio & Speech",
    "audio-to-audio": "Audio & Speech",
    "reinforcement-learning": "Reinforcement Learning",
    "tabular-classification": "Machine Learning",
    "tabular-regression": "Machine Learning",
    "time-series-forecasting": "Machine Learning",
}

# What people typically use each type of space for
_TAG_TO_USE_CASES = {
    "text-generation": ["creative writing", "code generation", "chatbots"],
    "text-to-image": ["art generation", "image synthesis", "design assistance"],
    "text-classification": ["sentiment analysis", "spam detection", "topic categorisation"],
    "question-answering": ["document QA", "customer support", "knowledge retrieval"],
    "summarization": ["document summarisation", "news digest", "report generation"],
    "automatic-speech-recognition": ["voice transcription", "meeting notes", "subtitles"],
    "text-to-speech": ["accessibility", "virtual assistants", "audiobook generation"],
    "image-classification": ["content moderation", "medical imaging", "quality control"],
    "object-detection": ["surveillance", "autonomous vehicles", "retail analytics"],
    "reinforcement-learning": ["game agents", "robotics", "resource scheduling"],
}


def _infer_category(tags: list) -> str:
    for tag in tags:
        if tag in _TAG_TO_CATEGORY:
            return _TAG_TO_CATEGORY[tag]
    return "Machine Learning"


def _infer_use_cases(tags: list) -> list:
    for tag in tags:
        if tag in _TAG_TO_USE_CASES:
            return _TAG_TO_USE_CASES[tag]
    return []


def crawl(limit: int = 40) -> list:
    tools = []

    try:
        resp = requests.get(
            f"{HF_API}/spaces",
            params={
                "limit": limit,
                "sort": "likes",
                "direction": -1,
                "full": "true",
            },
            timeout=15,
        )
        resp.raise_for_status()
        spaces = resp.json()

        for space in spaces:
            space_id = space.get("id", "")
            if not space_id or "/" not in space_id:
                continue

            tags = space.get("tags", [])
            author, repo_name = space_id.split("/", 1)
            display_name = repo_name.replace("-", " ").replace("_", " ").title()
            category = _infer_category(tags)

            # Try to grab a real description from the space's card data.
            # Fall back to a generic one if there isn't anything useful.
            card_data = space.get("cardData") or {}
            description = (
                card_data.get("short_description")
                or card_data.get("description")
                or f"{display_name} — an interactive {category} application on HuggingFace."
            )
            # Cap it so we don't store an entire README as the description
            if len(description) > 300:
                description = description[:297] + "..."

            tool = {
                "source": "huggingface",
                "source_id": space_id,
                "name": display_name,
                "category": category,
                "function": f"{category} Application",
                "description": description,
                "developer": author,
                "version": "latest",
                "cost": "Free",
                "compatibility": ["Web Browser", "Python"],
                "dependencies": [],
                "social_impact": f"Liked by {space.get('likes', 0):,} users on HuggingFace Spaces.",
                "example_code": "",
                "official_url": f"https://huggingface.co/spaces/{space_id}",
                # Strip out license tags — they're not useful as display tags
                "tags": [t for t in tags if not t.startswith("license:")][:10],
                "use_cases": _infer_use_cases(tags),
                "url_status": "valid",
                "stars": space.get("likes", 0),
                "last_updated": space.get("updatedAt", ""),
            }
            tools.append(tool)

    except requests.HTTPError as e:
        print(f"[HuggingFace] HTTP error: {e}")
    except Exception as e:
        print(f"[HuggingFace] Unexpected error: {e}")

    print(f"[HuggingFace] Crawled {len(tools)} spaces.")
    return tools
