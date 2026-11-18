import type { DraftGameRecord } from "./types.ts";

/** Champions already used by a team in earlier games of a Fearless Draft series. */
export function lockedChampions(history: { picks: string[] }[]): Set<string> {
  const out = new Set<string>();
  for (const game of history) for (const c of game.picks) out.add(c);
  return out;
}

export function isPickable(champion: string, history: { picks: string[] }[]): boolean {
  return !lockedChampions(history).has(champion);
}

export interface SeriesReuse {
  seriesId: string;
  games: number;
  /** Picks of a champion that was already picked (by either team) in an earlier game. */
  reusedPicks: number;
  /** Subset of reusedPicks where the earlier pick was by the other team. */
  reusedFromOpponent: number;
}

export function groupBySeries(records: DraftGameRecord[]): Map<string, DraftGameRecord[]> {
  const out = new Map<string, DraftGameRecord[]>();
  for (const r of records) {
    const list = out.get(r.seriesId);
    if (list) list.push(r);
    else out.set(r.seriesId, [r]);
  }
  for (const list of out.values()) list.sort((a, b) => a.gameNumber - b.gameNumber);
  return out;
}

/** Count champion reuse across the games of one series (global lock, both teams). */
export function seriesReuse(games: DraftGameRecord[]): SeriesReuse {
  const pickedBy = new Map<string, Set<string>>();
  let reusedPicks = 0;
  let reusedFromOpponent = 0;
  for (const g of games) {
    for (const p of g.picks) {
      const earlier = pickedBy.get(p.champion);
      if (earlier) {
        reusedPicks++;
        if ([...earlier].some((t) => t !== p.teamId)) reusedFromOpponent++;
      }
    }
    for (const p of g.picks) {
      const set = pickedBy.get(p.champion) ?? new Set<string>();
      set.add(p.teamId);
      pickedBy.set(p.champion, set);
    }
  }
  return { seriesId: games[0]?.seriesId ?? "", games: games.length, reusedPicks, reusedFromOpponent };
}

export interface StageVerdict {
  key: string;
  multiGameSeries: number;
  zeroReuseSeries: number;
  rate: number;
  fearless: boolean;
  /** True when the stage was too small to decide alone and took the verdict of its event. */
  inherited?: boolean;
}

export interface FearlessOptions {
  /** Minimum share of multi-game series with zero reuse for a stage to count as Fearless. */
  minRate?: number;
  /** Minimum number of multi-game series needed to classify a stage. */
  minSeries?: number;
}

/**
 * Detect Fearless series when no rules metadata exists. In a Fearless series, no champion can be picked
 * twice, so every multi-game series in a Fearless stage has zero reuse. In a normal stage reuse is
 * common (popular champions are picked again in game 2 and 3). We group series by event and stage
 * and call the stage Fearless when nearly all multi-game series show zero reuse.
 */
export function classifyFearlessStages(
  records: DraftGameRecord[],
  opts: FearlessOptions = {},
): { stages: StageVerdict[]; fearlessSeriesIds: Set<string> } {
  const minRate = opts.minRate ?? 0.95;
  const minSeries = opts.minSeries ?? 5;
  const bySeries = groupBySeries(records);
  const stageStats = new Map<string, { event: string; multi: number; zero: number; multiIds: string[] }>();
  for (const games of bySeries.values()) {
    const first = games[0];
    const key = `${first.event} | ${first.stage}`;
    const s = stageStats.get(key) ?? { event: first.event, multi: 0, zero: 0, multiIds: [] };
    if (games.length >= 2) {
      s.multi++;
      s.multiIds.push(first.seriesId);
      if (seriesReuse(games).reusedPicks === 0) s.zero++;
    }
    stageStats.set(key, s);
  }
  const stages: StageVerdict[] = [];
  for (const [key, s] of stageStats) {
    const rate = s.multi === 0 ? 0 : s.zero / s.multi;
    stages.push({ key, multiGameSeries: s.multi, zeroReuseSeries: s.zero, rate, fearless: s.multi >= minSeries && rate >= minRate });
  }
  // Small stages (for example a 4-series Round 3) inherit the event's verdict if they show no reuse.
  const fearlessEvents = new Set(stages.filter((s) => s.fearless).map((s) => stageStats.get(s.key)!.event));
  for (const s of stages) {
    const st = stageStats.get(s.key)!;
    if (!s.fearless && st.multi > 0 && s.rate === 1 && fearlessEvents.has(st.event)) {
      s.fearless = true;
      s.inherited = true;
    }
  }
  // Only multi-game series are Fearless series: a Bo1 has no pool to lock.
  const fearlessSeriesIds = new Set<string>();
  for (const s of stages) if (s.fearless) for (const id of stageStats.get(s.key)!.multiIds) fearlessSeriesIds.add(id);
  stages.sort((a, b) => a.key.localeCompare(b.key));
  return { stages, fearlessSeriesIds };
}
