"""IR page scraper for collecting press releases and IR news."""

import hashlib
import logging
import time
from typing import Any

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30
RATE_LIMIT_DELAY = 2.0
MAX_ARTICLES = 20


def scrape_ir_page(company_url: str) -> list[dict[str, Any]]:
    """
    Scrape IR press releases from a company's IR page.

    Args:
        company_url: URL of the company's IR page

    Returns:
        List of NewsArticle-compatible dicts (source="ir_page")
    """
    articles: list[dict[str, Any]] = []

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; EnterpriseIntelligenceHub/1.0)"
        }
        resp = requests.get(company_url, headers=headers, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding

        soup = BeautifulSoup(resp.text, "lxml")

        # IRニュースのリンクを抽出（一般的なパターン）
        # class名やid名はサイトによって異なるため、ベストエフォート
        news_items = _find_news_items(soup, company_url)

        for item in news_items[:MAX_ARTICLES]:
            article_hash = hashlib.sha256(item["url"].encode("utf-8")).hexdigest()[:32]
            articles.append(
                {
                    "article_hash": article_hash,
                    "title": item["title"],
                    "url": item["url"],
                    "source": "ir_page",
                    "published_at": item.get("published_at"),
                    "summary": None,
                    "schema_version": "1.0.0",
                }
            )

        time.sleep(RATE_LIMIT_DELAY)

    except Exception as e:
        logger.error(f"Failed to scrape IR page {company_url}: {e}")

    return articles


def _find_news_items(soup: BeautifulSoup, base_url: str) -> list[dict[str, Any]]:
    """Extract news items from parsed HTML."""
    from urllib.parse import urljoin

    items: list[dict[str, Any]] = []

    # IRニュースへの一般的なリンクパターン
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        title = a_tag.get_text(strip=True)

        if not title or len(title) < 5:
            continue

        # PDFやプレスリリースへのリンクを優先
        if any(kw in href.lower() for kw in ["news", "press", "ir", "release", "pdf"]):
            full_url = urljoin(base_url, href)
            items.append({"title": title, "url": full_url})

    return items[:MAX_ARTICLES]


def find_ir_url(company_name: str, ticker: str) -> str | None:
    """
    Try to find the IR page URL for a company.

    Args:
        company_name: Company name in Japanese
        ticker: TSE ticker code

    Returns:
        IR page URL or None
    """
    # 一般的な日本企業のIRページURLパターンを試みる
    common_patterns = [
        f"https://www.{ticker}.co.jp/ir/",
        f"https://ir.{ticker}.co.jp/",
    ]

    for url in common_patterns:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; EnterpriseIntelligenceHub/1.0)"
            }
            resp = requests.head(
                url, headers=headers, timeout=10, allow_redirects=True
            )
            if resp.status_code == 200:
                return url
        except Exception:
            continue

    logger.info(f"Could not find IR URL for {company_name} ({ticker})")
    return None
