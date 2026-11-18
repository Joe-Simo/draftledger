// Prints aggregate facts about the GRID LoL data for docs/data-notes.md. Needs .derived/records.json
// (node scripts/build-records.ts) and STL_DATA_DIR for rosters. Prints counts only.
import { readFileSync } from "node:fs";
import path from "node:path";
// These scripts run directly under node, which cannot resolve the "@/" alias, so the relative imports stay.
// noinspection ES6PreferShortImport
import { parseCsv } from "../src/lib/csv.ts";
// noinspection ES6PreferShortImport
import { classifyFearlessStages, groupBySeries, seriesReuse } from "../src/lib/fearless.ts";
// noinspection ES6PreferShortImport
import type { DraftGameRecord } from "../src/lib/types.ts";

const dataDir = process.env.STL_DATA_DIR ?? path.resolve("../../data/stl-hackathon-2026-grid-starter");
const records: DraftGameRecord[] = JSON.parse(readFileSync(".derived/records.json", "utf8"));
const out = (k: string, v: unknown) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

out("records", records.length);
const gamesCsv = parseCsv(readFileSync(path.join(dataDir, "meta/games.csv"), "utf8")).filter((r) => r.title === "lol");
out("games in meta/games.csv", gamesCsv.length);
const recIds = new Set(records.map((r) => r.gameId));
out("meta games without draft record", gamesCsv.filter((g) => !recIds.has(g.game_id)).length);
const shape = new Map<string, number>();
for (const r of records) {
  const k = `${r.picks.length} picks/${r.bans.length} bans`;
  shape.set(k, (shape.get(k) ?? 0) + 1);
}
out("draft shape", Object.fromEntries([...shape].sort((a, b) => b[1] - a[1])));
out("first pick team is blue", records.filter((r) => r.firstPickTeamId === r.blue.teamId).length);
out("pick rows with a role", records.reduce((n, r) => n + r.picks.filter((p) => p.role).length, 0) + " of " + records.reduce((n, r) => n + r.picks.length, 0));

// Roles: modal role per champion.
const byChamp = new Map<string, Map<string, number>>();
for (const r of records) for (const p of r.picks) {
  if (!p.role) continue;
  const m = byChamp.get(p.champion) ?? new Map();
  m.set(p.role, (m.get(p.role) ?? 0) + 1);
  byChamp.set(p.champion, m);
}
let total = 0, modal = 0;
for (const m of byChamp.values()) {
  const n = [...m.values()].reduce((a, b) => a + b, 0);
  total += n;
  modal += Math.max(...m.values());
}
out("share of picks in champion's modal role", Math.round((modal / total) * 1000) / 10 + "%");
// Player role stability: share of a player's picks in their most common inferred role (players with 10+ picks).
const playerGames = parseCsv(readFileSync(path.join(dataDir, "meta/rosters.csv"), "utf8")).filter((r) => r.title === "lol");
const roleByGameChamp = new Map<string, string>();
for (const r of records) for (const p of r.picks) if (p.role) roleByGameChamp.set(`${r.gameId}|${p.teamId}|${p.champion}`, p.role);
const perPlayer = new Map<string, Map<string, number>>();
for (const r of playerGames) {
  const role = roleByGameChamp.get(`${r.game_id}|${r.team_id}|${r.character_name}`);
  if (!role) continue;
  const m = perPlayer.get(r.player_id) ?? new Map();
  m.set(role, (m.get(role) ?? 0) + 1);
  perPlayer.set(r.player_id, m);
}
let pn = 0, pm = 0, players = 0;
for (const m of perPlayer.values()) {
  const n = [...m.values()].reduce((a, b) => a + b, 0);
  if (n < 10) continue;
  players++; pn += n; pm += Math.max(...m.values());
}
out("players with 10+ games / share of their games in their modal role", `${players} / ${Math.round((pm / pn) * 1000) / 10}%`);
const sample = ["Leona", "Thresh", "Nautilus", "Jinx", "Kai'Sa", "Lee Sin", "Sejuani", "Ahri", "Azir", "K'Sante", "Aatrox"];
out("spot checks (role counts)", Object.fromEntries(sample.filter((c) => byChamp.has(c)).map((c) => [c, Object.fromEntries(byChamp.get(c)!)])));

