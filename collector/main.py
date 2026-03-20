"""
Data collection orchestrator.

Primary data sources (no API key required):
  - yfinance: company info, financials, stock prices
  - Google News RSS: news articles

Optional enhanced data sources (requires EDINET_API_KEY env var):
  - EDINET API: XBRL financials, governance data from annual reports

Set EDINET_API_KEY as a GitHub Secret / environment variable to enable
EDINET-based collection. Without it, yfinance data is used for financials.
"""

import argparse
import logging
import sys
from typing import Any

from firestore_client import FirestoreClient
from sources.edinet import is_edinet_configured, EdinetNotConfiguredError
from sources.google_news import fetch_news
from sources.stock_price import (
    fetch_stock_data,
    calculate_derived_metrics,
    get_company_info,
    get_financial_data,
)
from competitors.estimator import estimate_competitors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Collect company intelligence data and write to Firestore."
    )
    parser.add_argument(
        "--ticker",
        required=True,
        help="Four-digit TSE ticker code or company name.",
    )
    parser.add_argument(
        "--mode",
        choices=["full", "update"],
        default="full",
        help="'full' collects everything; 'update' collects only deltas.",
    )
    parser.add_argument(
        "--include-competitors",
        dest="include_competitors",
        type=lambda x: x.lower() in ("true", "1", "yes"),
        default=True,
        help="Whether to collect competitor data (default: true).",
    )
    return parser.parse_args()


def resolve_ticker_yfinance(ticker_query: str) -> tuple[str, str, str]:
    """
    Resolve a ticker code to (edinet_code, ticker, company_name) using yfinance.

    If query is a 4-digit ticker code, look it up via yfinance directly.
    edinet_code will be empty string (not available from yfinance).

    Args:
        ticker_query: Four-digit TSE ticker code.

    Returns:
        Tuple of (edinet_code, ticker, company_name).

    Raises:
        ValueError: If company cannot be found.
    """
    if not (ticker_query.isdigit() and len(ticker_query) == 4):
        raise ValueError(
            f"Name-based search requires EDINET_API_KEY. "
            f"Please provide a 4-digit ticker code instead of: {ticker_query!r}"
        )

    info = get_company_info(ticker_query)
    company_name = info.get("company_name", "")
    if not company_name:
        raise ValueError(f"Could not resolve ticker via yfinance: {ticker_query!r}")

    logger.info(
        "Resolved ticker=%s → company_name=%s (via yfinance, edinet_code=N/A)",
        ticker_query, company_name,
    )
    return ("", ticker_query, company_name)


