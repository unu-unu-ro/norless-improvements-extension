#!/bin/bash
# PostToolUse hook: syncs AI assistant rule files when either of them is edited.
# Claude Code passes tool info as JSON on stdin.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Parse file_path from stdin JSON (tool_input.file_path)
FILE=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null || true)

case "$FILE" in
  *CLAUDE.md|*copilot-instructions*)
    bash "$ROOT/.claude/sync-rules.sh" "$FILE"
    ;;
esac
