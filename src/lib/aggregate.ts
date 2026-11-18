import { groupBySeries } from "./fearless.ts";
import type { DraftGameRecord, Role, Side } from "./types.ts";

export interface ChampCount {
  champion: string;
  count: number;
}

export interface PickStat {
  champion: string;
  /** Games in which the team picked this champion. */
  games: number;
  wins: number;
  blue: number;
  red: number;
  /** Average position among the team's own five picks (1 = first). */
  avgOrder: number;
  roles: Partial<Record<Role, number>>;
}

export interface BanStat {
  champion: string;
  count: number;
  phase1: number;
  phase2: number;
  /** Average position among the team's own bans (1 = first). */
  avgOrder: number;
  /** Times it was the team's very first ban of the game. */
  firstBan: number;
}

export interface SideStat {
  games: number;
  wins: number;
}

export interface GameNumberStat {
  games: number;
  wins: number;
  distinctPicks: number;
  /** Share of picks that come from the team's overall top-10 most picked champions. */
  comfortShare: number;
  topPicks: ChampCount[];
  topBans: ChampCount[];
}

export interface FearlessShift {
  /** Keys "1", "2", "3+" (game number inside a Fearless series). */
  byGame: Record<"1" | "2" | "3+", GameNumberStat>;
  /** Jaccard overlap of the team's top-5 picks in game 1 and in games 3+ (0..1). */
  top5PickOverlapG1vsG3: number | null;
  /** comfortShare in games 3+ minus comfortShare in game 1 (negative = leaves comfort pool). */
  comfortShareDelta: number | null;
}

export interface TeamAggregate {
  teamId: string;
  name: string;
  games: number;
  wins: number;
  series: number;
  fearlessGames: number;
  firstDate: string;
  lastDate: string;
  events: string[];
  sides: Record<Side, SideStat>;
  picks: PickStat[];
  bans: BanStat[];
  /** Bans opponents aimed at this team. */
  bansAgainst: ChampCount[];
  fearless: FearlessShift | null;
}

export interface AggregateOptions {
  topN?: number;
  /** Teams with fewer drafted games are left out. */
  minGames?: number;
}

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function top(map: Map<string, number>, n: number): ChampCount[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([champion, count]) => ({ champion, count }));
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

const bucketOf = (gameNumber: number): "1" | "2" | "3+" =>
  gameNumber <= 1 ? "1" : gameNumber === 2 ? "2" : "3+";

interface Acc {
  teamId: string;
  name: string;
  games: DraftGameRecord[];
}

