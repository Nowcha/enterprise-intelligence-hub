"""
Google News RSS feed fetcher.
Retrieves recent news articles for a company or industry sector.
"""

import hashlib
import logging
import time
import urllib.parse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser

logger = logging.getLogger(__name__)

GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search"
MAX_RETRIES = 3
RATE_LIMIT_DELAY = 1.0


def fetch_news(company_name: str, max_articles: int = 30) -> list[dict[str, Any]]:
    """
    Fetch recent news articles for a company via Google News RSS.

    Args:
        company_name: Japanese company name used as the search query.
        max_articles: Maximum number of articles to return. Defaults to 30.

    Returns:
        List of dicts conforming to NewsArticle schema (without collected_at/schema_version):
            title, url, source, published_at, summary.
        summary is None at this stage; AI summary is added in the analyze phase.
    """
    query = urllib.parse.quote(company_name)
    url = f"{GOOGLE_NEWS_RSS_BASE}?q={query}&hl=ja&gl=JP&ceid=JP:ja"

    articles: list[dict[str, Any]] = []

    for attempt in range(MAX_RETRIES):
        try:
            feed = feedparser.parse(url)

            if feed.bozo and not feed.entries:
                logger.warning(
                    f"Failed to parse feed for '{company_name}': {feed.bozo_exception}"
                )
                if attempt < MAX_RETRIES - 1:
                    time.sleep(2**attempt)
                continue

            for entry in feed.entries[:max_articles]:
                try:
                    article = _parse_entry(entry)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.warning(f"Failed to parse entry: {e}")
                    continue

            break

        except Exception as e:
            logger.error(
                f"Failed to fetch news for '{company_name}' (attempt {attempt + 1}): {e}"
            )
            if attempt < MAX_RETRIES - 1:
                time.sleep(2**attempt)

    time.sleep(RATE_LIMIT_DELAY)
    return articles


def _parse_entry(entry: Any) -> dict[str, Any] | None:
    """Parse a single feedparser entry into NewsArticle format."""
    title: str = getattr(entry, "title", "") or ""
    url: str = getattr(entry, "link", "") or ""

    if not title or not url:
        return None

    article_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]

    published_at: datetime
    if hasattr(entry, "published"):
        try:
            published_at = parsedate_to_datetime(entry.published)
        except Exception:
            published_at = datetime.now(timezone.utc)
    else:
        published_at = datetime.now(timezone.utc)

    source = "google_news"
    if hasattr(entry, "source") and hasattr(entry.source, "title"):
        source = entry.source.title

    return {
        "article_hash": article_hash,
        "title": title,
        "url": url,
        "source": source,
        "published_at": published_at.isoformat(),
        "summary": None,
        "schema_version": "1.0.0",
    }


def fetch_industry_news(sector_name: str, max_articles: int = 20) -> list[dict[str, Any]]:
    """
    Fetch recent industry-level news articles via Google News RSS.

    Args:
        sector_name: TSE sector name in Japanese (e.g. "電気機器").
        max_articles: Maximum number of articles to return. Defaults to 20.

    Returns:
        List of dicts conforming to NewsArticle schema (summary is None).
    """
    return fetch_news(f"{sector_name} 業界", max_articles)


def deduplicate(
    articles: list[dict[str, Any]],
    existing_hashes: set[str],
) -> list[dict[str, Any]]:
    """
    Remove articles whose URL hash is already present in Firestore.

    Args:
        articles: List of article dicts, each containing an "article_hash" key.
        existing_hashes: Set of SHA-256 URL hashes already stored in Firestore.

    Returns:
        Filtered list containing only articles not present in existing_hashes.
    """
    seen_hashes: set[str] = set()
    unique_articles: list[dict[str, Any]] = []

    for article in articles:
        article_hash = article.get("article_hash", "")
        if (
            article_hash
            and article_hash not in existing_hashes
            and article_hash not in seen_hashes
        ):
            seen_hashes.add(article_hash)
            unique_articles.append(article)

    return unique_articles
