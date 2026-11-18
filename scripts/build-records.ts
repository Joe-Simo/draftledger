// Reads the licensed GRID LoL feeds from STL_DATA_DIR and writes draft records to .derived/
// (gitignored). Run: node scripts/build-records.ts
import { zstdDecompressSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildDraftRecords,
  extractDraftActions,
  readGameRows,
  readRosterRows,
  readSeriesRows,
} from "../src/lib/ingest.ts";
import type { DraftAction } from "../src/lib/types.ts";

const dataDir = process.env.STL_DATA_DIR ?? path.resolve("../../data/stl-hackathon-2026-grid-starter");
const outDir = path.resolve(".derived");
mkdirSync(outDir, { recursive: true });

const series = readSeriesRows(readFileSync(path.join(dataDir, "lol/series.csv"), "utf8"));
const games = readGameRows(readFileSync(path.join(dataDir, "meta/games.csv"), "utf8"));
const rosters = readRosterRows(readFileSync(path.join(dataDir, "meta/rosters.csv"), "utf8"));
const csvRows = (await import("../src/lib/csv.ts")).parseCsv(
  readFileSync(path.join(dataDir, "lol/series.csv"), "utf8"),
);

const actions = new Map<string, DraftAction[]>();
let files = 0;
const t0 = Date.now();
for (const r of csvRows) {
  const buf = zstdDecompressSync(readFileSync(path.join(dataDir, r.file)));
  const lines = buf.toString("utf8").split("\n");
  for (const [k, v] of extractDraftActions(lines)) actions.set(k, v);
  files++;
  if (files % 100 === 0) console.log(`${files} files, ${Math.round((Date.now() - t0) / 1000)}s`);
}
const records = buildDraftRecords({ series, games, rosters, actions });
writeFileSync(path.join(outDir, "records.json"), JSON.stringify(records));
console.log(`series files ${files}, games with drafts ${actions.size}, records ${records.length}`);