def collect_company(
    ticker: str,
    edinet_code: str,
    company_name: str,
    mode: str,
    fs_client: FirestoreClient,
) -> dict[str, Any]:
    """
    Collect all available data for a company and write to Firestore.

    Always collected (no API key needed):
      - Company metadata        (yfinance)
      - Financial statements    (yfinance, up to 4 annual periods)
      - Stock price / metrics   (yfinance)
      - News articles           (Google News RSS)

    Collected only when EDINET_API_KEY is set:
      - Governance data         (EDINET PDF/XBRL)
      - Detailed XBRL financials (EDINET)

    Each source is wrapped in independent try/except so that one failure
    does not stop the rest of the pipeline.

    Args:
        ticker: Four-digit TSE ticker code.
        edinet_code: EDINET code (may be empty if resolved via yfinance).
        company_name: Human-readable company name.
        mode: "full" or "update".
        fs_client: Initialized FirestoreClient instance.

    Returns:
        Dict of collected data keyed by source name.
    """
    collected: dict[str, Any] = {}

    # --- Company metadata (yfinance) ---
    try:
        logger.info("Collecting company metadata for ticker=%s via yfinance", ticker)
        meta = get_company_info(ticker)
        # Merge edinet_code if we have one from EDINET resolution
        if edinet_code:
            meta["edinet_code"] = edinet_code
        meta["company_name"] = meta.get("company_name") or company_name
        fs_client.write_company_meta(ticker, meta)
        collected["meta"] = meta
        logger.info("Wrote company meta: %s", meta.get("company_name"))
    except Exception as exc:
        logger.warning("Failed to collect company meta for ticker=%s: %s", ticker, exc)

    # --- Financial data (yfinance) ---
    try:
        logger.info("Collecting financial data for ticker=%s via yfinance", ticker)
        financial_periods = get_financial_data(ticker)
        for period_data in financial_periods:
            period_key = period_data.get("period", "unknown")
            fs_client.write_financial(ticker, period_key, period_data)
        collected["financials"] = {p["period"]: p for p in financial_periods}
        logger.info("Wrote %d financial periods for ticker=%s", len(financial_periods), ticker)
    except Exception as exc:
        logger.warning("Failed to collect financial data for ticker=%s: %s", ticker, exc)

    # --- Stock price (yfinance) ---
    try:
        logger.info("Collecting stock price for ticker=%s via yfinance", ticker)
        period = "5y" if mode == "full" else "1mo"
        stock_raw = fetch_stock_data(ticker, period=period)
        latest_fin: dict[str, Any] = {}
        if collected.get("financials"):
            latest_fin = next(iter(collected["financials"].values()), {})
        stock_data = {
            **stock_raw,
            "derived": calculate_derived_metrics(stock_raw.get("daily", []), latest_fin),
        }
        fs_client.write_stock(ticker, stock_data)
        collected["stock"] = stock_data
        logger.info("Wrote stock data: %d daily records", len(stock_raw.get("daily", [])))
    except Exception as exc:
        logger.warning("Failed to collect stock data for ticker=%s: %s", ticker, exc)

    # --- News (Google News RSS) ---
    try:
        logger.info("Collecting news for ticker=%s company=%s", ticker, company_name)
        articles = fetch_news(company_name, max_articles=30)
        if articles:
            fs_client.write_news_batch(ticker, articles)
        collected["news"] = articles
        logger.info("Wrote %d news articles for ticker=%s", len(articles), ticker)
    except Exception as exc:
        logger.warning("Failed to collect news for ticker=%s: %s", ticker, exc)

    # --- EDINET features (optional: only when EDINET_API_KEY is configured) ---
    if is_edinet_configured() and edinet_code:
        _collect_edinet_features(ticker, edinet_code, mode, fs_client, collected)
    elif not is_edinet_configured():
        logger.info(
            "Skipping EDINET features for ticker=%s (EDINET_API_KEY not set). "
            "Set EDINET_API_KEY GitHub Secret to enable governance and XBRL collection.",
            ticker,
        )
    elif not edinet_code:
        logger.info(
            "Skipping EDINET features for ticker=%s (no edinet_code available).", ticker
        )

    return collected


def _collect_edinet_features(
    ticker: str,
    edinet_code: str,
    mode: str,
    fs_client: FirestoreClient,
    collected: dict[str, Any],
) -> None:
    """Collect EDINET-specific data (governance, XBRL). Requires EDINET_API_KEY."""
    from sources import edinet as edinet_mod
    from sources.pdf_extractor import (
        extract_text_from_pdf,
        extract_governance_section,
        extract_board_members,
        extract_major_shareholders,
        extract_executive_compensation,
    )
    import datetime

    # Fetch governance data from latest annual report PDF
    try:
        logger.info("Collecting governance data via EDINET for ticker=%s", ticker)
        to_date = datetime.date.today().strftime("%Y-%m-%d")
        from_date = (datetime.date.today() - datetime.timedelta(days=400)).strftime("%Y-%m-%d")
        docs = edinet_mod.search_documents(edinet_code, "120", from_date, to_date)
        if docs:
            latest_doc = docs[0]
            pdf_bytes = edinet_mod.download_document(latest_doc["docID"], output_type=2)
            full_text = extract_text_from_pdf(pdf_bytes)
            gov_text = extract_governance_section(full_text)
            board = extract_board_members(gov_text)
            shareholders = extract_major_shareholders(full_text)
            compensation = extract_executive_compensation(full_text)

            outside_count = sum(1 for m in board if m.get("is_outside"))
            outside_ratio = round(outside_count / len(board) * 100, 1) if board else 0.0

            governance_data: dict[str, Any] = {
                "board_members": board,
                "outside_director_ratio": outside_ratio,
                "committees": [],
                "executive_compensation": compensation,
                "major_shareholders": shareholders,
                "cross_shareholdings": [],
                "cg_report_url": None,
            }
            fs_client.write_governance(ticker, governance_data)
            collected["governance"] = governance_data
            logger.info("Wrote governance data for ticker=%s (%d board members)", ticker, len(board))
        else:
            logger.warning("No annual reports found in EDINET for ticker=%s", ticker)
    except EdinetNotConfiguredError:
        logger.warning("EDINET not configured; skipping governance for ticker=%s", ticker)
    except Exception as exc:
        logger.warning("Failed to collect governance for ticker=%s: %s", ticker, exc)


