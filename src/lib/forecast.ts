import type { BoardConfig, BoardView } from "./board.ts";
import { MAX_GAMES, ourTeam, validatePlan, type GamePlan, type PlanIssue } from "./plan.ts";

export type GameStatus = "empty" | "ready" | "warnings" | "errors";

export interface BurnConflict {
  champion: string;
  /** Game (1-based) that is expected to use the champion first. */
  firstGame: number;
  /** Later game whose plan also counts on it. */
  laterGame: number;
}

export interface GameForecast {
  /** 1-based game number. */
  game: number;
  /** Picks we expect to play (actual picks once drafted, otherwise the top priorities not burned earlier). */
  projected: string[];
  /** Locked by games that were really drafted. */
  lockedActual: string[];
  /** Locked only because an earlier plan is expected to play it. */
  lockedProjected: string[];
  issues: PlanIssue[];
  status: GameStatus;
  /** True once the game has a result. */
  played: boolean;
}

export interface SeriesForecast {
  games: GameForecast[];
  conflicts: BurnConflict[];
  totals: { errors: number; warnings: number };
}

const isBlank = (p: GamePlan) => !p.bans.length && !p.picks.length && !p.branches.length;

/**
 * Plays the series forward: drafted games contribute their real picks, undrafted ones the top `perGame`
 * pick priorities not already used. Under Fearless those champions are gone for later games, so any
 * later plan that counts on them is a conflict to settle before the series. Each plan is then checked
 * against the locks its game will face (real plus projected).
 */
export function buildForecast(
  config: BoardConfig,
  view: BoardView,
  plans: GamePlan[],
  known: ReadonlySet<string> | null,
  perGame = 5,
): SeriesForecast {
  const ours = ourTeam(config);
  const fearless = config.fearless;
  const n = Math.min(config.format, MAX_GAMES);
  const firstUse = new Map<string, number>();
  const conflicts: BurnConflict[] = [];
  const games: GameForecast[] = [];
  const actualPicks = (i: number): string[] =>
    (view.games[i]?.actions ?? []).filter((a) => a.step.kind === "pick" && a.champion).map((a) => a.champion as string);
  const actualOurs = (i: number): string[] =>
    (view.games[i]?.actions ?? []).filter((a) => a.step.kind === "pick" && a.team === ours && a.champion).map((a) => a.champion as string);

  const lockedByGame: { actual: Set<string>; projected: Set<string> }[] = [];
  const actualSoFar = new Set<string>();
  const projectedSoFar = new Set<string>();

  for (let i = 0; i < n; i++) {
    const plan = plans[i];
    const played = view.games[i]?.winner != null;
    lockedByGame.push({ actual: new Set(actualSoFar), projected: new Set([...projectedSoFar].filter((c) => !actualSoFar.has(c))) });

    if (fearless) {
      for (const c of plan.picks) {
        const first = firstUse.get(c);
        if (first !== undefined) conflicts.push({ champion: c, firstGame: first + 1, laterGame: i + 1 });
      }
    }
    const projected = played || view.games[i]?.complete ? actualOurs(i) : plan.picks.filter((c) => !firstUse.has(c) || !fearless).slice(0, perGame);
    if (fearless) for (const c of projected) if (!firstUse.has(c)) firstUse.set(c, i);

    // Locks for later games: everything really picked (both teams) is locked; our unplayed plans are projected.
    if (fearless) {
      if (view.games[i] && (played || view.games[i].complete)) for (const c of actualPicks(i)) actualSoFar.add(c);
      else for (const c of projected) projectedSoFar.add(c);
    }
    const locked = new Set([...lockedByGame[i].actual, ...lockedByGame[i].projected]);
    const issues = validatePlan(plan, known, locked);
    const status: GameStatus = issues.some((x) => x.level === "error") ? "errors" : issues.length ? "warnings" : isBlank(plan) ? "empty" : "ready";
    games.push({
      game: i + 1,
      projected,
      lockedActual: [...lockedByGame[i].actual],
      lockedProjected: [...lockedByGame[i].projected],
      issues,
      status,
      played,
    });
  }
  let errors = 0;
  let warnings = 0;
  for (const g of games) for (const x of g.issues) {
      if (x.level === "error") errors++;
      else warnings++;
    }
  return { games, conflicts, totals: { errors, warnings } };
}
