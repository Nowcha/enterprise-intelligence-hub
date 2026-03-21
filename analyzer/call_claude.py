"""
Thin wrapper around the Anthropic SDK for use in CI analysis pipeline.

Usage:
    python3 call_claude.py <prompt_file> <data_file> <output_file>

Reads the prompt from <prompt_file>, attaches the JSON from <data_file>,
calls the Claude API, and writes the raw text response to <output_file>.

Requires: ANTHROPIC_API_KEY environment variable.
"""
import json
import logging
import os
import sys

import anthropic

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096


def main() -> None:
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <prompt_file> <data_file> <output_file>", file=sys.stderr)
        sys.exit(1)

    prompt_file, data_file, output_file = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(prompt_file, encoding="utf-8") as f:
        prompt = f.read().strip()

    with open(data_file, encoding="utf-8") as f:
        data_str = f.read()

    # Validate JSON so we fail fast on malformed input
    try:
        json.loads(data_str)
    except json.JSONDecodeError as exc:
        logger.error("Invalid JSON in data file %s: %s", data_file, exc)
        sys.exit(1)

    user_message = (
        f"{prompt}\n\n"
        f"## 入力データ\n"
        f"```json\n{data_str}\n```"
    )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY environment variable is not set")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    logger.info("Calling Claude API (model=%s, prompt_file=%s)", MODEL, prompt_file)
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": user_message}],
    )

    content = response.content[0].text
    logger.info("Received response (%d chars)", len(content))

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    main()
