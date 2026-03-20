"""Firestore reader for AI analysis engine."""

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


class FirestoreReader:
    """Reads company data from Firestore for AI analysis."""

    def __init__(self) -> None:
        """Initialize Firebase Admin SDK."""
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:  # noqa: SLF001
            service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
            if not service_account_json:
                raise ValueError(
                    "FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set"
                )

            service_account_info: dict[str, Any] = json.loads(service_account_json)
            cred = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(cred)

        from firebase_admin import firestore as fs

        self.db = fs.client()
        logger.info("FirestoreReader initialized")

    def read_company(self, ticker: str) -> dict[str, Any]:
        """Read company metadata."""
        doc = self.db.collection("companies").document(ticker).get()
        return doc.to_dict() or {}

    def read_all_financials(self, ticker: str) -> list[dict[str, Any]]:
        """Read all financial period data, sorted by period descending."""
        from firebase_admin import firestore

        docs = (
            self.db.collection("companies")
            .document(ticker)
            .collection("financials")
            .order_by("period", direction=firestore.Query.DESCENDING)
            .stream()
        )
        return [d.to_dict() for d in docs if d.to_dict()]

    def read_governance(self, ticker: str) -> dict[str, Any]:
        """Read governance data."""
        doc = (
            self.db.collection("companies")
            .document(ticker)
            .collection("governance")
            .document("latest")
            .get()
        )
        return doc.to_dict() or {}

    def read_competitors(self, ticker: str) -> dict[str, Any]:
        """Read competitor data including benchmark entries."""
        doc = (
            self.db.collection("companies")
            .document(ticker)
            .collection("competitors")
            .document("latest")
            .get()
        )
        return doc.to_dict() or {}

    def read_news(self, ticker: str, limit: int = 50) -> list[dict[str, Any]]:
        """Read news articles, sorted by published_at descending."""
        from firebase_admin import firestore

        docs = (
            self.db.collection("companies")
            .document(ticker)
            .collection("news")
            .order_by("published_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
        return [d.to_dict() for d in docs if d.to_dict()]

    def read_previous_analysis(
        self, ticker: str, analysis_type: str
    ) -> dict[str, Any] | None:
        """Read previous analysis result if exists."""
        doc = (
            self.db.collection("companies")
            .document(ticker)
            .collection("analysis")
            .document(analysis_type)
            .get()
        )
        if doc.exists:
            return doc.to_dict()
        return None

    def read_stock(self, ticker: str) -> dict[str, Any]:
        """Read stock data."""
        doc = (
            self.db.collection("companies")
            .document(ticker)
            .collection("stock")
            .document("latest")
            .get()
        )
        return doc.to_dict() or {}
