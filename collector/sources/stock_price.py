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


def get_company_info(ticker: str) -> dict[str, Any]:
    """
    Get company metadata from yfinance (no API key required).

    Args:
        ticker: Four-digit TSE ticker code.

    Returns:
        CompanyMeta-compatible dict. edinet_code will be empty string.

    Raises:
        ValueError: If the ticker is not found or returns no data.
    """
    import yfinance as yf

    yf_ticker_str = f"{ticker}.T"
    for attempt in range(MAX_RETRIES):
        try:
            stock = yf.Ticker(yf_ticker_str)
            info: dict[str, Any] = stock.info or {}
            name = info.get("longName") or info.get("shortName") or ""
            if not name:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY)
                    continue
                raise ValueError(f"No company info found for ticker {yf_ticker_str}")

            employees = info.get("fullTimeEmployees")
            return {
                "edinet_code": "",
                "ticker": ticker,
                "company_name": name,
                "company_name_en": info.get("longName"),
                "sector_code_33": "",
                "sector_name": info.get("sector") or info.get("industry") or "",
                "listing_market": "プライム",
                "founded_date": None,
                "employee_count": int(employees) if employees else None,
                "fiscal_year_end": "",
                "website_url": info.get("website"),
                "ir_url": None,
                "description": info.get("longBusinessSummary"),
            }
        except ValueError:
            raise
        except Exception as exc:
            logger.warning("get_company_info attempt %d failed for %s: %s", attempt + 1, yf_ticker_str, exc)
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)

    raise ValueError(f"Could not retrieve company info for {yf_ticker_str}")


def get_financial_data(ticker: str) -> list[dict[str, Any]]:
    """
    Get annual financial data from yfinance (no API key required).

    Extracts income statement, balance sheet, and cash flow data.
    Values are converted to million yen (百万円).

    Args:
        ticker: Four-digit TSE ticker code.

    Returns:
        List of FinancialPeriod-compatible dicts (annual, up to 4 periods).
        data_source is set to "yfinance".
    """
    import math
    import yfinance as yf

    yf_ticker_str = f"{ticker}.T"
    financials: list[dict[str, Any]] = []

    try:
        stock = yf.Ticker(yf_ticker_str)
        income = stock.income_stmt
        balance = stock.balance_sheet
        cashflow = stock.cashflow

        if income is None or income.empty:
            logger.warning("No income statement data for %s", yf_ticker_str)
            return financials

        def _get(df: Any, col: Any, *keys: str) -> float | None:
            """Extract a value from a DataFrame, trying multiple row keys."""
            if df is None or df.empty:
                return None
            for key in keys:
                try:
                    if key in df.index:
                        val = df.loc[key, col]
                        if val is not None and not (isinstance(val, float) and math.isnan(val)):
                            # Convert from yen to million yen
                            return round(float(val) / 1_000_000, 2)
                except Exception:
                    continue
            return None

        for col in income.columns:
            period_str = col.strftime("%Y-%m") if hasattr(col, "strftime") else str(col)[:7]

            revenue = _get(income, col, "Total Revenue", "Revenue", "Operating Revenue")
            op_income = _get(income, col, "Operating Income", "Operating Revenue", "EBIT")
            net_income = _get(income, col, "Net Income", "Net Income Common Stockholders")
            total_assets = _get(balance, col, "Total Assets")
            equity = _get(balance, col, "Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest")
            op_cf = _get(cashflow, col, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
            inv_cf = _get(cashflow, col, "Investing Cash Flow", "Cash Flow From Continuing Investing Activities")
            fin_cf = _get(cashflow, col, "Financing Cash Flow", "Cash Flow From Continuing Financing Activities")

            if revenue is None and net_income is None:
                continue

            equity_ratio = None
            if equity is not None and total_assets and total_assets > 0:
                equity_ratio = round(equity / total_assets * 100, 2)

            roe = None
            if net_income is not None and equity and equity > 0:
                roe = round(net_income / equity * 100, 2)

            roa = None
            if net_income is not None and total_assets and total_assets > 0:
                roa = round(net_income / total_assets * 100, 2)

            financials.append({
                "period": period_str,
                "period_type": "annual",
                "revenue": revenue or 0,
                "operating_income": op_income or 0,
                "ordinary_income": op_income or 0,
                "net_income": net_income or 0,
                "total_assets": total_assets or 0,
                "net_assets": equity or 0,
                "equity_ratio": equity_ratio or 0.0,
                "roe": roe,
                "roa": roa,
                "operating_cf": op_cf,
                "investing_cf": inv_cf,
                "financing_cf": fin_cf,
                "eps": None,
                "dividend_per_share": None,
                "segments": [],
                "data_source": "yfinance",
                "schema_version": "1.0.0",
            })

    except Exception as exc:
        logger.error("Failed to get financial data from yfinance for %s: %s", yf_ticker_str, exc)

    logger.info("Retrieved %d financial periods from yfinance for %s", len(financials), yf_ticker_str)
    return financials


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
