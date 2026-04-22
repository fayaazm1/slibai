import json
import os
from pathlib import Path
from difflib import SequenceMatcher
from sqlalchemy.orm import Session

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "ai_tools.json"

# maps natural language phrases to our category names
# longer phrases go first so "image recognition" wins before we check plain "image"
INTENT_MAP: list[tuple[list[str], str]] = [
    # Computer Vision
    (["image recognition", "object detection", "face detection", "image segmentation",
      "image classification", "object tracking", "visual recognition", "pose estimation",
      "ocr", "optical character", "image processing", "video analysis", "yolo",
      "opencv", "vision", "visual", "image", "video", "detect object"], "Computer Vision"),

    # Speech / Audio AI
    (["speech recognition", "voice recognition", "speech synthesis", "text to speech",
      "tts", "stt", "asr", "audio transcription", "transcription", "speaker",
      "speech", "audio", "voice", "sound", "whisper"], "Speech / Audio AI"),

    # LLM / Generative AI
    (["chatbot", "text generation", "language model", "llm", "gpt", "rag",
      "retrieval augmented", "generative ai", "prompt engineering", "chat",
      "conversation", "dialogue", "story generation", "code generation",
      "question answering", "summarization", "generative", "natural language generation"],
     "LLM / Generative AI"),

    # NLP
    (["sentiment analysis", "named entity recognition", "ner", "text classification",
      "machine translation", "pos tagging", "tokenization", "text processing",
      "nlp", "natural language processing", "entity extraction", "topic modeling",
      "text mining", "language understanding"], "NLP"),

    # AI Agents
    (["autonomous agent", "ai agent", "workflow automation", "multi-agent",
      "agent orchestration", "tool use", "langchain", "autogpt", "autonomous",
      "agent", "workflow", "orchestration"], "AI Agents"),

    # Fine-Tuning / Training
    (["fine-tune", "finetune", "model training", "train model", "transfer learning",
      "custom model", "deep learning training", "neural network training",
      "deep learning", "neural network", "machine learning",
      "build model", "train a model", "classification model", "regression model",
      "training", "fine tuning", "deep", "neural", "regression",
      "prediction model", "ml model", "train"], "Fine-Tuning / Training"),

    # Vector Databases
    (["vector search", "similarity search", "embedding search", "semantic search",
      "vector store", "vector db", "vector database", "embeddings", "pinecone",
      "weaviate", "chroma", "faiss", "vector"], "Vector Databases"),

    # MLOps / LLMOps
    (["experiment tracking", "model versioning", "model monitoring", "mlops",
      "llmops", "ci/cd ml", "ml pipeline", "model registry", "data versioning",
      "mlflow", "kubeflow", "wandb"], "MLOps / LLMOps"),

    # Model Serving / Inference
    (["model serving", "model deployment", "inference server", "model api",
      "triton", "torchserve", "bentoml", "serving", "inference", "deploy model"],
     "Model Serving / Inference"),

    # Multimodal AI
    (["multimodal", "image and text", "vision language", "vlm", "clip",
      "image captioning", "visual question answering", "vqa"], "Multimodal AI"),

    # AI Developer Platforms
    (["ai platform", "cloud ai", "vertex ai", "sagemaker", "azure ml",
      "ai studio", "developer platform"], "AI Developer Platforms"),

    # Developer Tools
    (["sdk", "api integration", "developer tool", "library", "framework integration"],
     "Developer Tools"),
]

# words that don't tell us anything useful — strip these before scoring
# e.g. "I want to build image recognition" → we really only care about "image recognition"
_STOP_WORDS = {
    "i", "want", "to", "build", "create", "make", "develop", "use", "need",
    "a", "an", "the", "for", "that", "can", "do", "with", "my", "some",
    "how", "get", "give", "me", "something", "system", "app", "application",
    "implement", "using", "like", "is", "are", "in", "of", "and", "or",
    # too generic — "model" and "ai" appear in every tool so they tell us nothing
    "model", "ai", "tool", "tools", "technology", "solution", "feature",
    "project", "help", "good", "best", "new", "better", "work", "works",
}


def load_tools():
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def get_all_tools():
    return load_tools()


