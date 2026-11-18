#!/bin/sh
# Fails if licensed GRID data (or an extract of it) is tracked or staged. Run before every commit and push.
bad=$( { git ls-files; git diff --cached --name-only; } | grep -Ei '\.(zst|jsonl|parquet|sqlite|duckdb)$|stl-hackathon-2026-grid-starter|^\.derived/' | sort -u)
if [ -n "$bad" ]; then echo "Licensed data files found in git:"; echo "$bad"; exit 1; fi
echo "ok: no licensed data files tracked"
