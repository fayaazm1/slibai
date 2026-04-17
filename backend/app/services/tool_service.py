import json
from pathlib import Path
from difflib import SequenceMatcher

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "ai_tools.json"

# maps what a user types to a category in the database
# put phrases before single words so "image recognition" beats just "image"
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

# words to ignore when figuring out what the user actually wants
# e.g. "I want to build image recognition" → we only care about "image recognition"
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
    """The fields that actually matter for matching: name, category, function, tags, use_cases."""
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
    """Guess which category the user is asking about.
    Returns something like 'Computer Vision', or None if we can't pin it down."""
    q = query.lower().strip()

    # check phrases before single words — "image recognition" is more specific than "image"
    for keywords, category in INTENT_MAP:
        for kw in keywords:
            if " " in kw and kw in q:
                return category

    # now check individual words (after removing filler words)
    meaningful_words = [w for w in q.split() if w not in _STOP_WORDS and len(w) >= 3]
    for keywords, category in INTENT_MAP:
        for kw in keywords:
            if " " not in kw:
                if kw in meaningful_words:
                    return category
                # also catch typos — "vison" should still hit "vision"
                for mw in meaningful_words:
                    if _word_sim(kw, mw) >= 0.85 and abs(len(kw) - len(mw)) <= 2:
                        return category

    return None


def search_tools(query: str) -> dict:
    """Score every tool against the query and return them ranked best-first."""
    tools = load_tools()
    query_lower = query.lower().strip()

    # pull out the words that actually matter for scoring
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

        # keyword hits in name / tags / use_cases (up to 5 pts)
        keyword_score = 0.0
        if meaningful_words:
            matched = sum(1 for w in meaningful_words if w in signal_text)
            keyword_score = (matched / len(meaningful_words)) * 5.0

        # small bonus for near-matches so typos don't kill results
        fuzzy_score = 0.0
        if meaningful_words:
            tool_words = [w for w in signal_text.split() if len(w) >= 3]
            for qw in meaningful_words:
                best = max((_word_sim(qw, tw) for tw in tool_words), default=0.0)
                if best >= 0.80:
                    fuzzy_score += best * 0.5

        total = category_score + keyword_score + fuzzy_score

        # if we know the category, only return tools from that category
        if detected_category is not None and not in_target_category:
            continue

        # no category detected — only keep tools with a decent score
        # this stops vague queries like "I want an AI model" from dumping everything
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


def compare_tools(ids):
    tools = load_tools()
    return [tool for tool in tools if tool["id"] in ids]


def get_category_stats():
    tools = load_tools()
    stats = {}

    for tool in tools:
        category = tool.get("category", "Unknown")
        stats[category] = stats.get(category, 0) + 1

    return [{"category": category, "count": count} for category, count in stats.items()]