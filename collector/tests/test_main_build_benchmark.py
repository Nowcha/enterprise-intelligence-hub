"""Tests for _build_benchmark_entry() in collector/main.py"""
import sys
import os
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub heavy imports before importing main
sys.modules.setdefault("firebase_admin", MagicMock())
sys.modules.setdefault("firebase_admin.credentials", MagicMock())
sys.modules.setdefault("firebase_admin.firestore", MagicMock())
sys.modules.setdefault("google.cloud.firestore", MagicMock())

import pytest

# Patch firestore_client and sources so main.py can be imported without side effects
with (
    patch.dict("sys.modules", {
        "firestore_client": MagicMock(),
        "sources.edinet": MagicMock(is_edinet_configured=lambda: False, EdinetNotConfiguredError=Exception),
        "sources.google_news": MagicMock(),
        "sources.stock_price": MagicMock(),
        "competitors.estimator": MagicMock(),
    }),
):
    from main import _build_benchmark_entry


# ──────────────────────────────────────────────────────────────
# _build_benchmark_entry
# ──────────────────────────────────────────────────────────────
class TestBuildBenchmarkEntry:
    def _make_collected(
        self,
        company_name="トヨタ自動車",
        financials=None,
        derived=None,
    ):
        if financials is None:
            financials = {
                "2024-03": {
                    "period": "2024-03",
                    "revenue": 44998600,
                    "operating_income": 5352900,
                    "roe": 14.0,
                },
            }
        if derived is None:
            derived = {"per": 8.5, "pbr": 1.1, "market_cap": 38000000}
        return {
            "meta": {"company_name": company_name},
            "financials": financials,
            "stock": {"derived": derived},
        }

    def test_returns_correct_ticker(self):
        result = _build_benchmark_entry("7203", self._make_collected())
        assert result["ticker"] == "7203"

    def test_returns_correct_company_name(self):
        result = _build_benchmark_entry("7203", self._make_collected())
        assert result["company_name"] == "トヨタ自動車"

    def test_falls_back_to_ticker_when_no_company_name(self):
        collected = self._make_collected(company_name="")
        result = _build_benchmark_entry("7203", collected)
        assert result["company_name"] == "7203"

    def test_selects_latest_financial_period(self):
        financials = {
            "2022-03": {"revenue": 10000, "operating_income": 1000, "roe": 5.0},
            "2024-03": {"revenue": 44998600, "operating_income": 5352900, "roe": 14.0},
            "2023-03": {"revenue": 30000, "operating_income": 3000, "roe": 10.0},
        }
        result = _build_benchmark_entry("7203", self._make_collected(financials=financials))
        assert result["revenue"] == 44998600

    def test_calculates_operating_margin(self):
        financials = {
            "2024-03": {"revenue": 100000, "operating_income": 15000, "roe": None},
        }
        result = _build_benchmark_entry("7203", self._make_collected(financials=financials))
        assert result["operating_margin"] == 15.0

    def test_operating_margin_zero_when_revenue_zero(self):
        financials = {
            "2024-03": {"revenue": 0, "operating_income": 0, "roe": None},
        }
        result = _build_benchmark_entry("7203", self._make_collected(financials=financials))
        assert result["operating_margin"] == 0.0

    def test_handles_none_revenue_in_financial(self):
        financials = {
            "2024-03": {"revenue": None, "operating_income": None, "roe": None},
        }
        result = _build_benchmark_entry("7203", self._make_collected(financials=financials))
        assert result["revenue"] == 0.0
        assert result["operating_margin"] == 0.0

    def test_extracts_roe(self):
        result = _build_benchmark_entry("7203", self._make_collected())
        assert result["roe"] == 14.0

    def test_extracts_derived_metrics(self):
        result = _build_benchmark_entry("7203", self._make_collected())
        assert result["per"] == 8.5
        assert result["pbr"] == 1.1
        assert result["market_cap"] == 38000000

    def test_returns_none_when_completely_empty(self):
        collected = {
            "meta": {"company_name": ""},
            "financials": {},
            "stock": {"derived": {}},
        }
        result = _build_benchmark_entry("", collected)
        assert result is None

    def test_returns_entry_when_only_company_name_known(self):
        collected = {
            "meta": {"company_name": "テスト株式会社"},
            "financials": {},
            "stock": {"derived": {}},
        }
        result = _build_benchmark_entry("9999", collected)
        assert result is not None
        assert result["company_name"] == "テスト株式会社"

    def test_operating_margin_rounded_to_2dp(self):
        financials = {
            "2024-03": {"revenue": 300, "operating_income": 100, "roe": None},
        }
        result = _build_benchmark_entry("1234", self._make_collected(financials=financials))
        assert result["operating_margin"] == 33.33

    def test_empty_financials_returns_zero_revenue(self):
        collected = self._make_collected()
        collected["financials"] = {}
        result = _build_benchmark_entry("7203", collected)
        assert result["revenue"] == 0.0
