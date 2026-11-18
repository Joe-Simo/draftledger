import type { ChampCount, TeamAggregate } from "./aggregate.ts";
import {
  other,
  unavailableReason,
  type Scout,
  type BoardConfig,
  type BoardView,
  type TeamKey,
} from "./board.ts";
import { poolsFromTeam, type ChampionInfo } from "./champions.ts";
import { confidence, MIN_CLAIM_N, pctText, type Confidence } from "./insights.ts";
import { ROLES, type Role } from "./types.ts";

export interface Suggestion {
  champion: string;
  /** Games the number rests on. */
  n: number;
  total: number;
  rate: number;
  role?: Role;
  wins?: number;
  confidence: Confidence;
  reason: string;
}

export type SuggestionMode = "ban-ours" | "ban-theirs" | "pick-ours" | "pick-theirs";

export interface StepSuggestions {
  mode: SuggestionMode;
  title: string;
  items: Suggestion[];
  note: string;
  /** How many candidates were left out for a sample under the minimum. */
  hiddenLowSample: number;
}

export type { Scout };

export interface Context {
  config: BoardConfig;
  view: BoardView;
  scout: Scout;
  opponent: TeamAggregate;
  own?: TeamAggregate;
  champions?: ChampionInfo[];
}

const topRole = (roles: Partial<Record<Role, number>>, only?: Role[]): Role | undefined => {
  let best: Role | undefined;
  let n = 0;
  for (const r of ROLES) {
    if (only && !only.includes(r)) continue;
    if ((roles[r] ?? 0) > n) {
      best = r;
      n = roles[r] ?? 0;
    }
  }
  return best;
};

function filledRoles(view: BoardView, team: TeamKey): Role[] {
  return (view.current?.actions ?? []).filter((a) => a.team === team && a.role).map((a) => a.role as Role);
}

/** Suggestions for the next draft step, with sample sizes. Locked and unavailable champions never appear. */
export function suggestForStep(ctx: Context, limit = 6): StepSuggestions | null {
  const { view, config, scout, opponent, own } = ctx;
  const step = view.next;
  if (!step) return null;
  const oppTeam = scout.opponent;
  const weAct = step.team !== oppTeam;
  const free = (c: string) => unavailableReason(config, view, c) === null;
  const mode: SuggestionMode = `${step.kind}-${weAct ? "ours" : "theirs"}` as SuggestionMode;
  const items: Suggestion[] = [];
  let hidden = 0;
  const push = (s: Omit<Suggestion, "confidence">) => {
    if (s.n < MIN_CLAIM_N) {
      hidden++;
      return;
    }
    items.push({ ...s, confidence: confidence(s.n) });
  };

  if (step.kind === "ban" && weAct) {
    for (const p of opponent.picks) {
      if (!free(p.champion)) continue;
      push({
        champion: p.champion,
        n: p.games,
        total: opponent.games,
        rate: p.games / opponent.games,
        role: topRole(p.roles),
        wins: p.wins,
        reason: `${opponent.name} picked it in ${p.games} of ${opponent.games} games (${pctText(p.games / opponent.games)}), won ${pctText(p.wins / p.games)}.`,
      });
    }
  } else if (step.kind === "ban") {
    for (const b of opponent.bans) {
      if (!free(b.champion)) continue;
      push({
        champion: b.champion,
        n: b.count,
        total: opponent.games,
        rate: b.count / opponent.games,
        reason: `${opponent.name} banned it in ${b.count} of ${opponent.games} games, ${b.phase1} in the first ban phase, usually ban #${b.avgOrder}.`,
      });
    }
  } else if (!weAct) {
    const open = ROLES.filter((r) => !filledRoles(view, oppTeam).includes(r));
    for (const p of opponent.picks) {
      if (!free(p.champion)) continue;
      const role = topRole(p.roles, open);
      if (!role) continue;
      push({
        champion: p.champion,
        n: p.games,
        total: opponent.games,
        rate: p.games / opponent.games,
        role,
        wins: p.wins,
        reason: `${opponent.name} picked it in ${p.games} of ${opponent.games} games, mostly ${role}, on average as their pick #${p.avgOrder}.`,
      });
    }
  } else {
    const ours = other(oppTeam);
    const open = ROLES.filter((r) => !filledRoles(view, ours).includes(r));
    if (own) {
      for (const p of own.picks) {
        if (!free(p.champion)) continue;
        const role = topRole(p.roles, open);
        if (!role) continue;
        push({
          champion: p.champion,
          n: p.games,
          total: own.games,
          rate: p.games / own.games,
          role,
          wins: p.wins,
          reason: `${own.name} played it in ${p.games} of ${own.games} games (${role}), won ${pctText(p.wins / p.games)}.`,
        });
      }
    } else {
      for (const c of ctx.champions ?? []) {
        if (!free(c.name)) continue;
        const role = topRole(c.roles, open);
        if (!role) continue;
        push({
          champion: c.name,
          n: c.picks,
          total: c.picks,
          rate: 1,
          role,
          reason: `Played ${c.picks} times league-wide, mostly ${role}.`,
        });
      }
    }
  }

  items.sort((a, b) => b.rate - a.rate || b.n - a.n || a.champion.localeCompare(b.champion));
  const titles: Record<SuggestionMode, string> = {
    "ban-ours": `Suggested bans against ${opponent.name}`,
    "ban-theirs": `Expected bans from ${opponent.name}`,
    "pick-ours": own ? `Suggested picks from ${own.name}` : "Common league picks for open roles",
    "pick-theirs": `Expected picks from ${opponent.name}`,
  };
  return {
    mode,
    title: titles[mode],
    items: items.slice(0, limit),
    hiddenLowSample: hidden,
    note: `Rates are over all ${weAct && mode === "pick-ours" && own ? own.games : opponent.games} games on record; champions locked by Fearless or already used this game are removed. Candidates under ${MIN_CLAIM_N} games are hidden.`,
  };
}

