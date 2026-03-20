"""
Competitor estimation logic.
Identifies peer companies using TSE sector classification and revenue proximity.
"""

import logging
import datetime
from typing import Any

import requests

logger = logging.getLogger(__name__)

REVENUE_RATIO_MIN = 0.3
REVENUE_RATIO_MAX = 3.0
MAX_COMPETITORS = 5
EDINET_DOCS_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents.json"


def estimate_competitors(
    ticker: str,
    sector_code: str,
    revenue: float,
    sector_map: dict[str, Any],
    firestore_client: object,
) -> list[dict[str, Any]]:
    """
    Estimate the top competitor companies for a given target company.

    Algorithm:
        1. Retrieve all TSE-listed companies in the same 33-sector category.
        2. Filter to companies whose revenue is between
           REVENUE_RATIO_MIN * revenue and REVENUE_RATIO_MAX * revenue.
        3. Sort by revenue proximity (closest first) and return up to MAX_COMPETITORS.

    Args:
        ticker: Four-digit TSE ticker code of the target company.
        sector_code: TSE 33-sector code string (e.g. "3650" for Electric Appliances).
        revenue: Target company annual revenue in millions of JPY.
                 Pass 0.0 if unknown; all same-sector companies will be returned.
        sector_map: Parsed config/sector_map.json as a dict.
        firestore_client: Initialized FirestoreClient instance for reading cached revenue data.

    Returns:
        List of up to MAX_COMPETITORS CompetitorEntry dicts:
            ticker, company_name, reason.
    """
    logger.info(
        f"Estimating competitors for {ticker} (sector: {sector_code}, revenue: {revenue}M)"
    )

    try:
        sector_companies = get_sector_companies(sector_code)

        if not sector_companies:
            logger.warning(f"No companies found for sector {sector_code}")
            return []

        sector_name: str = ""
        sector_entry = sector_map.get(sector_code)
        if isinstance(sector_entry, dict):
            sector_name = sector_entry.get("name", sector_code)
        else:
            sector_name = sector_code

        candidates: list[dict[str, Any]] = []
        for company in sector_companies:
            comp_ticker = company.get("ticker", "")
            if comp_ticker == ticker:
                continue

            comp_revenue = get_simple_revenue(company.get("edinet_code", ""))
            if comp_revenue is None:
                continue

            lower_bound = revenue * REVENUE_RATIO_MIN
            upper_bound = revenue * REVENUE_RATIO_MAX

            if revenue > 0 and not (lower_bound <= comp_revenue <= upper_bound):
                continue

            revenue_diff = abs(comp_revenue - revenue)
            candidates.append(
                {
                    "ticker": comp_ticker,
                    "company_name": company.get("company_name", ""),
                    "revenue": comp_revenue,
                    "revenue_diff": revenue_diff,
                    "reason": (
                        f"同業種（{sector_name}）、"
                        f"売上規模類似（{int(comp_revenue):,}百万円）"
                    ),
                }
            )

        candidates.sort(key=lambda x: x["revenue_diff"])
        top = candidates[:MAX_COMPETITORS]

        return [
            {
                "ticker": c["ticker"],
                "company_name": c["company_name"],
                "reason": c["reason"],
            }
            for c in top
        ]

    except Exception as e:
        logger.error(f"Failed to estimate competitors: {e}")
        return []


def get_sector_companies(sector_code: str) -> list[dict[str, Any]]:
    """
    Retrieve all TSE-listed companies belonging to a given 33-sector code.

    Data source: EDINET company list (cached locally or fetched on demand).

    Args:
        sector_code: TSE 33-sector code string (e.g. "3650").

    Returns:
        List of dicts with keys: ticker, edinet_code, company_name, sector_code_33.
    """
    logger.info(f"Getting sector companies for code: {sector_code}")

    companies: list[dict[str, Any]] = []
    seen_tickers: set[str] = set()
    end_date = datetime.date.today()

    # Scan last 90 days of EDINET filings to collect unique companies in the sector.
    for i in range(90):
        check_date = end_date - datetime.timedelta(days=i)
        date_str = check_date.strftime("%Y-%m-%d")

        try:
            resp = requests.get(
                EDINET_DOCS_URL,
                params={"date": date_str, "type": 2},
                timeout=30,
            )
            if resp.status_code != 200:
                continue

            data: dict[str, Any] = resp.json()
            results: list[dict[str, Any]] = data.get("results") or []

            for doc in results:
                raw_code: str = doc.get("secCode", "") or ""
                doc_ticker = raw_code.rstrip("0")
                if not doc_ticker or doc_ticker in seen_tickers:
                    continue

                # industryCode may directly match the 33-sector code.
                if doc.get("industryCode") == sector_code:
                    seen_tickers.add(doc_ticker)
                    companies.append(
                        {
                            "ticker": doc_ticker,
                            "company_name": doc.get("filerName", ""),
                            "edinet_code": doc.get("edinetCode", ""),
                            "sector_code_33": sector_code,
                        }
                    )

            if len(companies) >= 50:
                break

        except Exception as e:
            logger.debug(f"Error fetching documents for {date_str}: {e}")
            continue

    return companies


def get_simple_revenue(edinet_code: str) -> float | None:
    """
    Fetch the most recent annual revenue figure for a company from EDINET.

    Used during competitor filtering to avoid requiring a full Firestore read
    for companies that have not been collected yet.

    Args:
        edinet_code: EDINET code of the company.

    Returns:
        Annual revenue in millions of JPY, or None if unavailable.
    """
    if not edinet_code:
        return None

    try:
        from collector.sources import edinet, xbrl_parser

        to_date = datetime.date.today().strftime("%Y-%m-%d")
        from_date = (datetime.date.today() - datetime.timedelta(days=400)).strftime(
            "%Y-%m-%d"
        )

        docs = edinet.search_documents(edinet_code, "120", from_date, to_date)
        if not docs:
            return None

        latest_doc = docs[0]
        xbrl_bytes = edinet.download_document(latest_doc["docID"], output_type=1)
        xbrl_result = xbrl_parser.parse_xbrl(xbrl_bytes)
        financials = xbrl_parser.extract_financials(xbrl_result)

        revenue_val = financials.get("revenue")
        if revenue_val is None:
            return None
        return float(revenue_val) or None

    except Exception as e:
        logger.debug(f"Failed to get revenue for {edinet_code}: {e}")
        return None
