#!/usr/bin/env bash
# Run IntelliJ IDEA's headless code inspector over src/ with the committed profile.
# INSPECT_DIR defaults to the project root (src, tests, docs, config); excluded folders in .idea/*.iml are skipped.
# Usage: IDEA_HOME=/path/to/idea jetbrains/run-inspections.sh [label]
# Output: jetbrains/inspections/<date>-<label>/*.json plus inspect.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IDEA_HOME="${IDEA_HOME:-/home/box/opt/idea-IU-263.7307.200}"
LABEL="${1:-run}"
OUT="$ROOT/jetbrains/inspections/$(date +%F)-$LABEL"
TMP="$(mktemp -d)"
# Optional: cap heap and isolate IDE config (see README)
export IDEA_VM_OPTIONS="${IDEA_VM_OPTIONS:-/home/box/opt/idea-data/headless.vmoptions}"
nice -n 15 "$IDEA_HOME/bin/inspect.sh" "$ROOT" "$ROOT/.idea/inspectionProfiles/Project_Default.xml" \
  "$TMP" -v2 -d "${INSPECT_DIR:-$ROOT}" -format json | tee "$TMP/inspect.log"
mkdir -p "$OUT"
# .descriptions.json is a 3 MB catalogue of every inspection; keep only the findings.
find "$TMP" -maxdepth 1 -name '*.json' ! -name '.descriptions.json' -exec cp {} "$OUT/" \;
sed "s#$ROOT#\$PROJECT_DIR\$#g" "$TMP/inspect.log" > "$OUT/inspect.log"
rm -rf "$TMP"
echo "Saved to $OUT"
