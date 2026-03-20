"""EDINET API v2 client for fetching disclosure documents."""

import time
import logging
from collections.abc import Generator
from datetime import date, timedelta
from typing import Any

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2"
RETRY_COUNT = 3
RETRY_BASE_DELAY = 1.0  # seconds
REQUEST_TIMEOUT = 30
RATE_LIMIT_DELAY = 1.0  # seconds between requests


def _request_with_retry(url: str, params: dict[str, Any] | None = None) -> requests.Response:
    """Make HTTP GET request with retry and rate limiting."""
    last_exc: Exception | None = None
    for attempt in range(RETRY_COUNT):
        try:
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            time.sleep(RATE_LIMIT_DELAY)
            return response
        except requests.HTTPError as exc:
            last_exc = exc
            # 4xx errors (except 429) should not be retried
            if exc.response is not None and exc.response.status_code < 500 and exc.response.status_code != 429:
                raise
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "Request failed (attempt %d/%d): %s. Retrying in %.1fs",
                attempt + 1,
                RETRY_COUNT,
                exc,
                delay,
            )
            time.sleep(delay)
        except requests.RequestException as exc:
            last_exc = exc
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "Request error (attempt %d/%d): %s. Retrying in %.1fs",
                attempt + 1,
                RETRY_COUNT,
                exc,
                delay,
            )
            time.sleep(delay)

    raise RuntimeError(f"Request failed after {RETRY_COUNT} attempts: {url}") from last_exc


def _iter_date_range(from_date: str, to_date: str) -> Generator[str, None, None]:
    """Yield each date string between from_date and to_date inclusive."""
    start = date.fromisoformat(from_date)
    end = date.fromisoformat(to_date)
    current = start
    while current <= end:
        yield current.isoformat()
        current += timedelta(days=1)


def resolve_ticker(query: str) -> tuple[str, str, str]:
    """
    Resolve company name or ticker to (edinet_code, ticker, company_name).

    Args:
        query: Company name (Japanese) or 4-digit ticker code

    Returns:
        Tuple of (edinet_code, ticker, company_name)

    Raises:
        ValueError: If company not found
    """
    # Fetch a recent document list to get the submitter list
    # Use today's date and walk backwards up to 30 days to find a day with results
    today = date.today()
    is_ticker = query.isdigit() and len(query) == 4
    url = f"{BASE_URL}/documents.json"

    # For ticker-based search: scan weekly steps over 400 days (covers >1 year of filings).
    # For name-based search: scan daily over 30 days (recently active companies).
    if is_ticker:
        days_back_list = list(range(0, 400, 7))  # ~57 requests
    else:
        days_back_list = list(range(30))

    for days_back in days_back_list:
        check_date = (today - timedelta(days=days_back)).isoformat()
        params: dict[str, Any] = {"date": check_date, "type": 2}
        try:
            response = _request_with_retry(url, params=params)
            data = response.json()
        except Exception as exc:
            logger.debug("Could not fetch document list for %s: %s", check_date, exc)
            continue

        results: list[dict[str, Any]] = data.get("results", []) or []
        if not results:
            continue

        if is_ticker:
            for entry in results:
                # EDINET stores secCode as 5 digits with trailing "0" (e.g. "83540")
                securities_code = str(entry.get("secCode", "")).strip().rstrip("0")
                if securities_code == query:
                    edinet_code = entry.get("edinetCode", "")
                    company_name = entry.get("filerName", "")
                    logger.info(
                        "Resolved ticker=%s to edinet_code=%s name=%s (via %s)",
                        query, edinet_code, company_name, check_date,
                    )
                    return (edinet_code, query, company_name)
        else:
            # Name-based search: look for partial match in filerName
            query_lower = query.lower()
            for entry in results:
                filer_name: str = entry.get("filerName", "") or ""
                if query_lower in filer_name.lower() or query in filer_name:
                    edinet_code = entry.get("edinetCode", "")
                    # secCode may have trailing zero (e.g. "72030")
                    raw_code = str(entry.get("secCode", "")).strip()
                    ticker = raw_code.rstrip("0") if raw_code else ""
                    company_name = filer_name
                    logger.info(
                        "Resolved name=%s to ticker=%s edinet_code=%s (via %s)",
                        query, ticker, edinet_code, check_date,
                    )
                    return (edinet_code, ticker, company_name)

    raise ValueError(f"Company not found for query: {query!r}")


def search_documents(
    edinet_code: str,
    doc_type: str,
    from_date: str,
    to_date: str,
) -> list[dict[str, Any]]:
    """
    Search EDINET documents.

    Args:
        edinet_code: EDINET提出者コード
        doc_type: "120"=有価証券報告書, "140"=四半期報告書, "160"=決算短信
        from_date: Start date "YYYY-MM-DD"
        to_date: End date "YYYY-MM-DD"

    Returns:
        List of document metadata dicts
    """
    matched: list[dict[str, Any]] = []
    url = f"{BASE_URL}/documents.json"

    for check_date in _iter_date_range(from_date, to_date):
        params: dict[str, Any] = {"date": check_date, "type": 2}
        try:
            response = _request_with_retry(url, params=params)
            data = response.json()
        except Exception as exc:
            logger.debug("search_documents: skip date %s due to error: %s", check_date, exc)
            continue

        results: list[dict[str, Any]] = data.get("results", []) or []
        for entry in results:
            if entry.get("edinetCode") == edinet_code and str(entry.get("docTypeCode", "")) == doc_type:
                matched.append(entry)

    return matched


def download_document(doc_id: str, output_type: int = 1) -> bytes:
    """
    Download EDINET document.

    Args:
        doc_id: Document ID from search_documents
        output_type: 1=XBRL ZIP, 2=PDF

    Returns:
        Document content as bytes
    """
    url = f"{BASE_URL}/documents/{doc_id}"
    params: dict[str, Any] = {"type": output_type}
    response = _request_with_retry(url, params=params)
    return response.content


def get_company_meta(edinet_code: str) -> dict[str, Any]:
    """
    Get company metadata from EDINET.

    Args:
        edinet_code: EDINET提出者コード

    Returns:
        CompanyMeta-compatible dict
    """
    # Walk backwards from today to find a document list entry for this edinet_code
    today = date.today()
    url = f"{BASE_URL}/documents.json"

    for days_back in range(60):
        check_date = (today - timedelta(days=days_back)).isoformat()
        params: dict[str, Any] = {"date": check_date, "type": 2}
        try:
            response = _request_with_retry(url, params=params)
            data = response.json()
        except Exception as exc:
            logger.debug("get_company_meta: skip date %s: %s", check_date, exc)
            continue

        results: list[dict[str, Any]] = data.get("results", []) or []
        for entry in results:
            if entry.get("edinetCode") == edinet_code:
                raw_code = str(entry.get("secCode", "")).strip()
                ticker = raw_code.rstrip("0") if raw_code else ""
                meta: dict[str, Any] = {
                    "edinet_code": edinet_code,
                    "ticker": ticker,
                    "company_name": entry.get("filerName", ""),
                    "company_name_en": None,
                    "sector_code_33": "",
                    "sector_name": entry.get("industryCode", ""),
                    "listing_market": "プライム",  # default; not directly available from this endpoint
                    "founded_date": None,
                    "employee_count": None,
                    "fiscal_year_end": "",
                    "website_url": None,
                    "ir_url": None,
                    "description": None,
                }
                return meta

    raise ValueError(f"Company meta not found for edinet_code: {edinet_code!r}")