def get_tool_by_id(tool_id: int):
    tools = load_tools()
    for tool in tools:
        if tool["id"] == tool_id:
            return tool
    return None


def _tool_signal_text(tool: dict) -> str:
    # the fields that actually matter for ranking — name, category, function, tags, use cases
    tags = " ".join(tool.get("tags", []) or [])
    use_cases = " ".join(tool.get("use_cases", []) or [])
    return " ".join([
        tool.get("name", ""),
        tool.get("category", ""),
        tool.get("function", ""),
        tags,
        use_cases,
    ]).lower()


def _tool_full_text(tool: dict) -> str:
    tags = " ".join(tool.get("tags", []) or [])
    use_cases = " ".join(tool.get("use_cases", []) or [])
    return " ".join([
        tool.get("name", ""),
        tool.get("category", ""),
        tool.get("function", ""),
        tool.get("description", ""),
        tool.get("developer", ""),
        tags,
        use_cases,
    ]).lower()


def _word_sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def detect_intent(query: str) -> str | None:
    # try to map what the user typed to one of our categories
    # returns something like 'Computer Vision', or None if we can't tell
    q = query.lower().strip()

    # check multi-word phrases first — more specific than single words
    for keywords, category in INTENT_MAP:
        for kw in keywords:
            if " " in kw and kw in q:
                return category

    # strip filler words, then check individual keywords
    meaningful_words = [w for w in q.split() if w not in _STOP_WORDS and len(w) >= 3]
    for keywords, category in INTENT_MAP:
        for kw in keywords:
            if " " not in kw:
                if kw in meaningful_words:
                    return category
                # catch typos like "vison" matching "vision"
                for mw in meaningful_words:
                    if _word_sim(kw, mw) >= 0.85 and abs(len(kw) - len(mw)) <= 2:
                        return category

    return None


def _run_search(tools: list, query: str) -> dict:
    # shared scoring logic used by both the JSON and DB paths — don't duplicate this
    query_lower = query.lower().strip()

    # strip filler words so "I want to build image recognition" becomes ["image", "recognition"]
    meaningful_words = [
        w for w in query_lower.split()
        if w not in _STOP_WORDS and len(w) >= 3
    ]

    detected_category = detect_intent(query_lower)

    scored: list[tuple[float, dict]] = []

    for tool in tools:
        signal_text = _tool_signal_text(tool)
        tool_category = tool.get("category", "")
        in_target_category = (detected_category is not None and tool_category == detected_category)

        # category match is the strongest signal (10 pts)
        category_score = 10.0 if in_target_category else 0.0

        # exact/substring keyword hits across name, tags, use cases (up to 5 pts)
        keyword_score = 0.0
        if meaningful_words:
            matched = sum(1 for w in meaningful_words if w in signal_text)
            keyword_score = (matched / len(meaningful_words)) * 5.0

        # fuzzy score handles typos — "tenserflow" should still find TensorFlow
        # weight is 2.5 so a single strong match (≥0.80 sim) clears the 2.0 threshold below
        fuzzy_score = 0.0
        if meaningful_words:
            tool_words = [w for w in signal_text.split() if len(w) >= 3]
            for qw in meaningful_words:
                best = max((_word_sim(qw, tw) for tw in tool_words), default=0.0)
                if best >= 0.85:
                    fuzzy_score += best * 2.5

        total = category_score + keyword_score + fuzzy_score

        # if we know the category, only show tools in that category
        if detected_category is not None and not in_target_category:
            continue

        # no category — need at least a score of 2.0 so vague queries don't dump everything
        # a single good fuzzy match scores ~2.0+, so typo searches still get through
        if detected_category is None and total < 2.0:
            continue

        scored.append((total, tool))

    scored.sort(key=lambda x: x[0], reverse=True)

    results = [t for _, t in scored]
    return {
        "results": results,
        "detected_category": detected_category,
        "total_results": len(results),
        "query": query,
    }


def search_tools(query: str) -> dict:
    return _run_search(load_tools(), query)


def compare_tools(ids):
    tools = load_tools()
    return [tool for tool in tools if tool["id"] in ids]


