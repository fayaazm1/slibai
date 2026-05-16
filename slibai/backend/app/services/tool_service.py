"""
All the logic for finding, ranking, and filtering tools lives here — search scoring,
intent detection, fuzzy matching, and filter predicates. The routes in routes/tools.py
and routes/scan.py call into this file rather than touching the data layer themselves,
so query logic stays in one place. There are two parallel implementations for most
operations: one that reads from ai_tools.json (the default), and one that reads from
PostgreSQL when USE_DB_FOR_TOOLS=true in .env. Both paths produce identically-shaped
dicts so the route handlers don't need to know which one ran. One gotcha: the DB
functions do a full table scan into Python before filtering, which is fine for the
current catalogue size but would need rethinking if the dataset grew into the tens of
thousands.
"""
import json
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
    """
    Reads ai_tools.json from disk and returns the full list as Python dicts.

    Every call hits the filesystem — there is no in-memory cache here. That was a
    deliberate tradeoff: a cache would need invalidation logic whenever the crawler
    updates the file, and for our demo-scale load the disk read is fast enough
    that the complexity isn't worth it.

    Returns:
        list: All tool records as dicts with the standard tool shape.

    Note:
        If ai_tools.json is missing or malformed this raises an uncaught exception
        that bubbles up as a 500. The file is always present in the deployed
        environment so we don't handle that case defensively here.
    """
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def get_all_tools():
    """
    Public entry point for fetching every tool from the JSON store.

    Thin wrapper over load_tools() — exists so routes/tools.py has a stable
    function name to call regardless of where the data actually lives.

    Returns:
        list: Full list of tool dicts in insertion order.
    """
    return load_tools()


def get_tool_by_id(tool_id: int):
    """
    Looks up a single tool from the JSON store by its integer ID.

    Does a linear scan through the whole list — fine for a catalogue of a few
    hundred tools, but the DB path (get_tool_by_id_db) uses an indexed query
    for the same operation if we ever need it to scale.

    Args:
        tool_id (int): The tool's ID field as stored in ai_tools.json.

    Returns:
        dict | None: The matching tool dict, or None if no tool with that ID exists.
    """
    tools = load_tools()
    for tool in tools:
        if tool["id"] == tool_id:
            return tool
    return None


def _tool_signal_text(tool: dict) -> str:
    """
    Builds the high-signal text blob used for search ranking.

    Deliberately excludes description and developer — those fields add noise
    to the score because they contain generic prose. Name, category, function,
    tags, and use_cases are the fields that actually predict relevance.

    Args:
        tool (dict): A tool dict in the standard shape from JSON or DB.

    Returns:
        str: Lowercased concatenation of the signal fields, space-separated.
    """
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
    """
    Builds a wider text blob that includes description and developer fields.

    Not used in the main search scorer — kept for potential broader match use
    cases like admin full-text search where recall matters more than precision.

    Args:
        tool (dict): A tool dict in the standard shape.

    Returns:
        str: Lowercased concatenation of all text fields, space-separated.
    """
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
    """
    Returns a similarity ratio between two strings using SequenceMatcher.

    Wraps SequenceMatcher.ratio() to keep the fuzzy comparison logic in one
    place. A ratio of 1.0 means identical; 0.0 means nothing in common.

    Args:
        a (str): First string to compare.
        b (str): Second string to compare.

    Returns:
        float: Similarity ratio in [0.0, 1.0].
    """
    return SequenceMatcher(None, a, b).ratio()


def detect_intent(query: str) -> str | None:
    """
    Tries to map a free-text query to one of our catalogue categories.

    First pass checks multi-word phrases so "image recognition" wins before
    we try plain "image". Second pass strips stop words, then checks single
    keywords and near-typos. Returns None when we genuinely can't tell —
    the search scorer handles that case by requiring a minimum relevance
    score instead of returning the full catalogue.

    Args:
        query (str): Raw user input from the search box.

    Returns:
        str | None: A category name from INTENT_MAP, e.g. "Computer Vision",
            or None if no category could be inferred from the query.
    """
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
                    # 0.85 is intentionally strict — assigning the wrong category is
                    # worse than returning no category, so we only fuzz on very close matches
                    if _word_sim(kw, mw) >= 0.85 and abs(len(kw) - len(mw)) <= 2:
                        return category

    return None


