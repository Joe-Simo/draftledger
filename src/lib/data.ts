import { readFileSync } from "node:fs";
import path from "node:path";
import type { TeamAggregate } from "./aggregate.ts";

export interface Meta {
  source: string;
  games: number;
  series: number;
  fearlessSeries: number;
  fearlessGames: number;
  teams: number;
  minGamesPerTeam: number;
}

const dir = path.join(process.cwd(), "public", "data");

/** Reads the committed aggregates at build time (static export). */
export function loadTeams(): TeamAggregate[] {
  return (JSON.parse(readFileSync(path.join(dir, "teams.json"), "utf8")) as { teams: TeamAggregate[] }).teams;
}

export function loadMeta(): Meta {
  return JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8")) as Meta;
}

export const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);
/** Below this many games a tendency is shown as low sample. */
export const LOW_SAMPLE = 5;