def collect_competitor_data(
    competitor_tickers: list[str],
    mode: str,
    fs_client: FirestoreClient,
) -> None:
    """Collect basic data for each estimated competitor."""
    for comp_ticker in competitor_tickers:
        try:
            logger.info("Collecting competitor data for ticker=%s", comp_ticker)
            _, resolved_ticker, comp_name = resolve_ticker_yfinance(comp_ticker)
            collect_company(resolved_ticker, "", comp_name, mode, fs_client)
        except Exception as exc:
            logger.warning("Failed to collect data for competitor ticker=%s: %s", comp_ticker, exc)


def main() -> None:
    """Entry point for the data collection pipeline."""
    args = parse_args()

    edinet_status = "enabled" if is_edinet_configured() else "disabled (EDINET_API_KEY not set)"
    logger.info(
        "Starting collection: ticker=%s mode=%s include_competitors=%s edinet=%s",
        args.ticker, args.mode, args.include_competitors, edinet_status,
    )

    # Initialize Firestore client
    try:
        fs_client = FirestoreClient()
    except Exception as exc:
        logger.error("Failed to initialize FirestoreClient: %s", exc)
        sys.exit(1)

    # Step 1: Resolve ticker
    # Primary: yfinance (always available, no API key needed)
    # Fallback: EDINET (if API key is configured)
    ticker: str
    edinet_code: str
    company_name: str

    try:
        edinet_code, ticker, company_name = resolve_ticker_yfinance(args.ticker)
    except Exception as yf_exc:
        logger.warning("yfinance resolution failed: %s. Trying EDINET...", yf_exc)
        if not is_edinet_configured():
            logger.error(
                "Could not resolve ticker=%s. "
                "yfinance failed and EDINET_API_KEY is not set. "
                "Register at https://api.edinet-fsa.go.jp/ for EDINET access.",
                args.ticker,
            )
            sys.exit(1)
        try:
            from sources.edinet import resolve_ticker as edinet_resolve
            edinet_code, ticker, company_name = edinet_resolve(args.ticker)
        except Exception as edinet_exc:
            logger.error(
                "Could not resolve ticker=%s via yfinance (%s) or EDINET (%s).",
                args.ticker, yf_exc, edinet_exc,
            )
            sys.exit(1)

    logger.info("Resolved: ticker=%s edinet_code=%s company_name=%s", ticker, edinet_code, company_name)

    # Step 2: Collect data for the target company
    collected = collect_company(ticker, edinet_code, company_name, args.mode, fs_client)

    # Step 3: Estimate and collect competitor data (full mode only)
    if args.mode == "full" and args.include_competitors:
        try:
            import json as _json
            import pathlib

            sector_map_path = pathlib.Path(__file__).parent.parent / "config" / "sector_map.json"
            sector_map: dict[str, Any] = _json.loads(sector_map_path.read_text(encoding="utf-8"))

            meta = collected.get("meta", {})
            sector_code: str = meta.get("sector_code_33", "")
            revenue: float = 0.0
            if collected.get("financials"):
                latest_fin = next(iter(collected["financials"].values()), {})
                revenue = float(latest_fin.get("revenue", 0.0))

            competitors = estimate_competitors(
                ticker=ticker,
                sector_code=sector_code,
                revenue=revenue,
                sector_map=sector_map,
                firestore_client=fs_client,
            )

            competitor_tickers = [c["ticker"] for c in competitors]
            fs_client.write_competitors(ticker, {
                "target_ticker": ticker,
                "estimated_competitors": competitors,
                "manual_competitors": [],
                "benchmark_data": [],
                "estimation_method": "sector_revenue_filter",
            })
            logger.info("Estimated %d competitors for ticker=%s", len(competitors), ticker)

            collect_competitor_data(competitor_tickers, args.mode, fs_client)

        except Exception as exc:
            logger.warning("Competitor estimation/collection failed: %s", exc)

    logger.info("Collection pipeline completed for ticker=%s", ticker)


if __name__ == "__main__":
    main()
