#!/usr/bin/env bash
# AI Analysis Script using Claude Code CLI
# Runs 4 sub-agents to analyze company data from Firestore
# Usage: ./run_analysis.sh <ticker>

set -euo pipefail

TICKER="${1:-}"
if [ -z "$TICKER" ]; then
    echo "Usage: $0 <ticker>" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Starting analysis for ticker: $TICKER"

# Step 1: Read data from Firestore and save to temp files
echo "Reading data from Firestore..."
python3 "$SCRIPT_DIR/read_data.py" "$TICKER" "$TEMP_DIR"

# Step 2: Run each analysis using Claude CLI
run_analysis() {
    local analysis_type="$1"
    local prompt_file="$SCRIPT_DIR/prompts/${analysis_type}.md"
    local data_file="$TEMP_DIR/${analysis_type}_data.json"
    local output_file="$TEMP_DIR/${analysis_type}_result.json"

    if [ ! -f "$data_file" ]; then
        echo "Warning: Data file not found: $data_file" >&2
        return 1
    fi

    echo "Running ${analysis_type} analysis..."

    # Combine prompt and data into a single stdin payload
    local combined_input
    combined_input=$(printf '%s\n\n## 入力データ\n```json\n%s\n```' \
        "$(cat "$prompt_file")" \
        "$(cat "$data_file")")

    # Run Claude CLI in non-interactive (print) mode
    if echo "$combined_input" | claude --print > "$output_file" 2>/dev/null; then
        echo "Analysis ${analysis_type} completed"
    else
        echo "Warning: Claude CLI failed for ${analysis_type}" >&2
        echo '{"error": "analysis_failed"}' > "$output_file"
        return 0
    fi

    # Validate JSON output; extract from markdown block if necessary
    if ! python3 -c "import json,sys; json.load(open('$output_file'))" 2>/dev/null; then
        python3 - "$output_file" <<'PYEOF'
import json, sys, re

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    content = fh.read()

# Try JSON inside a fenced code block first
match = re.search(r"```json\s*([\s\S]*?)```", content)
if match:
    json_str = match.group(1)
else:
    # Fall back to the first JSON object in the output
    match = re.search(r"\{[\s\S]*\}", content)
    json_str = match.group(0) if match else "{}"

try:
    data = json.loads(json_str)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print("JSON extracted successfully")
except json.JSONDecodeError:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"error": "invalid_json"}, fh)
    print("Warning: Invalid JSON in response")
PYEOF
    fi
}

# Run all four analyses
run_analysis "summary"
run_analysis "financial"
run_analysis "governance"
run_analysis "competitor"

# Step 3: Write results to Firestore
echo "Writing analysis results to Firestore..."
python3 "$SCRIPT_DIR/write_analysis.py" "$TICKER" "$TEMP_DIR"

echo "Analysis completed for ticker: $TICKER"
