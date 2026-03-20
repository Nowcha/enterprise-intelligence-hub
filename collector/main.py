"""
Data collection orchestrator.
Coordinates all data sources and writes results to Firestore.
"""

import argparse
import logging
import sys
from typing import Any

from firestore_client import FirestoreClient
from sources.edinet import get_company_meta, resolve_ticker
from sources.google_news import fetch_news
from sources.stock_price import fetch_stock_data, calculate_derived_metrics
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
        help="Collection mode: 'full' collects everything, 'update' collects only deltas.",
    )
    parser.add_argument(
        "--include-competitors",
        dest="include_competitors",
        type=lambda x: x.lower() in ("true", "1", "yes"),
        default=True,
        help="Whether to collect competitor data (default: true).",
    )
    return parser.parse_args()


def collect_company(
    ticker: str,
    edinet_code: str,
    company_name: str,
    mode: str,
    fs_client: FirestoreClient,
) -> dict[str, Any]:
    """
    Collect all data for a single company and write to Firestore.

    Each data source is wrapped in an independent try/except so that a failure
    in one source does not abort collection for the remaining sources.

    Args:
        ticker: Four-digit TSE ticker code.
        edinet_code: EDINET code for the company.
        company_name: Human-readable company name.
        mode: "full" or "update".
        fs_client: Initialized FirestoreClient instance.

    Returns:
        Dictionary containing collected data keyed by source name.
    """
    collected: dict[str, Any] = {}

    # --- Company metadata (EDINET) ---
    try:
        logger.info("Collecting company metadata for ticker=%s", ticker)
        meta = get_company_meta(edinet_code)
        fs_client.write_company_meta(ticker, meta)
        collected["meta"] = meta
    except Exception as exc:
        logger.warning("Failed to collect company meta for ticker=%s: %s", ticker, exc)

    # --- News (Google News RSS) ---
    try:
        logger.info("Collecting news for ticker=%s company_name=%s", ticker, company_name)
        articles = fetch_news(company_name, max_articles=30)
        if articles:
            fs_client.write_news_batch(ticker, articles)
        collected["news"] = articles
    except Exception as exc:
        logger.warning("Failed to collect news for ticker=%s: %s", ticker, exc)

    # --- Stock price (yfinance) ---
    try:
        logger.info("Collecting stock price for ticker=%s", ticker)
        period = "5y" if mode == "full" else "1mo"
        stock_raw = fetch_stock_data(ticker, period=period)
        # calculate_derived_metrics requires financials; use empty dict as placeholder
        financials: dict[str, Any] = collected.get("meta", {})
        stock_data = {
            **stock_raw,
            "derived": calculate_derived_metrics(
                stock_raw.get("daily", []), financials
            ),
        }
        fs_client.write_stock(ticker, stock_data)
        collected["stock"] = stock_data
    except Exception as exc:
        logger.warning("Failed to collect stock data for ticker=%s: %s", ticker, exc)

    return collected


def collect_competitor_data(
    competitor_tickers: list[str],
    mode: str,
    fs_client: FirestoreClient,
) -> None:
    """
    Collect basic data for each estimated competitor.

    Args:
        competitor_tickers: List of four-digit TSE ticker codes.
        mode: "full" or "update".
        fs_client: Initialized FirestoreClient instance.
    """
    for comp_ticker in competitor_tickers:
        try:
            logger.info("Collecting competitor data for ticker=%s", comp_ticker)
            resolved_ticker, edinet_code, comp_name = resolve_ticker(comp_ticker)
            collect_company(resolved_ticker, edinet_code, comp_name, mode, fs_client)
        except Exception as exc:
            logger.warning(
                "Failed to collect data for competitor ticker=%s: %s", comp_ticker, exc
            )


def main() -> None:
    """Entry point for the data collection pipeline."""
    args = parse_args()

    logger.info(
        "Starting collection: ticker=%s mode=%s include_competitors=%s",
        args.ticker,
        args.mode,
        args.include_competitors,
    )

    # Initialize Firestore client
    try:
        fs_client = FirestoreClient()
    except Exception as exc:
        logger.error("Failed to initialize FirestoreClient: %s", exc)
        sys.exit(1)

    # Step 1: Resolve ticker / company name to canonical ticker + EDINET code
    try:
        ticker, edinet_code, company_name = resolve_ticker(args.ticker)
        logger.info(
            "Resolved: ticker=%s edinet_code=%s company_name=%s",
            ticker,
            edinet_code,
            company_name,
        )
    except Exception as exc:
        logger.error("Could not resolve ticker '%s': %s", args.ticker, exc)
        sys.exit(1)

    # Step 2: Collect data for the target company
    collected = collect_company(ticker, edinet_code, company_name, args.mode, fs_client)

    # Step 3: Estimate and collect competitor data (full mode only)
    if args.mode == "full" and args.include_competitors:
        try:
            import json as _json
            import pathlib

            sector_map_path = (
                pathlib.Path(__file__).parent.parent / "config" / "sector_map.json"
            )
            sector_map: dict[str, Any] = _json.loads(sector_map_path.read_text(encoding="utf-8"))

            meta = collected.get("meta", {})
            sector_code: str = meta.get("sector_code_33", "")
            revenue: float = 0.0
            # Revenue may be available from financial data if collected above
            if "financials" in collected:
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

            collect_competitor_data(competitor_tickers, args.mode, fs_client)

        except Exception as exc:
            logger.warning("Competitor estimation/collection failed: %s", exc)

    logger.info("Collection pipeline completed for ticker=%s", ticker)


if __name__ == "__main__":
    main()
