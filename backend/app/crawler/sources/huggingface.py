# Pulls AI models from HuggingFace Hub — specifically models that developers
# can actually use in their apps via the Inference API or by downloading weights.
#
# We pull from the /models endpoint (not /spaces) because models are the
# actual developer assets. Spaces are mostly consumer demo UIs — not what
# a software engineer needs when choosing an AI component.
#
# No API key needed. HuggingFace's public API is open.

import requests

HF_API = "https://huggingface.co/api"

# Only pull models with these pipeline tags — they map directly to
# developer use cases (build a chatbot, transcribe audio, detect objects, etc.)
ALLOWED_PIPELINE_TAGS = {
    "text-generation",
    "text2text-generation",
    "conversational",
    "question-answering",
    "summarization",
    "translation",
    "fill-mask",
    "sentence-similarity",
    "feature-extraction",
    "text-classification",
    "token-classification",
    "automatic-speech-recognition",
    "text-to-speech",
    "audio-to-audio",
    "audio-classification",
    "image-classification",
    "object-detection",
    "image-segmentation",
    "depth-estimation",
    "image-to-text",
    "text-to-image",
    "image-to-image",
    "video-classification",
    "zero-shot-classification",
    "zero-shot-image-classification",
    "reinforcement-learning",
    "tabular-classification",
    "tabular-regression",
}

# Maps pipeline tags to our AI-focused category taxonomy
_TAG_TO_CATEGORY = {
    "text-generation": "LLM / Generative AI",
    "text2text-generation": "LLM / Generative AI",
    "conversational": "LLM / Generative AI",
    "text-to-image": "LLM / Generative AI",
    "image-to-image": "LLM / Generative AI",
    "text-classification": "NLP",
    "token-classification": "NLP",
    "question-answering": "NLP",
    "summarization": "NLP",
    "translation": "NLP",
    "fill-mask": "NLP",
    "sentence-similarity": "NLP",
    "feature-extraction": "NLP",
    "zero-shot-classification": "NLP",
    "image-classification": "Computer Vision",
    "object-detection": "Computer Vision",
    "image-segmentation": "Computer Vision",
    "depth-estimation": "Computer Vision",
    "video-classification": "Computer Vision",
    "zero-shot-image-classification": "Computer Vision",
    "image-to-text": "Computer Vision",
    "automatic-speech-recognition": "Speech / Audio AI",
    "text-to-speech": "Speech / Audio AI",
    "audio-classification": "Speech / Audio AI",
    "audio-to-audio": "Speech / Audio AI",
    "reinforcement-learning": "AI Agents",
    "tabular-classification": "MLOps / LLMOps",
    "tabular-regression": "MLOps / LLMOps",
}

# Developer-relevant use cases per pipeline tag
_TAG_TO_USE_CASES = {
    "text-generation": ["build LLM apps", "chatbot development", "code generation", "text summarization"],
    "text-to-image": ["image generation pipeline", "design tools", "creative apps"],
    "text-classification": ["sentiment analysis", "spam filtering", "intent detection"],
    "question-answering": ["document Q&A", "customer support bots", "knowledge retrieval"],
    "summarization": ["document summarization", "news digest", "report generation"],
    "automatic-speech-recognition": ["audio transcription", "meeting notes", "subtitle generation"],
    "text-to-speech": ["voice synthesis", "accessibility tools", "audiobook production"],
    "image-classification": ["content moderation", "medical imaging", "quality inspection"],
    "object-detection": ["real-time detection", "autonomous vehicles", "retail analytics"],
    "sentence-similarity": ["semantic search", "RAG embeddings", "duplicate detection"],
    "feature-extraction": ["embedding generation", "semantic search", "RAG pipelines"],
    "image-segmentation": ["scene understanding", "medical image analysis", "video editing"],
    "translation": ["multilingual apps", "content localization", "cross-language search"],
    "reinforcement-learning": ["game agents", "robotic control", "resource optimization"],
    "audio-to-audio": ["voice conversion", "speech enhancement", "noise removal"],
}


def _infer_category(pipeline_tag: str) -> str:
    return _TAG_TO_CATEGORY.get(pipeline_tag, "LLM / Generative AI")


def _infer_use_cases(pipeline_tag: str) -> list:
    return _TAG_TO_USE_CASES.get(pipeline_tag, [])


def crawl(limit: int = 40) -> list:
    # We fetch models sorted by downloads — the most-downloaded models are the
    # ones developers actually use, not just popular demos.
    tools = []
    skipped = 0

    try:
        resp = requests.get(
            f"{HF_API}/models",
            params={
                "limit": limit,
                "sort": "downloads",
                "direction": -1,
                "full": "true",
            },
            timeout=15,
        )
        resp.raise_for_status()
        models = resp.json()

        for model in models:
            model_id = model.get("id", "")
            if not model_id or "/" not in model_id:
                continue

            pipeline_tag = model.get("pipeline_tag", "")

            # skip anything that isn't a recognised developer-relevant pipeline
            if pipeline_tag not in ALLOWED_PIPELINE_TAGS:
                skipped += 1
                continue

            author, repo_name = model_id.split("/", 1)
            display_name = repo_name.replace("-", " ").replace("_", " ").title()
            category = _infer_category(pipeline_tag)

            card_data = model.get("cardData") or {}
            description = (
                card_data.get("short_description")
                or card_data.get("description")
                or f"{display_name} — a {pipeline_tag.replace('-', ' ')} model on HuggingFace."
            )
            if len(description) > 300:
                description = description[:297] + "..."

            # strip license: tags, they clutter the tag list
            tags = [t for t in (model.get("tags") or []) if not t.startswith("license:")]

            tool = {
                "source": "huggingface",
                "source_id": model_id,
                "name": display_name,
                "category": category,
                "function": pipeline_tag.replace("-", " ").title() + " Model",
                "description": description,
                "developer": author,
                "version": "latest",
                "cost": "Free",
                "compatibility": ["Python", "Web Browser (Inference API)"],
                "dependencies": ["transformers", "torch"],
                "social_impact": f"Downloaded {model.get('downloads', 0):,} times on HuggingFace.",
                "example_code": "",
                "official_url": f"https://huggingface.co/{model_id}",
                "tags": tags[:10],
                "use_cases": _infer_use_cases(pipeline_tag),
                "url_status": "valid",
                "stars": model.get("likes", 0),
                "last_updated": model.get("lastModified", ""),
            }
            tools.append(tool)

    except requests.HTTPError as e:
        print(f"[HuggingFace] HTTP error: {e}")
    except Exception as e:
        print(f"[HuggingFace] Unexpected error: {e}")

    print(f"[HuggingFace] Crawled {len(tools)} models, skipped {skipped} non-developer pipelines.")
    return tools
