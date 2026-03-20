#!/usr/bin/env python3
"""Read company data from Firestore and save to JSON files for analysis."""

import json
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def serialize_firestore_data(data: Any) -> Any:
    """Convert Firestore Timestamps and other special types to JSON-serializable format."""
    if hasattr(data, "isoformat"):
        # datetime or DatetimeWithNanoseconds
        return data.isoformat()
    elif hasattr(data, "timestamp"):
        # Firestore Timestamp: convert to ISO string via datetime
        try:
            return data.ToDatetime().isoformat()
        except AttributeError:
            return str(data)
    elif isinstance(data, dict):
        return {k: serialize_firestore_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [serialize_firestore_data(item) for item in data]
    else:
        return data


def write_json(output_dir: Path, filename: str, data: dict[str, Any]) -> None:
    """Serialize and write data to a JSON file."""
    serialized = serialize_firestore_data(data)
    filepath = output_dir / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(serialized, f, ensure_ascii=False, indent=2, default=str)
    print(f"Wrote {filename}")


def main() -> None:
    """Main entry point."""
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <ticker> <output_dir>", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1]
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    # Add project root to path so imports resolve correctly
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))

    from analyzer.firestore_reader import FirestoreReader

    reader = FirestoreReader()

    company = reader.read_company(ticker)
    financials = reader.read_all_financials(ticker)[:5]  # Last 5 periods
    governance = reader.read_governance(ticker)
    competitors = reader.read_competitors(ticker)
    news = reader.read_news(ticker, limit=20)

    # Summary analysis data
    summary_data: dict[str, Any] = {
        "company": company,
        "financials": financials,
        "governance": governance,
        "competitors": competitors,
        "news": news,
        "previous_analysis": reader.read_previous_analysis(ticker, "summary"),
    }
    write_json(output_dir, "summary_data.json", summary_data)

    # Financial analysis data
    financial_data: dict[str, Any] = {
        "company": company,
        "financials": financials,
        "previous_analysis": reader.read_previous_analysis(ticker, "financial_insight"),
    }
    write_json(output_dir, "financial_data.json", financial_data)

    # Governance analysis data
    governance_data: dict[str, Any] = {
        "company": company,
        "governance": governance,
        "previous_analysis": reader.read_previous_analysis(
            ticker, "governance_assessment"
        ),
    }
    write_json(output_dir, "governance_data.json", governance_data)

    # Competitor analysis data
    competitor_data: dict[str, Any] = {
        "company": company,
        "competitors": competitors,
        "financials": financials[:1] if financials else [],
        "previous_analysis": reader.read_previous_analysis(
            ticker, "competitor_insight"
        ),
    }
    write_json(output_dir, "competitor_data.json", competitor_data)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
