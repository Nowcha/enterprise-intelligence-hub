"""EDINET API v2 client for fetching disclosure documents.

NOTE: EDINET API v2 requires a subscription key (Ocp-Apim-Subscription-Key header).
Set the EDINET_API_KEY environment variable to enable EDINET features.
Without this key, all functions raise EdinetNotConfiguredError immediately.

Key registration: https://api.edinet-fsa.go.jp/
"""

import os
import time
import logging
from collections.abc import Generator
from datetime import date, timedelta
from typing import Any

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2"
RETRY_COUNT = 3
RETRY_BASE_DELAY = 1.0
REQUEST_TIMEOUT = 30
RATE_LIMIT_DELAY = 1.0
META_RATE_LIMIT_DELAY = 0.5

_edinet_entry_cache: dict[str, dict[str, Any]] = {}


class EdinetNotConfiguredError(RuntimeError):
    """Raised when EDINET_API_KEY is not set."""


def _get_api_key() -> str | None:
    """Return EDINET API key from environment, or None if not configured."""
    return os.environ.get("EDINET_API_KEY") or None


def is_edinet_configured() -> bool:
    """Return True if EDINET_API_KEY is set in environment."""
    return _get_api_key() is not None


def _auth_headers() -> dict[str, str]:
    """Return headers including the subscription key."""
    key = _get_api_key()
    if not key:
        raise EdinetNotConfiguredError(
            "EDINET_API_KEY environment variable is not set. "
            "Register at https://api.edinet-fsa.go.jp/ to obtain a key."
        )
    return {"Ocp-Apim-Subscription-Key": key}


def _request_with_retry(
    url: str,
    params: dict[str, Any] | None = None,
    rate_limit_delay: float = RATE_LIMIT_DELAY,
) -> requests.Response:
    """Make HTTP GET request with retry, rate limiting, and auth header."""
    headers = _auth_headers()  # raises EdinetNotConfiguredError if key missing
    last_exc: Exception | None = None
    for attempt in range(RETRY_COUNT):
        try:
            response = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            time.sleep(rate_limit_delay)
            return response
        except requests.HTTPError as exc:
            last_exc = exc
            status = exc.response.status_code if exc.response is not None else 0
            if status == 401:
                raise EdinetNotConfiguredError(
                    f"EDINET API returned 401. Check that EDINET_API_KEY is valid. URL={url}"
                ) from exc
            if status < 500 and status != 429:
                raise
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "Request failed (attempt %d/%d): %s. Retrying in %.1fs",
                attempt + 1, RETRY_COUNT, exc, delay,
            )
            time.sleep(delay)
        except requests.RequestException as exc:
            last_exc = exc
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "Request error (attempt %d/%d): %s. Retrying in %.1fs",
                attempt + 1, RETRY_COUNT, exc, delay,
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


def _build_meta_from_entry(edinet_code: str, entry: dict[str, Any]) -> dict[str, Any]:
    """Build a CompanyMeta-compatible dict from a raw EDINET document list entry."""
    raw_code = str(entry.get("secCode", "")).strip()
    ticker = raw_code.rstrip("0") if raw_code else ""
    return {
        "edinet_code": edinet_code,
        "ticker": ticker,
        "company_name": entry.get("filerName", ""),
        "company_name_en": None,
        "sector_code_33": "",
        "sector_name": entry.get("industryCode", ""),
        "listing_market": "プライム",
        "founded_date": None,
        "employee_count": None,
        "fiscal_year_end": "",
        "website_url": None,
        "ir_url": None,
        "description": None,
    }


