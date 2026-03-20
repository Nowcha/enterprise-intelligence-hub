"""
Firestore client for writing company data.
Wraps firebase-admin SDK and provides a unified interface for all write operations.
"""

import hashlib
import json
import logging
import os
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import SERVER_TIMESTAMP  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "1.0.0"
FIRESTORE_BATCH_LIMIT = 500


class FirestoreClient:
    """Client for writing company intelligence data to Cloud Firestore."""

    def __init__(self) -> None:
        """Initialize Firebase app from FIREBASE_SERVICE_ACCOUNT_JSON environment variable."""
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            raise EnvironmentError(
                "FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set."
            )

        service_account_info: dict[str, Any] = json.loads(service_account_json)
        cred = credentials.Certificate(service_account_info)

        # Avoid re-initializing if already initialized (e.g., in tests)
        if not firebase_admin._apps:  # noqa: SLF001
            firebase_admin.initialize_app(cred)

        self._db = firestore.client()
        logger.info("FirestoreClient initialized successfully.")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _common_fields(self) -> dict[str, Any]:
        """Return fields that are automatically appended to every document."""
        return {
            "collected_at": SERVER_TIMESTAMP,
            "schema_version": SCHEMA_VERSION,
        }

    def _company_ref(self, ticker: str) -> Any:
        """Return a DocumentReference for companies/{ticker}."""
        return self._db.collection("companies").document(ticker)

    # ------------------------------------------------------------------
    # Write methods
    # ------------------------------------------------------------------

    def write_company_meta(self, ticker: str, data: dict[str, Any]) -> None:
        """
        Write or overwrite the companies/{ticker} document with company metadata.

        Args:
            ticker: Four-digit Tokyo Stock Exchange ticker code.
            data: Dictionary conforming to CompanyMeta schema.
        """
        doc_ref = self._company_ref(ticker)
        payload = {**data, **self._common_fields()}
        doc_ref.set(payload)
        logger.info("Wrote company meta for ticker=%s", ticker)

    def write_financial(self, ticker: str, period: str, data: dict[str, Any]) -> None:
        """
        Write or overwrite a single financial period document.

        Args:
            ticker: Four-digit Tokyo Stock Exchange ticker code.
            period: Period string, e.g. "2025-03" or "2024-12-Q3".
            data: Dictionary conforming to FinancialPeriod schema.
        """
        doc_ref = (
            self._company_ref(ticker).collection("financials").document(period)
        )
        payload = {**data, **self._common_fields()}
        doc_ref.set(payload)
        logger.info("Wrote financial period=%s for ticker=%s", period, ticker)

    def write_governance(self, ticker: str, data: dict[str, Any]) -> None:
        """
        Write or overwrite the governance/latest document.

        Args:
            ticker: Four-digit Tokyo Stock Exchange ticker code.
            data: Dictionary conforming to GovernanceData schema.
        """
        doc_ref = (
            self._company_ref(ticker).collection("governance").document("latest")
        )
        payload = {**data, **self._common_fields()}
        doc_ref.set(payload)
        logger.info("Wrote governance data for ticker=%s", ticker)

    def write_competitors(self, ticker: str, data: dict[str, Any]) -> None:
        """
        Write or overwrite the competitors/latest document.

        Args:
            ticker: Four-digit Tokyo Stock Exchange ticker code.
            data: Dictionary conforming to CompetitorData schema.
        """
        doc_ref = (
            self._company_ref(ticker).collection("competitors").document("latest")
        )
        payload = {**data, **self._common_fields()}
        doc_ref.set(payload)
        logger.info("Wrote competitor data for ticker=%s", ticker)

    def write_news_batch(self, ticker: str, articles: list[dict[str, Any]]) -> None:
        """
        Write news articles in batches of up to 500 documents (Firestore limit).

        Document IDs are derived from a SHA-256 hash of the article URL to provide
        natural deduplication across collection runs.

        Args:
            ticker: Four-digit Tokyo Stock Exchange ticker code.
            articles: List of dicts conforming to NewsArticle schema.
                      Each dict must contain at least a "url" key.
        """
        news_collection = self._company_ref(ticker).collection("news")
        total = len(articles)

        for batch_start in range(0, total, FIRESTORE_BATCH_LIMIT):
            batch = self._db.batch()
            chunk = articles[batch_start: batch_start + FIRESTORE_BATCH_LIMIT]

            for article in chunk:
                url: str = article.get("url", "")
                article_hash = hashlib.sha256(url.encode()).hexdigest()[:32]
                doc_ref = news_collection.document(article_hash)
                payload = {**article, **self._common_fields()}
                batch.set(doc_ref, payload)

            batch.commit()
            logger.info(
                "Committed news batch %d-%d for ticker=%s",
                batch_start,
                batch_start + len(chunk) - 1,
                ticker,
            )

        logger.info("Wrote %d news articles for ticker=%s", total, ticker)

    def write_stock(self, ticker: str, data: dict[str, Any]) -> None:
        """
        Write or overwrite the stock/latest document.

        Args:
            ticker: Four-digit Tokyo Stock Exchange ticker code.
            data: Dictionary conforming to StockData schema.
        """
        doc_ref = (
            self._company_ref(ticker).collection("stock").document("latest")
        )
        payload = {**data, **self._common_fields()}
        doc_ref.set(payload)
        logger.info("Wrote stock data for ticker=%s", ticker)

    def write_analysis(
        self, ticker: str, analysis_type: str, data: dict[str, Any]
    ) -> None:
        """
        Write or overwrite an analysis document under companies/{ticker}/analysis/{analysis_type}.

        Args:
            ticker: Four-digit Tokyo Stock Exchange ticker code.
            analysis_type: One of "summary", "financial_insight",
                           "governance_assessment", "competitor_insight",
                           or "industry_insight".
            data: Dictionary conforming to the relevant analysis schema.
        """
        doc_ref = (
            self._company_ref(ticker).collection("analysis").document(analysis_type)
        )
        payload = {**data, **self._common_fields()}
        doc_ref.set(payload)
        logger.info(
            "Wrote analysis type=%s for ticker=%s", analysis_type, ticker
        )
