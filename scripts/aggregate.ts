// Turns .derived/records.json (node scripts/build-records.ts) into the aggregate files the app reads.
// Output: public/data/teams.json and public/data/meta.json. Counts only, see docs/data-notes.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
// These scripts run directly under node, which cannot resolve the "@/" alias, so the relative imports stay.
// noinspection ES6PreferShortImport
import { aggregateTeams } from "../src/lib/aggregate.ts";
// noinspection ES6PreferShortImport
import { buildChampionSummary } from "../src/lib/champions.ts";
// noinspection ES6PreferShortImport
import { classifyFearlessStages } from "../src/lib/fearless.ts";
// noinspection ES6PreferShortImport
import type { DraftGameRecord } from "../src/lib/types.ts";

const records: DraftGameRecord[] = JSON.parse(readFileSync(".derived/records.json", "utf8"));
const { stages, fearlessSeriesIds } = classifyFearlessStages(records);
const teams = aggregateTeams(records, fearlessSeriesIds, { topN: 30, minGames: 8 });

const outDir = path.resolve("public/data");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "teams.json"), JSON.stringify({ teams }) + "\n");

writeFileSync(path.join(outDir, "champions.json"), JSON.stringify({ champions: buildChampionSummary(records) }) + "\n");
const seriesIds = new Set(records.map((r) => r.seriesId));
const meta = {
  source: "Official GRID LoL series via the Sky's The Limit 2026 starter repository (aggregates only)",
  games: records.length,
  series: seriesIds.size,
  fearlessSeries: fearlessSeriesIds.size,
  fearlessGames: records.filter((r) => fearlessSeriesIds.has(r.seriesId)).length,
  teams: teams.length,
  minGamesPerTeam: 8,
  stages: stages.map((s) => ({ stage: s.key, multiGameSeries: s.multiGameSeries, zeroReuseSeries: s.zeroReuseSeries, fearless: s.fearless })),
};
writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 1) + "\n");
console.log(`teams ${teams.length}, games ${meta.games}, fearless series ${meta.fearlessSeries}`);