// Roster order stability: same player id in same slot across games of a series.
const rosters = parseCsv(readFileSync(path.join(dataDir, "meta/rosters.csv"), "utf8")).filter((r) => r.title === "lol");
const slotCount = new Map<string, number>();
const slotPlayers = new Map<string, Set<string>>();
const rowsPerTeamGame = new Map<string, number>();
for (const r of rosters) {
  const tg = `${r.game_id}|${r.team_id}`;
  const idx = slotCount.get(tg) ?? 0;
  slotCount.set(tg, idx + 1);
  rowsPerTeamGame.set(tg, idx + 1);
  const k = `${r.series_id}|${r.team_id}|${idx}`;
  const set = slotPlayers.get(k) ?? new Set();
  set.add(r.player_id);
  slotPlayers.set(k, set);
}
const sizes = new Map<number, number>();
for (const n of rowsPerTeamGame.values()) sizes.set(n, (sizes.get(n) ?? 0) + 1);
out("roster rows per team-game", Object.fromEntries(sizes));
const stable = [...slotPlayers.values()].filter((s) => s.size === 1).length;
out("series+team+slot with a single player across games", `${stable} of ${slotPlayers.size}`);
out("participation statuses", [...new Set(rosters.map((r) => r.participation_status))]);

// Fearless.
const { stages, fearlessSeriesIds } = classifyFearlessStages(records);
const bySeries = groupBySeries(records);
const multi = [...bySeries.values()].filter((g) => g.length >= 2);
out("series with draft records", bySeries.size);
out("multi-game series", multi.length);
const zero = multi.filter((g) => seriesReuse(g).reusedPicks === 0);
out("multi-game series with zero champion reuse", zero.length);
out("fearless stages / total stages", `${stages.filter((s) => s.fearless).length} / ${stages.length}`);
out("fearless series (incl. single-game in Fearless stages)", fearlessSeriesIds.size);
out("fearless games", records.filter((r) => fearlessSeriesIds.has(r.seriesId)).length);
const fMulti = multi.filter((g) => fearlessSeriesIds.has(g[0].seriesId));
out("fearless multi-game series", fMulti.length);
const lenDist = new Map<number, number>();
for (const g of fMulti) lenDist.set(g.length, (lenDist.get(g.length) ?? 0) + 1);
out("fearless series length distribution", Object.fromEntries(lenDist));
out("fearless series with reuse (violations)", fMulti.filter((g) => seriesReuse(g).reusedPicks > 0).length);
const nMulti = multi.filter((g) => !fearlessSeriesIds.has(g[0].seriesId));
const avgReuse = nMulti.reduce((n, g) => n + seriesReuse(g).reusedPicks, 0) / Math.max(1, nMulti.length);
out("non-fearless multi-game series", nMulti.length);
out("avg reused picks per non-fearless multi-game series", Math.round(avgReuse * 10) / 10);
const byEventKind = new Map<string, { f: number; n: number }>();
for (const s of stages) {
  const ev = s.key.split(" | ")[0];
  const e = byEventKind.get(ev) ?? { f: 0, n: 0 };
  if (s.fearless) e.f++;
  else e.n++;
  byEventKind.set(ev, e);
}
console.log("event: fearless stages / other stages");
for (const [ev, e] of [...byEventKind].sort()) console.log(`  ${ev}: ${e.f} / ${e.n}`);
console.log("stage rates (rate of zero-reuse among multi-game series, n)");
for (const s of stages.filter((s) => s.multiGameSeries >= 3)) console.log(`  ${s.fearless ? "F" : "-"} ${s.key}: ${s.zeroReuseSeries}/${s.multiGameSeries}`);
const c9 = records.filter((r) => r.blue.name === "Cloud9 Kia" || r.red.name === "Cloud9 Kia");
out("Cloud9 Kia games / fearless games", `${c9.length} / ${c9.filter((r) => fearlessSeriesIds.has(r.seriesId)).length}`);
