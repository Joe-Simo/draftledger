import type { TeamAggregate } from "./aggregate.ts";
import { poolsFromTeam } from "./champions.ts";
import { ROLES } from "./types.ts";

/** Below this many games no claim is made at all. */
export const MIN_CLAIM_N = 5;

export type Confidence = "insufficient" | "low" | "medium" | "high";

/** Sample-size label: under 5 games nothing is claimed, 5 to 11 low, 12 to 29 medium, 30 and up high. */
export function confidence(n: number): Confidence {
  if (n < MIN_CLAIM_N) return "insufficient";
  if (n < 12) return "low";
  if (n < 30) return "medium";
  return "high";
}

/** Wilson score interval for a proportion (95% by default). */
export function wilson(wins: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export const pctText = (x: number) => `${Math.round(x * 100)}%`;

export type InsightKind = "ban-target" | "champion-form" | "side" | "fearless-shift" | "pool-depth" | "game1-signature";

export interface Insight {
  id: string;
  kind: InsightKind;
  /** The advice, one sentence. */
  text: string;
  /** The evidence behind it, always with n. */
  evidence: string;
  /** Sample size the claim rests on (the smaller of the samples it compares). */
  n: number;
  confidence: Confidence;
  /** 0 to 1 relevance used to order insights of the same confidence (not shown). */
  strength: number;
}

export interface InsightResult {
  insights: Insight[];
  /** Candidate insights dropped because the sample was under MIN_CLAIM_N or the effect was not clear. */
  suppressed: number;
}

const order: Record<Confidence, number> = { high: 3, medium: 2, low: 1, insufficient: 0 };

/**
 * "How to win" insights against a scouted team. Every claim carries n and a confidence label, tiny
 * samples are suppressed, and win-rate claims need the Wilson interval to clear the comparison.
 */
export function buildInsights(team: TeamAggregate, opts: { maxRemainingGames?: number } = {}): InsightResult {
  const out: Insight[] = [];
  let suppressed = 0;
  const base = team.games === 0 ? 0 : team.wins / team.games;

  // 1. Ban targets: champions they pick often.
  for (const p of team.picks.slice(0, 6)) {
    const rate = p.games / team.games;
    if (p.games < MIN_CLAIM_N || rate < 0.12) {
      if (rate >= 0.12) suppressed++;
      continue;
    }
    out.push({
      id: `ban-${p.champion}`,
      kind: "ban-target",
      text: `Consider banning ${p.champion}: ${team.name} picks it in ${pctText(rate)} of games.`,
      evidence: `${p.champion} picked in ${p.games} of ${team.games} games (n=${team.games}).`,
      n: team.games,
      confidence: confidence(team.games),
      strength: rate,
    });
  }

  // 2. Champion form: clearly better than their own baseline (interval lower bound above it).
  for (const p of team.picks.slice(0, 15)) {
    if (p.games < 10) {
      if (p.games >= MIN_CLAIM_N && p.wins / p.games > base + 0.15) suppressed++;
      continue;
    }
    const [lo] = wilson(p.wins, p.games);
    if (lo > base) {
      out.push({
        id: `form-${p.champion}`,
        kind: "champion-form",
        text: `${p.champion} is a high-value pick for ${team.name}: they win ${pctText(p.wins / p.games)} with it versus ${pctText(base)} overall. Ban it or draft a counter.`,
        evidence: `${p.wins}-${p.games - p.wins} with ${p.champion} (n=${p.games}), 95% interval starts at ${pctText(lo)}, team baseline ${pctText(base)} (n=${team.games}).`,
        n: p.games,
        confidence: confidence(p.games),
        strength: lo,
      });
    } else if (p.wins / p.games > base + 0.15) suppressed++;
  }

  // 3. Side: only when the intervals do not overlap.
  const { blue, red } = team.sides;
  if (blue.games >= 20 && red.games >= 20) {
    const [bl, bh] = wilson(blue.wins, blue.games);
    const [rl, rh] = wilson(red.wins, red.games);
    const strong = bl > rh ? "blue" : rl > bh ? "red" : null;
    if (strong) {
      const s = strong === "blue" ? blue : red;
      const o = strong === "blue" ? red : blue;
      out.push({
        id: "side",
        kind: "side",
        text: `${team.name} is clearly stronger on ${strong} side. If you control side selection, put them on ${strong === "blue" ? "red" : "blue"}.`,
        evidence: `${strong}: ${pctText(s.wins / s.games)} (n=${s.games}), other side: ${pctText(o.wins / o.games)} (n=${o.games}); the 95% intervals do not overlap.`,
        n: Math.min(blue.games, red.games),
        confidence: confidence(Math.min(blue.games, red.games)),
        strength: Math.abs(blue.wins / blue.games - red.wins / red.games),
      });
    } else suppressed++;
  } else if (blue.games + red.games >= MIN_CLAIM_N) suppressed++;

  // 4. Fearless: game 1 signatures and comfort-pool erosion.
  const f = team.fearless;
  if (f) {
    const g1 = f.byGame["1"];
    const g3 = f.byGame["3+"];
    const sig = g1.topPicks[0];
    if (sig && g1.games >= MIN_CLAIM_N && sig.count / g1.games >= 0.2) {
      out.push({
        id: "g1-signature",
        kind: "game1-signature",
        text: `In game 1 expect ${sig.champion} (${pctText(sig.count / g1.games)} of their Fearless game 1s). After game 1 it is locked for both teams, so a game 1 ban only matters for game 1.`,
        evidence: `${sig.champion} in ${sig.count} of ${g1.games} Fearless game 1s (n=${g1.games}).`,
        n: g1.games,
        confidence: confidence(g1.games),
        strength: sig.count / g1.games,
      });
    } else if (g1.games >= MIN_CLAIM_N) suppressed++;
    if (g1.games >= 15 && g3.games >= 15) {
      const drop = g1.comfortShare - g3.comfortShare;
      if (drop >= 0.05) {
        out.push({
          id: "comfort-erosion",
          kind: "fearless-shift",
          text: `In game 3 and later ${team.name} leaves its comfort pool: ${pctText(g3.comfortShare)} of picks come from its ten favourite champions versus ${pctText(g1.comfortShare)} in game 1. Prepare answers beyond their usual ten.`,
          evidence: `Comfort share ${pctText(g1.comfortShare)} (n=${g1.games} game 1s) to ${pctText(g3.comfortShare)} (n=${g3.games} games 3+); top-5 pick overlap between them ${f.top5PickOverlapG1vsG3 === null ? "n/a" : pctText(f.top5PickOverlapG1vsG3)}.`,
          n: Math.min(g1.games, g3.games),
          confidence: confidence(Math.min(g1.games, g3.games)),
          strength: drop,
        });
      } else suppressed++;
    } else if (g1.games > 0 && g3.games > 0) suppressed++;
  }

  // 5. Pool depth: how deep is their known pool in a role (champions played 2+ times there).
  if (team.games >= 20) {
    const pools = poolsFromTeam(team, 2);
    const need = opts.maxRemainingGames ?? 5;
    for (const r of ROLES) {
      const depth = pools[r].length;
      if (depth > 0 && depth < need + 2) {
        out.push({
          id: `pool-${r}`,
          kind: "pool-depth",
          text: `${team.name}'s ${r} pool is shallow (${depth} champions played 2+ times). Fearless locks can force them off comfort picks there by game ${Math.min(5, Math.max(3, depth))}.`,
          evidence: `${depth} ${r} champions with at least 2 games among their top 30 picks (n=${team.games} games).`,
          n: team.games,
          confidence: confidence(team.games),
          strength: 0.1,
        });
      }
    }
  } else if (team.games > 0) suppressed++;

  out.sort((a, b) => order[b.confidence] - order[a.confidence] || b.strength - a.strength || b.n - a.n || a.id.localeCompare(b.id));
  return { insights: out, suppressed };
}
