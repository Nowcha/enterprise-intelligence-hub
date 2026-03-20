#!/usr/bin/env python3
"""Write analysis results from JSON files to Firestore."""

import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Map of analysis type (file prefix) to Firestore document ID
ANALYSIS_MAP: dict[str, str] = {
    "summary": "summary",
    "financial": "financial_insight",
    "governance": "governance_assessment",
    "competitor": "competitor_insight",
}


def main() -> None:
    """Main entry point."""
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <ticker> <results_dir>", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1]
    results_dir = Path(sys.argv[2])

    # Add project root to path so imports resolve correctly
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))

    from collector.firestore_client import FirestoreClient

    client = FirestoreClient()

    for analysis_type, firestore_doc_id in ANALYSIS_MAP.items():
        result_file = results_dir / f"{analysis_type}_result.json"
        if not result_file.exists():
            logger.warning("Result file not found: %s", result_file)
            continue

        with open(result_file, "r", encoding="utf-8") as f:
            result_data: dict[str, object] = json.load(f)

        error = result_data.get("error")
        if error:
            logger.warning("Skipping %s: %s", analysis_type, error)
            continue

        client.write_analysis(ticker, firestore_doc_id, result_data)
        logger.info("Wrote %s for ticker=%s", firestore_doc_id, ticker)

    print(f"Analysis results written for ticker: {ticker}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