def _run_filter(
    tools: list,
    category: str | None = None,
    cost: str | None = None,
    language: str | None = None,
    developer: str | None = None,
) -> list:
    """Core filter logic — operates on any list of tool dicts (JSON or DB-converted).
    Kept separate so both JSON and DB paths share identical filter behavior."""
    results = []
    for tool in tools:
        if category and tool.get("category", "") != category:
            continue
        if cost and cost.lower() not in (tool.get("cost") or "").lower():
            continue
        if language:
            # compatibility is always a list in both JSON and DB (confirmed in field audit)
            compat = tool.get("compatibility") or []
            compat_list = compat if isinstance(compat, list) else [compat]
            if not any(language.lower() in c.lower() for c in compat_list):
                continue
        if developer and developer.lower() not in (tool.get("developer") or "").lower():
            continue
        results.append(tool)
    return results


def filter_tools(
    category: str | None = None,
    cost: str | None = None,
    language: str | None = None,
    developer: str | None = None,
) -> list:
    return _run_filter(load_tools(), category, cost, language, developer)


# DB reads — only active when USE_DB_FOR_TOOLS=true in .env
# the JSON functions above are untouched and still work as fallback

def _tool_to_dict(tool) -> dict:
    # turns a SQLAlchemy row into a plain dict with the same shape as the JSON tools
    return {
        "id":           tool.id,
        "name":         tool.name,
        "category":     tool.category,
        "function":     tool.function,
        "description":  tool.description,
        "developer":    tool.developer,
        "version":      tool.version,
        "cost":         tool.cost,
        "compatibility": tool.compatibility or [],
        "dependencies": tool.dependencies or [],
        "tags":         tool.tags or [],
        "use_cases":    tool.use_cases or [],
        "social_impact": tool.social_impact,
        "example_code": tool.example_code,
        "official_url": tool.official_url,
        "github_url":   tool.github_url,
        "source":       tool.source,
        "source_id":    tool.source_id,
        "url_status":   tool.url_status,
        "stars":        tool.stars,
        "stale_count":  tool.stale_count,
        "last_crawled": tool.last_crawled.isoformat() if tool.last_crawled else None,
        "last_updated": tool.last_updated,
        "scope":        tool.scope,
        "type":         tool.type,
    }


def get_all_tools_db(db: Session) -> list:
    from app.models.tool import Tool
    rows = db.query(Tool).filter(Tool.is_active.isnot(False)).order_by(Tool.id).all()
    return [_tool_to_dict(r) for r in rows]


def get_tool_by_id_db(db: Session, tool_id: int) -> dict | None:
    from app.models.tool import Tool
    row = db.query(Tool).filter(Tool.id == tool_id, Tool.is_active.isnot(False)).first()
    return _tool_to_dict(row) if row else None


def search_tools_db(db: Session, query: str) -> dict:
    # pull tools from DB and run the same Python scoring — keeps parity with the JSON path
    # (SequenceMatcher can't run in SQL anyway)
    tools = get_all_tools_db(db)
    return _run_search(tools, query)


def filter_tools_db(
    db: Session,
    category: str | None = None,
    cost: str | None = None,
    language: str | None = None,
    developer: str | None = None,
) -> list:
    # same reason as search — JSONB array filtering in SQL is messy, easier to do it in Python
    tools = get_all_tools_db(db)
    return _run_filter(tools, category, cost, language, developer)


def get_category_stats_db(db: Session) -> list:
    from app.models.tool import Tool
    from sqlalchemy import func
    rows = db.query(Tool.category, func.count(Tool.id).label("count")) \
             .filter(Tool.is_active.isnot(False)) \
             .group_by(Tool.category) \
             .all()
    return [{"category": row.category, "count": row.count} for row in rows]


def compare_tools_db(db: Session, ids: list) -> list:
    from app.models.tool import Tool
    rows = db.query(Tool).filter(Tool.id.in_(ids), Tool.is_active.isnot(False)).order_by(Tool.id).all()
    return [_tool_to_dict(r) for r in rows]


def get_category_stats():
    tools = load_tools()
    stats = {}

    for tool in tools:
        category = tool.get("category", "Unknown")
        stats[category] = stats.get(category, 0) + 1

    return [{"category": category, "count": count} for category, count in stats.items()]