def resolve_ticker(query: str) -> tuple[str, str, str]:
    """
    Resolve company name or ticker to (edinet_code, ticker, company_name).

    Requires EDINET_API_KEY to be set. Raises EdinetNotConfiguredError if not.
    Scans daily for 400 days to handle companies that only file annual reports.

    Args:
        query: Company name (Japanese) or 4-digit ticker code

    Returns:
        Tuple of (edinet_code, ticker, company_name)

    Raises:
        EdinetNotConfiguredError: If EDINET_API_KEY is not configured
        ValueError: If company not found
    """
    if not is_edinet_configured():
        raise EdinetNotConfiguredError(
            "EDINET_API_KEY not set. Cannot resolve ticker via EDINET."
        )

    today = date.today()
    is_ticker = query.isdigit() and len(query) == 4
    url = f"{BASE_URL}/documents.json"
    days_range = 400 if is_ticker else 30

    for days_back in range(days_range):
        check_date = (today - timedelta(days=days_back)).isoformat()
        params: dict[str, Any] = {"date": check_date, "type": 2}
        try:
            response = _request_with_retry(url, params=params, rate_limit_delay=META_RATE_LIMIT_DELAY)
            data = response.json()
        except EdinetNotConfiguredError:
            raise
        except Exception as exc:
            logger.debug("Could not fetch document list for %s: %s", check_date, exc)
            continue

        results: list[dict[str, Any]] = data.get("results", []) or []
        if not results:
            continue

        if is_ticker:
            for entry in results:
                securities_code = str(entry.get("secCode", "")).strip().rstrip("0")
                if securities_code == query:
                    edinet_code = entry.get("edinetCode", "")
                    company_name = entry.get("filerName", "")
                    _edinet_entry_cache[edinet_code] = entry
                    logger.info(
                        "Resolved ticker=%s → edinet_code=%s name=%s (-%d days)",
                        query, edinet_code, company_name, days_back,
                    )
                    return (edinet_code, query, company_name)
        else:
            query_lower = query.lower()
            for entry in results:
                filer_name: str = entry.get("filerName", "") or ""
                if query_lower in filer_name.lower() or query in filer_name:
                    edinet_code = entry.get("edinetCode", "")
                    raw_code = str(entry.get("secCode", "")).strip()
                    ticker = raw_code.rstrip("0") if raw_code else ""
                    company_name = filer_name
                    _edinet_entry_cache[edinet_code] = entry
                    logger.info(
                        "Resolved name=%s → ticker=%s edinet_code=%s (-%d days)",
                        query, ticker, edinet_code, days_back,
                    )
                    return (edinet_code, ticker, company_name)

    raise ValueError(f"Company not found for query: {query!r}")


def search_documents(
    edinet_code: str,
    doc_type: str,
    from_date: str,
    to_date: str,
) -> list[dict[str, Any]]:
    """Search EDINET documents. Requires EDINET_API_KEY."""
    matched: list[dict[str, Any]] = []
    url = f"{BASE_URL}/documents.json"

    for check_date in _iter_date_range(from_date, to_date):
        params: dict[str, Any] = {"date": check_date, "type": 2}
        try:
            response = _request_with_retry(url, params=params, rate_limit_delay=META_RATE_LIMIT_DELAY)
            data = response.json()
        except EdinetNotConfiguredError:
            raise
        except Exception as exc:
            logger.debug("search_documents: skip date %s: %s", check_date, exc)
            continue

        results: list[dict[str, Any]] = data.get("results", []) or []
        for entry in results:
            if entry.get("edinetCode") == edinet_code and str(entry.get("docTypeCode", "")) == doc_type:
                matched.append(entry)

    return matched


def download_document(doc_id: str, output_type: int = 1) -> bytes:
    """Download EDINET document. Requires EDINET_API_KEY."""
    url = f"{BASE_URL}/documents/{doc_id}"
    params: dict[str, Any] = {"type": output_type}
    response = _request_with_retry(url, params=params, rate_limit_delay=RATE_LIMIT_DELAY)
    return response.content


def get_company_meta(edinet_code: str) -> dict[str, Any]:
    """Get company metadata from EDINET. Requires EDINET_API_KEY."""
    if edinet_code in _edinet_entry_cache:
        logger.info("get_company_meta: cache hit for edinet_code=%s", edinet_code)
        return _build_meta_from_entry(edinet_code, _edinet_entry_cache[edinet_code])

    today = date.today()
    url = f"{BASE_URL}/documents.json"

    for days_back in range(400):
        check_date = (today - timedelta(days=days_back)).isoformat()
        params: dict[str, Any] = {"date": check_date, "type": 2}
        try:
            response = _request_with_retry(url, params=params, rate_limit_delay=META_RATE_LIMIT_DELAY)
            data = response.json()
        except EdinetNotConfiguredError:
            raise
        except Exception as exc:
            logger.debug("get_company_meta: skip date %s: %s", check_date, exc)
            continue

        results: list[dict[str, Any]] = data.get("results", []) or []
        for entry in results:
            if entry.get("edinetCode") == edinet_code:
                _edinet_entry_cache[edinet_code] = entry
                return _build_meta_from_entry(edinet_code, entry)

    raise ValueError(f"Company meta not found for edinet_code: {edinet_code!r}")