export interface RoleOutlook {
  role: Role;
  likely: Suggestion[];
  /** Champions played 2+ times in this role still unlocked. */
  remainingDepth: number;
  totalDepth: number;
}

export interface NextGameOutlook {
  gameNumber: number;
  burned: ChampCount[];
  /** Share of the opponent's ten most picked champions' games that are already locked. */
  burnedShare: number;
  byRole: RoleOutlook[];
  comfortNote: string | null;
}

/** What to expect from the scouted team next game, given what Fearless has locked so far. */
export function nextGameOutlook(ctx: Pick<Context, "config" | "view" | "opponent">): NextGameOutlook | null {
  const { config, view, opponent } = ctx;
  if (view.phase === "done") return null;
  const locked = new Set(view.used);
  // When the current draft is complete the next game is current + 1; while drafting, it is this game with picks so far applied.
  const gameNumber = (view.current?.number ?? 1) + (view.phase === "result" ? 1 : 0);
  const top10 = opponent.picks.slice(0, 10);
  const top10Total = top10.reduce((a, p) => a + p.games, 0);
  const burned = top10.filter((p) => locked.has(p.champion)).map((p) => ({ champion: p.champion, count: p.games }));
  const burnedGames = burned.reduce((a, p) => a + p.count, 0);
  const pools = poolsFromTeam(opponent, 2);
  const byRole: RoleOutlook[] = ROLES.map((role) => {
    const likely: Suggestion[] = [];
    for (const p of opponent.picks) {
      if (locked.has(p.champion)) continue;
      const rg = p.roles[role] ?? 0;
      if (rg < MIN_CLAIM_N) continue;
      likely.push({
        champion: p.champion,
        n: rg,
        total: opponent.games,
        rate: rg / opponent.games,
        role,
        wins: p.wins,
        confidence: confidence(rg),
        reason: `Played ${role} ${rg} times in ${opponent.games} games.`,
      });
    }
    likely.sort((a, b) => b.n - a.n || a.champion.localeCompare(b.champion));
    return {
      role,
      likely: likely.slice(0, 3),
      remainingDepth: pools[role].filter((c) => !locked.has(c)).length,
      totalDepth: pools[role].length,
    };
  });
  let comfortNote: string | null = null;
  const f = opponent.fearless;
  if (config.fearless && f && gameNumber >= 3 && f.byGame["3+"].games >= 15 && f.byGame["1"].games >= 15) {
    comfortNote = `In Fearless games 3 and later their comfort share was ${pctText(f.byGame["3+"].comfortShare)} versus ${pctText(f.byGame["1"].comfortShare)} in game 1 (n=${f.byGame["3+"].games} and ${f.byGame["1"].games}), so expect fewer signature picks.`;
  }
  return {
    gameNumber,
    burned,
    burnedShare: top10Total === 0 ? 0 : burnedGames / top10Total,
    byRole,
    comfortNote,
  };
}

/**
 * Name and pool the two board teams from aggregates: the scouted opponent takes its board side, and
 * "our team" (if chosen) takes the other side. Teams without an aggregate keep what they have.
 */
export function applyScoutSetup(config: BoardConfig, teams: TeamAggregate[]): BoardConfig {
  const scout = config.scout;
  if (!scout) return config;
  const opp = teams.find((t) => t.teamId === scout.opponentId);
  const own = teams.find((t) => t.teamId === scout.ownId);
  const ownKey = other(scout.opponent);
  const next = { ...config, teams: { ...config.teams } };
  if (opp) next.teams[scout.opponent] = { ...config.teams[scout.opponent], name: opp.name, pool: poolsFromTeam(opp, 2) };
  if (own) next.teams[ownKey] = { ...config.teams[ownKey], name: own.name, pool: poolsFromTeam(own, 2) };
  return next;
}
