import json
from pathlib import Path
from difflib import SequenceMatcher

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "ai_tools.json"


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


def search_tools(query: str):
    tools = load_tools()
    query_lower = query.lower().strip()
    query_words = [w for w in query_lower.split() if len(w) >= 2]

    if not query_words:
        return []

    # Pass 1: exact substring match across key fields
    exact_results = [
        tool for tool in tools
        if query_lower in _tool_full_text(tool)
    ]
    if exact_results:
        return exact_results

    # Pass 2: all query words are exact substrings somewhere in the tool text
    word_results = [
        tool for tool in tools
        if all(w in _tool_full_text(tool) for w in query_words)
    ]
    if word_results:
        return word_results

    # Pass 3: word-level fuzzy match
    # Compare each query word against every individual word in the tool's text.
    # This handles typos like "vison"→"vision" or "vsion"→"vision" correctly,
    # because we compare short words to short words (not a short query to a long sentence).
    THRESHOLD = 0.72
    scored = []
    for tool in tools:
        tool_words = [w for w in _tool_full_text(tool).split() if len(w) >= 2]
        if not tool_words:
            continue

        # For each query word, find the best-matching word in the tool's text
        total = 0.0
        for qw in query_words:
            best = max((_word_sim(qw, tw) for tw in tool_words), default=0.0)
            total += best

        avg = total / len(query_words)
        if avg >= THRESHOLD:
            scored.append((avg, tool))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in scored]


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