export function aggregateTeams(
  records: DraftGameRecord[],
  fearlessSeriesIds: Set<string>,
  opts: AggregateOptions = {},
): TeamAggregate[] {
  const topN = opts.topN ?? 30;
  const minGames = opts.minGames ?? 1;
  const teams = new Map<string, Acc>();
  for (const g of records) {
    for (const t of [g.blue, g.red]) {
      const acc = teams.get(t.teamId) ?? { teamId: t.teamId, name: t.name, games: [] };
      acc.name = t.name;
      acc.games.push(g);
      teams.set(t.teamId, acc);
    }
  }
  const out: TeamAggregate[] = [];
  for (const acc of teams.values()) {
    if (acc.games.length < minGames) continue;
    out.push(aggregateTeam(acc, fearlessSeriesIds, topN));
  }
  return out.sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

function aggregateTeam(acc: Acc, fearlessSeriesIds: Set<string>, topN: number): TeamAggregate {
  const { teamId } = acc;
  const pickStats = new Map<string, PickStat & { orderSum: number }>();
  const banStats = new Map<string, BanStat & { orderSum: number }>();
  const against = new Map<string, number>();
  const sides: Record<Side, SideStat> = { blue: { games: 0, wins: 0 }, red: { games: 0, wins: 0 } };
  const events = new Set<string>();
  const seriesIds = new Set<string>();
  let wins = 0;
  let fearlessGames = 0;
  let firstDate = "";
  let lastDate = "";
  const overallPicks = new Map<string, number>();

  for (const g of acc.games) {
    const side: Side = g.blue.teamId === teamId ? "blue" : "red";
    const won = g.winnerTeamId === teamId;
    sides[side].games++;
    if (won) {
      sides[side].wins++;
      wins++;
    }
    events.add(g.event);
    seriesIds.add(g.seriesId);
    if (fearlessSeriesIds.has(g.seriesId)) fearlessGames++;
    if (g.date && (!firstDate || g.date < firstDate)) firstDate = g.date;
    if (g.date && g.date > lastDate) lastDate = g.date;
    for (const p of g.picks) {
      if (p.teamId !== teamId) continue;
      bump(overallPicks, p.champion);
      const s =
        pickStats.get(p.champion) ??
        ({ champion: p.champion, games: 0, wins: 0, blue: 0, red: 0, avgOrder: 0, roles: {}, orderSum: 0 } as PickStat & {
          orderSum: number;
        });
      s.games++;
      if (won) s.wins++;
      s[side]++;
      s.orderSum += p.order;
      if (p.role) s.roles[p.role] = (s.roles[p.role] ?? 0) + 1;
      pickStats.set(p.champion, s);
    }
    for (const b of g.bans) {
      if (b.teamId === teamId) {
        const s =
          banStats.get(b.champion) ??
          ({ champion: b.champion, count: 0, phase1: 0, phase2: 0, avgOrder: 0, firstBan: 0, orderSum: 0 } as BanStat & {
            orderSum: number;
          });
        s.count++;
        if (b.phase === 1) s.phase1++;
        else s.phase2++;
        if (b.order === 1) s.firstBan++;
        s.orderSum += b.order;
        banStats.set(b.champion, s);
      } else if (b.targetTeamId === teamId) {
        bump(against, b.champion);
      }
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const picks = [...pickStats.values()]
    .sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion))
    .slice(0, topN)
    .map(({ orderSum, ...s }) => ({ ...s, avgOrder: round2(orderSum / s.games) }));
  const bans = [...banStats.values()]
    .sort((a, b) => b.count - a.count || a.champion.localeCompare(b.champion))
    .slice(0, topN)
    .map(({ orderSum, ...s }) => ({ ...s, avgOrder: round2(orderSum / s.count) }));

  const comfort = new Set(top(overallPicks, 10).map((c) => c.champion));
  const fearless = fearlessGames > 0 ? fearlessShift(acc, fearlessSeriesIds, comfort) : null;

  return {
    teamId,
    name: acc.name,
    games: acc.games.length,
    wins,
    series: seriesIds.size,
    fearlessGames,
    firstDate,
    lastDate,
    events: [...events].sort(),
    sides,
    picks,
    bans,
    bansAgainst: top(against, topN),
    fearless,
  };
}

function fearlessShift(acc: Acc, fearlessSeriesIds: Set<string>, comfort: Set<string>): FearlessShift {
  const { teamId } = acc;
  const buckets = {
    "1": { games: 0, wins: 0, picks: new Map<string, number>(), bans: new Map<string, number>(), inComfort: 0, total: 0 },
    "2": { games: 0, wins: 0, picks: new Map<string, number>(), bans: new Map<string, number>(), inComfort: 0, total: 0 },
    "3+": { games: 0, wins: 0, picks: new Map<string, number>(), bans: new Map<string, number>(), inComfort: 0, total: 0 },
  };
  // Game number inside the series, counting only series known to be Fearless.
  const bySeries = groupBySeries(acc.games.filter((g) => fearlessSeriesIds.has(g.seriesId)));
  for (const games of bySeries.values()) {
    games.forEach((g, i) => {
      const b = buckets[bucketOf(i + 1)];
      b.games++;
      if (g.winnerTeamId === teamId) b.wins++;
      for (const p of g.picks) {
        if (p.teamId !== teamId) continue;
        bump(b.picks, p.champion);
        b.total++;
        if (comfort.has(p.champion)) b.inComfort++;
      }
      for (const x of g.bans) if (x.teamId === teamId) bump(b.bans, x.champion);
    });
  }
  const stat = (b: (typeof buckets)["1"]): GameNumberStat => ({
    games: b.games,
    wins: b.wins,
    distinctPicks: b.picks.size,
    comfortShare: b.total === 0 ? 0 : Math.round((b.inComfort / b.total) * 1000) / 1000,
    topPicks: top(b.picks, 5),
    topBans: top(b.bans, 5),
  });
  const byGame = { "1": stat(buckets["1"]), "2": stat(buckets["2"]), "3+": stat(buckets["3+"]) };
  const both = byGame["1"].games > 0 && byGame["3+"].games > 0;
  return {
    byGame,
    top5PickOverlapG1vsG3: both
      ? Math.round(
          jaccard(
            byGame["1"].topPicks.map((c) => c.champion),
            byGame["3+"].topPicks.map((c) => c.champion),
          ) * 1000,
        ) / 1000
      : null,
    comfortShareDelta: both ? Math.round((byGame["3+"].comfortShare - byGame["1"].comfortShare) * 1000) / 1000 : null,
  };
}
