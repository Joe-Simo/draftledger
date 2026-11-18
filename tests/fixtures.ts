import type { DraftGameRecord, Side } from "@/lib/types";

export interface FixtureGame {
  seriesId: string;
  gameNumber: number;
  blue: string;
  red: string;
  winner: string;
  bluePicks: string[];
  redPicks: string[];
  blueBans?: string[];
  redBans?: string[];
  event?: string;
  stage?: string;
}

const ROLE_ORDER = ["top", "jungle", "mid", "bot", "support"] as const;

/** Synthetic fixture (not GRID data) in the same shape the ingestion module produces. */
export function game(f: FixtureGame): DraftGameRecord {
  const mk = (teamId: string, side: Side, picks: string[]) =>
    picks.map((champion, i) => ({
      teamId,
      side,
      champion,
      order: i + 1,
      seq: 7 + i,
      role: ROLE_ORDER[i] ?? null,
    }));
  const mkBans = (teamId: string, side: Side, target: string, bans: string[]) =>
    bans.map((champion, i) => ({
      teamId,
      side,
      targetTeamId: target,
      champion,
      order: i + 1,
      phase: (i < 3 ? 1 : 2) as 1 | 2,
      seq: i + 1,
    }));
  return {
    seriesId: f.seriesId,
    event: f.event ?? "Fake League",
    stage: f.stage ?? "Playoffs",
    gameId: `${f.seriesId}-g${f.gameNumber}`,
    gameNumber: f.gameNumber,
    seriesGameCount: 3,
    patch: "1.1",
    date: `2026-01-0${f.gameNumber}T00:00:00Z`,
    blue: { teamId: f.blue, name: `Team ${f.blue}` },
    red: { teamId: f.red, name: `Team ${f.red}` },
    winnerTeamId: f.winner,
    firstPickTeamId: f.blue,
    picks: [...mk(f.blue, "blue", f.bluePicks), ...mk(f.red, "red", f.redPicks)],
    bans: [
      ...mkBans(f.blue, "blue", f.red, f.blueBans ?? []),
      ...mkBans(f.red, "red", f.blue, f.redBans ?? []),
    ],
  };
}

/** Five unique champion names per call so a series can be Fearless-clean. */
export const names = (prefix: string, n = 5, offset = 0) =>
  Array.from({ length: n }, (_, i) => `${prefix}${offset + i}`);
