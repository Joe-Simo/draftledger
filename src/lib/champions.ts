import type { TeamAggregate } from "./aggregate.ts";
import type { DraftGameRecord, Role } from "./types.ts";
import { ROLES } from "./types.ts";

export interface ChampionInfo {
  name: string;
  picks: number;
  bans: number;
  roles: Partial<Record<Role, number>>;
}

/** Counts per champion across all records (aggregate only, safe to commit). */
export function buildChampionSummary(records: DraftGameRecord[]): ChampionInfo[] {
  const map = new Map<string, ChampionInfo>();
  const get = (name: string) => {
    let c = map.get(name);
    if (!c) map.set(name, (c = { name, picks: 0, bans: 0, roles: {} }));
    return c;
  };
  for (const g of records) {
    for (const p of g.picks) {
      const c = get(p.champion);
      c.picks++;
      if (p.role) c.roles[p.role] = (c.roles[p.role] ?? 0) + 1;
    }
    for (const b of g.bans) get(b.champion).bans++;
  }
  return [...map.values()].sort((a, b) => b.picks + b.bans - (a.picks + a.bans) || a.name.localeCompare(b.name));
}

/** Two-letter label used instead of champion art. */
export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The role this champion is most often played in among the roles the team has not filled yet. */
export function suggestRole(info: ChampionInfo | undefined, filled: Role[]): Role | null {
  const open = ROLES.filter((r) => !filled.includes(r));
  if (open.length === 0) return null;
  let best: Role = open[0];
  let bestCount = -1;
  for (const r of open) {
    const n = info?.roles[r] ?? 0;
    if (n > bestCount) {
      best = r;
      bestCount = n;
    }
  }
  return best;
}

export type Pools = Record<Role, string[]>;
const emptyPools = (): Pools => ({ top: [], jungle: [], mid: [], bot: [], support: [] });

/** League-wide viable pool: a champion joins a role when it was played there at least minPicks times and minShare of its picks. */
export function leaguePools(champions: ChampionInfo[], minPicks = 3, minShare = 0.1): Pools {
  const out = emptyPools();
  for (const c of champions) {
    const total = Object.values(c.roles).reduce((a, b) => a + (b ?? 0), 0);
    for (const r of ROLES) {
      const n = c.roles[r] ?? 0;
      if (n >= minPicks && total > 0 && n / total >= minShare) out[r].push(c.name);
    }
  }
  return out;
}

/** A team's own pool from its pick tendencies: champions played in a role at least minGames times. */
export function poolsFromTeam(team: TeamAggregate, minGames = 2): Pools {
  const out = emptyPools();
  for (const p of team.picks) {
    for (const r of ROLES) if ((p.roles[r] ?? 0) >= minGames) out[r].push(p.champion);
  }
  return out;
}

export function parsePoolText(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}
