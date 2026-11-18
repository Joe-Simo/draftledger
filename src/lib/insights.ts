import type { TeamAggregate } from "./aggregate.ts";
import type { BoardConfig, BoardView } from "./board.ts";
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
  /** Champions left out of the advice because Fearless or this game already took them. */
  lockedOut: string[];
  /** Game the advice is for (1 when no board state was given). */
  gameNumber: number;
  /** Candidate insights dropped because the sample was under MIN_CLAIM_N or the effect was not clear. */
  suppressed: number;
}

const order: Record<Confidence, number> = { high: 3, medium: 2, low: 1, insufficient: 0 };

/**
 * "How to win" insights against a scouted team. Every claim carries n and a confidence label, tiny
 * samples are suppressed, and win-rate claims need the Wilson interval to clear the comparison.
 */
export interface InsightOptions {
  maxRemainingGames?: number;
  /** Game the draft is for. Default 1. */
  gameNumber?: number;
  /** Champions that cannot be picked or banned now (Fearless locks, picks and bans of this game). */
  unavailable?: readonly string[];
  fearless?: boolean;
}

/** Insight context from a board: the game being drafted (or about to be) and what is already taken. */
export function insightContext(config: BoardConfig, view: BoardView): InsightOptions {
  const gameNumber = (view.current?.number ?? 1) + (view.phase === "result" ? 1 : 0);
  const taken = new Set(view.used);
  // Bans of the game in progress also make a champion unavailable for this game.
  if (view.phase === "draft") {
    for (const a of view.current?.actions ?? []) if (a.champion) taken.add(a.champion);
  }
  return {
    maxRemainingGames: view.maxRemainingGames || undefined,
    gameNumber,
    unavailable: [...taken],
    fearless: config.fearless,
  };
}

const bucketKey = (gameNumber: number): "1" | "2" | "3+" => (gameNumber <= 1 ? "1" : gameNumber === 2 ? "2" : "3+");

/**
 * "How to win" insights against a scouted team. Every claim carries n and a confidence label, tiny
 * samples are suppressed, and win-rate claims need the Wilson interval to clear the comparison.
 * With board context, champions that are already locked are dropped (and listed in lockedOut) and the
 * game-specific advice follows the game being drafted.
 */
export function buildInsights(team: TeamAggregate, opts: InsightOptions = {}): InsightResult {
  const out: Insight[] = [];
  let suppressed = 0;
  const gameNumber = opts.gameNumber ?? 1;
  const blocked = new Set(opts.unavailable ?? []);
  const lockedOut = new Set<string>();
  const open = (champion: string) => {
    if (blocked.has(champion)) {
      lockedOut.add(champion);
      return false;
    }
    return true;
  };
  const base = team.games === 0 ? 0 : team.wins / team.games;

  // 1. Ban targets: champions they pick often.
  for (const p of team.picks.slice(0, 8)) {
    if (!open(p.champion)) continue;
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
    if (!open(p.champion)) continue;
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

  // 4. Fearless: the signature pick for the current game and comfort-pool erosion.
  const f = team.fearless;
  if (f) {
    const g1 = f.byGame["1"];
    const g3 = f.byGame["3+"];
    // Signature for the game being drafted: its own bucket, unlocked champions only.
    const bucket = f.byGame[bucketKey(gameNumber)];
    const label = gameNumber <= 1 ? "game 1" : gameNumber === 2 ? "game 2" : `game ${gameNumber} (games 3+ sample)`;
    const sig = bucket.topPicks.find((c) => open(c.champion));
    const minShare = gameNumber <= 1 ? 0.2 : 0.12;
    if (sig && bucket.games >= MIN_CLAIM_N && sig.count / bucket.games >= minShare) {
      out.push({
        id: gameNumber <= 1 ? "g1-signature" : `signature-g${gameNumber}`,
        kind: "game1-signature",
        text:
          gameNumber <= 1
            ? `In game 1 expect ${sig.champion} (${pctText(sig.count / bucket.games)} of their Fearless game 1s). After game 1 it is locked for both teams, so a game 1 ban only matters for game 1.`
            : `In ${label} expect ${sig.champion} (${pctText(sig.count / bucket.games)} of their Fearless ${gameNumber === 2 ? "game 2s" : "games 3+"}); it is still unlocked.`,
        evidence: `${sig.champion} in ${sig.count} of ${bucket.games} Fearless ${gameNumber === 2 ? "game 2s" : gameNumber <= 1 ? "game 1s" : "games 3+"} (n=${bucket.games}).`,
        n: bucket.games,
        confidence: confidence(bucket.games),
        strength: sig.count / bucket.games,
      });
    } else if (bucket.games >= MIN_CLAIM_N) suppressed++;
    if (g1.games >= 15 && g3.games >= 15) {
      const drop = g1.comfortShare - g3.comfortShare;
      if (drop >= 0.05) {
        out.push({
          id: "comfort-erosion",
          kind: "fearless-shift",
          text: `${gameNumber >= 3 ? "Now" : "From game 3"}: in game 3 and later ${team.name} leaves its comfort pool: ${pctText(g3.comfortShare)} of picks come from its ten favourite champions versus ${pctText(g1.comfortShare)} in game 1. Prepare answers beyond their usual ten.`,
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
      const total = pools[r].length;
      const depth = pools[r].filter((c) => !blocked.has(c)).length;
      if (total > 0 && depth < need + 2) {
        out.push({
          id: `pool-${r}`,
          kind: "pool-depth",
          text: `${team.name}'s ${r} pool is shallow (${depth} unlocked champions played 2+ times${depth < total ? `, ${total - depth} already locked` : ""}). Fearless locks can force them off comfort picks there by game ${Math.min(5, Math.max(3, depth))}.`,
          evidence: `${depth} of ${total} ${r} champions with at least 2 games among their top 30 picks are still unlocked (n=${team.games} games).`,
          n: team.games,
          confidence: confidence(team.games),
          strength: 0.1,
        });
      }
    }
  } else if (team.games > 0) suppressed++;

  out.sort((a, b) => order[b.confidence] - order[a.confidence] || b.strength - a.strength || b.n - a.n || a.id.localeCompare(b.id));
  return { insights: out, suppressed, lockedOut: [...lockedOut], gameNumber };
}