def _run_search(tools: list, query: str) -> dict:
    """
    Core scoring engine — ranks tools against a free-text query.

    Combines three signals: category match (strongest at 10 pts), keyword hit
    rate across signal fields (up to 5 pts), and fuzzy token similarity to catch
    typos (scaled by 2.5 per strong match). When a category is detected, only
    tools in that category are shown. Without a category, anything scoring below
    2.0 is dropped so a vague or unrecognizable query doesn't return the full list.

    Args:
        tools (list): List of tool dicts to score — can come from JSON or DB.
        query (str): The user's raw search string.

    Returns:
        dict: Keys are "results" (ranked list), "detected_category" (str or None),
            "total_results" (int), and "query" (the original string).

    Note:
        All scoring runs in Python. The DB path loads tools into memory first for
        the same reason — SequenceMatcher can't run inside a SQL query.
    """
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
    """
    JSON-path entry point for tool search.

    Loads the full tool list from disk then delegates to _run_search for scoring.
    The DB equivalent is search_tools_db — both return the same response shape.

    Args:
        query (str): User's search string.

    Returns:
        dict: Scored search results — see _run_search for the full shape.
    """
    return _run_search(load_tools(), query)


def compare_tools(ids):
    """
    Fetches multiple tools by ID from the JSON store for side-by-side comparison.

    Args:
        ids: A list of integer tool IDs the user wants to compare.

    Returns:
        list: The matching tool dicts in the order they appear in ai_tools.json.
            Tools whose IDs aren't found are silently omitted.
    """
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
    Kept separate so both JSON and DB paths share identical filter behavior.

    Each filter is an AND condition — a tool must pass every non-None filter to
    be included. Category is exact match; cost and developer are case-insensitive
    substrings; language checks against the compatibility list.

    Args:
        tools (list): Source list of tool dicts to filter.
        category (str | None): Exact category name to match, e.g. "NLP".
        cost (str | None): Substring to match against the cost field, e.g. "free".
        language (str | None): Language or framework to find in the compatibility list.
        developer (str | None): Substring to match against the developer field.

    Returns:
        list: Filtered subset of the input list, order preserved.

    Note:
        compatibility is always a list in both JSON and DB — confirmed in a field
        audit when the DB path was added. The isinstance guard is a safety net for
        any edge case that slipped through.
    """
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
    """
    JSON-path entry point for tool filtering.

    Loads from disk and delegates to _run_filter. The DB equivalent is
    filter_tools_db — both return the same list shape.

    Args:
        category (str | None): Exact category match.
        cost (str | None): Substring match on cost field.
        language (str | None): Language to find in compatibility list.
        developer (str | None): Substring match on developer field.

    Returns:
        list: Matching tool dicts.
    """
    return _run_filter(load_tools(), category, cost, language, developer)


# DB reads — only active when USE_DB_FOR_TOOLS=true in .env
# the JSON functions above are untouched and still work as fallback

def _tool_to_dict(tool) -> dict:
    """
    Converts a SQLAlchemy Tool row into a plain dict matching the JSON tool shape.

    The shape here has to stay in sync with what ai_tools.json produces — the
    routes and the frontend expect the same field names regardless of which data
    source ran. Array fields (compatibility, dependencies, tags, use_cases) fall
    back to [] rather than None so callers don't need to null-check them.

    Args:
        tool: A SQLAlchemy Tool ORM instance.

    Returns:
        dict: Plain dict with the same keys and structure as a JSON tool record.
    """
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
    """
    Fetches all active tools from PostgreSQL and returns them as plain dicts.

    Filters out rows where is_active is explicitly False — isnot(False) also
    passes NULL rows, which covers any tools inserted before the is_active column
    existed and never got a value set.

    Args:
        db (Session): Active SQLAlchemy session, injected by the route dependency.

    Returns:
        list: All active tool dicts ordered by ID, in the same shape as the JSON path.
    """
    from app.models.tool import Tool
    rows = db.query(Tool).filter(Tool.is_active.isnot(False)).order_by(Tool.id).all()
    return [_tool_to_dict(r) for r in rows]


def get_tool_by_id_db(db: Session, tool_id: int) -> dict | None:
    """
    Looks up a single active tool by ID from PostgreSQL.

    Uses an indexed primary key query instead of the linear scan the JSON path does.

    Args:
        db (Session): Active SQLAlchemy session.
        tool_id (int): The tool's primary key.

    Returns:
        dict | None: The tool as a plain dict, or None if not found or inactive.
    """
    from app.models.tool import Tool
    row = db.query(Tool).filter(Tool.id == tool_id, Tool.is_active.isnot(False)).first()
    return _tool_to_dict(row) if row else None


def search_tools_db(db: Session, query: str) -> dict:
    """
    DB-path entry point for tool search.

    Pulls all active tools from PostgreSQL, then runs the exact same Python scoring
    as search_tools. This keeps ranking behavior identical across both paths — the
    only difference is where the data comes from.

    Args:
        db (Session): Active SQLAlchemy session.
        query (str): User's search string.

    Returns:
        dict: Scored search results — see _run_search for the full shape.
    """
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
    """
    DB-path entry point for tool filtering.

    Same story as search_tools_db — loads tools from PostgreSQL into Python then
    delegates to _run_filter. JSONB array filtering in SQL is messier than it looks,
    and keeping the filter logic in one Python function was the cleaner tradeoff.

    Args:
        db (Session): Active SQLAlchemy session.
        category (str | None): Exact category match.
        cost (str | None): Substring match on cost field.
        language (str | None): Language to find in compatibility list.
        developer (str | None): Substring match on developer field.

    Returns:
        list: Matching tool dicts.
    """
    # same reason as search — JSONB array filtering in SQL is messy, easier to do it in Python
    tools = get_all_tools_db(db)
    return _run_filter(tools, category, cost, language, developer)


def get_category_stats_db(db: Session) -> list:
    """
    Returns per-category tool counts using a SQL GROUP BY.

    Unlike search and filter, aggregating by category is clean SQL with no
    Python-side iteration needed, so we use a real GROUP BY here instead of
    loading everything into Python first.

    Args:
        db (Session): Active SQLAlchemy session.

    Returns:
        list: Dicts with "category" and "count" keys, one entry per active category.
    """
    from app.models.tool import Tool
    from sqlalchemy import func
    rows = db.query(Tool.category, func.count(Tool.id).label("count")) \
             .filter(Tool.is_active.isnot(False)) \
             .group_by(Tool.category) \
             .all()
    return [{"category": row.category, "count": row.count} for row in rows]


def compare_tools_db(db: Session, ids: list) -> list:
    """
    Fetches multiple tools by ID from PostgreSQL for side-by-side comparison.

    Args:
        db (Session): Active SQLAlchemy session.
        ids (list): List of integer tool IDs to fetch.

    Returns:
        list: Matching active tool dicts ordered by ID. Missing IDs are silently omitted.
    """
    from app.models.tool import Tool
    rows = db.query(Tool).filter(Tool.id.in_(ids), Tool.is_active.isnot(False)).order_by(Tool.id).all()
    return [_tool_to_dict(r) for r in rows]


def get_category_stats():
    """
    Returns per-category tool counts from the JSON store.

    Same output shape as get_category_stats_db so the Stats page doesn't need
    to care which path ran. Counts by iterating the full list rather than a SQL
    GROUP BY — fast enough at this scale.

    Returns:
        list: Dicts with "category" and "count" keys, in the order categories
            first appear in ai_tools.json.
    """
    tools = load_tools()
    stats = {}

    for tool in tools:
        category = tool.get("category", "Unknown")
        stats[category] = stats.get(category, 0) + 1

    return [{"category": category, "count": count} for category, count in stats.items()]
