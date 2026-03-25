"""
CLI script — run a one-shot crawl without starting the full server.

Usage (from slibai/backend/):
    python run_crawler.py
    python run_crawler.py --github-per-topic 15 --hf-limit 60
"""

import argparse
import sys
from pathlib import Path

# Make sure 'app' package is importable when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.crawler.runner import run_crawl  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="SLIBAI one-shot crawler")
    parser.add_argument("--github-per-topic", type=int, default=10,
                        help="Max repos per GitHub topic (default: 10)")
    parser.add_argument("--hf-limit", type=int, default=40,
                        help="Max HuggingFace spaces (default: 40)")
    args = parser.parse_args()

    result = run_crawl(
        github_per_topic=args.github_per_topic,
        hf_limit=args.hf_limit,
    )

    if result["status"] == "success":
        s = result["stats"]
        print(f"\nCrawl complete:")
        print(f"  Added:   {s['added']}")
        print(f"  Updated: {s['updated']}")
        print(f"  Removed: {s['removed']}")
        print(f"  Total:   {s['total']}")
        sys.exit(0)
    else:
        print(f"\nCrawl failed: {result.get('error')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
