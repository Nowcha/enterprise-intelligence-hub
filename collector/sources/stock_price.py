"""
Stock price fetcher using yfinance.
Retrieves historical OHLCV data and calculates technical/fundamental metrics.
"""

import logging
import math
import statistics
import time
from typing import Any

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_DELAY = 2.0


def fetch_stock_data(ticker: str, period: str = "5y") -> dict[str, Any]:
    """
    Fetch historical daily OHLCV data for a TSE-listed stock via yfinance.

    Appends ".T" to the ticker code to form the Yahoo Finance symbol
    (e.g. "7203" -> "7203.T").

    Args:
        ticker: Four-digit TSE ticker code.
        period: yfinance period string. Defaults to "5y" (five years).
                Use "1mo" for update mode.

    Returns:
        Dictionary with keys:
            "daily": list of DailyPrice dicts (date, open, high, low, close, volume),
            "derived": dict of calculated metrics,
            "schema_version": str.

    Raises:
        ValueError: If no data is returned for the ticker.
    """
    import yfinance as yf

    yf_ticker = f"{ticker}.T"

    for attempt in range(MAX_RETRIES):
        try:
            stock = yf.Ticker(yf_ticker)
            hist = stock.history(period=period)

            if hist.empty:
                logger.warning(f"No history data for {yf_ticker}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    continue
                raise ValueError(f"No data returned for ticker {yf_ticker}")

            daily_data: list[dict[str, Any]] = []
            for date, row in hist.iterrows():
                daily_data.append(
                    {
                        "date": date.strftime("%Y-%m-%d"),
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(row["Close"]), 2),
                        "volume": int(row["Volume"]),
                    }
                )

            derived = _calculate_stock_metrics(daily_data, stock)

            return {
                "daily": daily_data,
                "derived": derived,
                "schema_version": "1.0.0",
            }

        except ValueError:
            raise
        except Exception as e:
            logger.error(
                f"Failed to fetch stock data for {yf_ticker} (attempt {attempt + 1}): {e}"
            )
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))

    return {}


def _calculate_stock_metrics(
    daily_data: list[dict[str, Any]], stock: Any
) -> dict[str, Any]:
    """Calculate derived stock metrics from price history and yfinance info."""
    derived: dict[str, Any] = {
        "per": None,
        "pbr": None,
        "market_cap": None,
        "dividend_yield": None,
        "ma_50": None,
        "ma_200": None,
        "volatility_30d": None,
    }

    if not daily_data:
        return derived

    closes = [d["close"] for d in daily_data]

    if len(closes) >= 50:
        derived["ma_50"] = round(sum(closes[-50:]) / 50, 2)
    if len(closes) >= 200:
        derived["ma_200"] = round(sum(closes[-200:]) / 200, 2)

    if len(closes) >= 30:
        recent_30 = closes[-30:]
        try:
            mean_price = sum(recent_30) / len(recent_30)
            if mean_price > 0:
                vol = statistics.stdev(recent_30) / mean_price * 100
                derived["volatility_30d"] = round(vol, 2)
        except statistics.StatisticsError:
            pass

    try:
        info: dict[str, Any] = stock.info or {}
        if info:
            per_val = info.get("trailingPE") or info.get("forwardPE")
            if per_val and not math.isnan(float(per_val)):
                derived["per"] = round(float(per_val), 2)

            pbr_val = info.get("priceToBook")
            if pbr_val and not math.isnan(float(pbr_val)):
                derived["pbr"] = round(float(pbr_val), 2)

            market_cap_val = info.get("marketCap")
            if market_cap_val:
                derived["market_cap"] = int(market_cap_val / 1_000_000)

            div_yield_val = info.get("dividendYield")
            if div_yield_val and not math.isnan(float(div_yield_val)):
                derived["dividend_yield"] = round(float(div_yield_val) * 100, 2)
    except Exception as e:
        logger.warning(f"Failed to get stock info: {e}")

    return derived


def calculate_derived_metrics(
    daily_data: list[dict[str, Any]],
    financials: dict[str, Any],
) -> dict[str, Any]:
    """
    Calculate fundamental and technical derived metrics from stock price data.

    Derived metrics:
        per, pbr, market_cap, dividend_yield (from financials),
        ma_50, ma_200 (simple moving averages),
        volatility_30d (annualized 30-day close-to-close volatility).

    Args:
        daily_data: List of DailyPrice dicts as returned by fetch_stock_data().
        financials: Latest FinancialPeriod dict used for EPS, book value, etc.
                    May be empty dict if financials are not yet available.

    Returns:
        Dictionary with keys: per, pbr, market_cap, dividend_yield,
                               ma_50, ma_200, volatility_30d.
        All values are float or None if required data is insufficient.
    """
    metrics: dict[str, Any] = {
        "per": None,
        "pbr": None,
        "market_cap": None,
        "dividend_yield": None,
        "ma_50": None,
        "ma_200": None,
        "volatility_30d": None,
    }

    if not daily_data:
        return metrics

    closes = [d["close"] for d in daily_data]
    latest_price = closes[-1] if closes else None

    if len(closes) >= 50:
        metrics["ma_50"] = round(sum(closes[-50:]) / 50, 2)
    if len(closes) >= 200:
        metrics["ma_200"] = round(sum(closes[-200:]) / 200, 2)

    if len(closes) >= 30:
        recent_30 = closes[-30:]
        try:
            mean_price = sum(recent_30) / len(recent_30)
            if mean_price > 0:
                vol = statistics.stdev(recent_30) / mean_price * 100
                metrics["volatility_30d"] = round(vol, 2)
        except statistics.StatisticsError:
            pass

    if not latest_price or not financials:
        return metrics

    eps = financials.get("eps")
    if eps and float(eps) > 0:
        metrics["per"] = round(latest_price / float(eps), 2)

    dividend = financials.get("dividend_per_share")
    if dividend and float(dividend) > 0:
        metrics["dividend_yield"] = round(float(dividend) / latest_price * 100, 2)

    return metrics
