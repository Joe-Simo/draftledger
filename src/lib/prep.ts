import type { TeamAggregate } from "./aggregate.ts";
import { deriveView, other, type BoardConfig, type BoardEvent, type TeamKey } from "./board.ts";
import { buildInsights, pctText, type InsightResult } from "./insights.ts";
import { nextGameOutlook, type NextGameOutlook } from "./suggest.ts";
import type { Role } from "./types.ts";

export interface PrepSheet {
  title: string;
  generated: string;
  opponent: TeamAggregate;
  config: BoardConfig;
  insights: InsightResult;
  outlook: NextGameOutlook | null;
  drafts: { game: number; blue: string; red: string; winner: string | null; bans: string[]; picks: string[] }[];
}

/** Assemble the prep sheet from the board and the scouted team. `generated` is passed in to keep it testable. */
export function buildPrepSheet(config: BoardConfig, log: readonly BoardEvent[], opponent: TeamAggregate, generated: string): PrepSheet {
  const view = deriveView(config, log);
  const name = (t: TeamKey) => config.teams[t].name || `Team ${t}`;
  return {
    title: `Prep sheet: ${name(config.scout ? other(config.scout.opponent) : "A")} vs ${opponent.name}`,
    generated,
    opponent,
    config,
    insights: buildInsights(opponent, { maxRemainingGames: view.maxRemainingGames || undefined }),
    outlook: nextGameOutlook({ config, view, opponent }),
    drafts: view.games
      .filter((g) => g.actions.length > 0)
      .map((g) => ({
        game: g.number,
        blue: name(g.blue),
        red: name(g.red),
        winner: g.winner ? name(g.winner) : null,
        bans: g.actions.filter((a) => a.step.kind === "ban").map((a) => `${name(a.team)}: ${a.champion ?? "skipped"}`),
        picks: g.actions.filter((a) => a.step.kind === "pick").map((a) => `${name(a.team)}: ${a.champion}${a.role ? ` (${a.role})` : ""}`),
      })),
  };
}

const role = (roles: Partial<Record<Role, number>>) =>
  Object.entries(roles).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "";

export function toMarkdown(s: PrepSheet): string {
  const o = s.opponent;
  const L: string[] = [];
  L.push(`# ${s.title}`, "");
  L.push(`Generated ${s.generated}. Scouted team: ${o.name}, ${o.games} games in ${o.series} series (${o.firstDate.slice(0, 10)} to ${o.lastDate.slice(0, 10)}), ${o.fearlessGames} Fearless games, win rate ${pctText(o.wins / o.games)}.`);
  L.push(`Series: Bo${s.config.format}, ${s.config.fearless ? "Fearless Draft" : "standard draft"}.`, "");
  L.push("## How to win", "");
  if (s.insights.insights.length === 0) L.push("No claim has enough data behind it.");
  for (const i of s.insights.insights) L.push(`- **${i.text}** [${i.confidence} confidence, n=${i.n}] Evidence: ${i.evidence}`);
  L.push("", `${s.insights.suppressed} candidate insight(s) were left out because the sample was too small or the effect was not clear.`, "");
  L.push("## Most picked", "", "| Champion | Role | Games | Of | Win rate | Avg pick # |", "|---|---|---|---|---|---|");
  for (const p of o.picks.slice(0, 12)) L.push(`| ${p.champion} | ${role(p.roles)} | ${p.games} | ${o.games} | ${pctText(p.wins / p.games)} | ${p.avgOrder} |`);
  L.push("", "## Most banned by them", "", "| Champion | Bans | Of | First ban | Phase 1 |", "|---|---|---|---|---|");
  for (const b of o.bans.slice(0, 10)) L.push(`| ${b.champion} | ${b.count} | ${o.games} | ${b.firstBan} | ${b.phase1} |`);
  L.push("", "## Banned against them", "", o.bansAgainst.slice(0, 10).map((c) => `${c.champion} (${c.count}/${o.games})`).join(", "), "");
  if (s.outlook) {
    L.push(`## Expect in game ${s.outlook.gameNumber} (Fearless locks applied)`, "");
    L.push(`Already locked from their ten favourite champions: ${s.outlook.burned.map((c) => `${c.champion} (${c.count})`).join(", ") || "none"} (${pctText(s.outlook.burnedShare)} of that pick volume).`);
    if (s.outlook.comfortNote) L.push("", s.outlook.comfortNote);
    L.push("", "| Role | Likely picks (games in role) | Known pool left |", "|---|---|---|");
    for (const r of s.outlook.byRole) L.push(`| ${r.role} | ${r.likely.map((l) => `${l.champion} (${l.n})`).join(", ") || "no champion with enough games"} | ${r.remainingDepth}/${r.totalDepth} |`);
    L.push("");
  }
  if (s.drafts.length) {
    L.push("## Board so far", "");
    for (const d of s.drafts) {
      L.push(`### Game ${d.game}: ${d.blue} (blue) vs ${d.red} (red)${d.winner ? `, won by ${d.winner}` : ""}`, "");
      L.push(`Bans: ${d.bans.join("; ") || "none"}`, "", `Picks: ${d.picks.join("; ") || "none"}`, "");
    }
  }
  L.push("---", "Counts come from official GRID esports data supplied for the Cloud9 x JetBrains hackathon (aggregates only). DraftLedger is not endorsed by Riot Games. Built with AI coding agents directed by Joe Simo.", "");
  return L.join("\n");
}

const csvCell = (v: string | number | null | undefined) => {
  const t = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Flat CSV: one row per fact, so it opens cleanly in a spreadsheet. */
export function toCsv(s: PrepSheet): string {
  const o = s.opponent;
  const rows: (string | number | null)[][] = [["section", "item", "role", "n", "of", "rate", "wins", "note"]];
  for (const p of o.picks) rows.push(["pick", p.champion, role(p.roles), p.games, o.games, round(p.games / o.games), p.wins, `avg pick #${p.avgOrder}`]);
  for (const b of o.bans) rows.push(["ban", b.champion, "", b.count, o.games, round(b.count / o.games), "", `first ban ${b.firstBan}x; phase 1 ${b.phase1}`]);
  for (const b of o.bansAgainst) rows.push(["ban_against", b.champion, "", b.count, o.games, round(b.count / o.games), "", ""]);
  for (const i of s.insights.insights) rows.push(["insight", i.text, "", i.n, "", "", "", `${i.confidence}: ${i.evidence}`]);
  if (s.outlook) {
    for (const c of s.outlook.burned) rows.push(["locked", c.champion, "", c.count, o.games, round(c.count / o.games), "", `game ${s.outlook.gameNumber}`]);
    for (const r of s.outlook.byRole) for (const l of r.likely) rows.push(["likely_next", l.champion, r.role, l.n, o.games, round(l.rate), "", `game ${s.outlook.gameNumber}`]);
  }
  for (const d of s.drafts) {
    for (const x of d.bans) rows.push(["board_ban", x, "", "", "", "", "", `game ${d.game}`]);
    for (const x of d.picks) rows.push(["board_pick", x, "", "", "", "", "", `game ${d.game}`]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

const round = (x: number) => Math.round(x * 1000) / 1000;
