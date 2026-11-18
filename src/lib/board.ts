import { ROLES, type Role, type Side } from "./types.ts";

export type TeamKey = "A" | "B";
export type SeriesFormat = 1 | 3 | 5;
export const WINS_NEEDED: Record<SeriesFormat, number> = { 1: 1, 3: 2, 5: 3 };
/** Spare champions wanted on top of what the remaining games need before a role is called thin. */
export const THIN_BUFFER = 2;

export interface TeamSetup {
  name: string;
  /** Optional player display name per role. */
  players: Record<Role, string>;
  /** Champions each role could play. Empty means "not set". */
  pool: Record<Role, string[]>;
}

export interface BoardConfig {
  format: SeriesFormat;
  fearless: boolean;
  teams: Record<TeamKey, TeamSetup>;
  /** Blue side team in game 1. Later games default to the loser of the previous game. */
  firstBlue: TeamKey;
}

export interface Step {
  kind: "ban" | "pick";
  side: Side;
  phase: 1 | 2;
}

const S = (kind: Step["kind"], side: Side, phase: 1 | 2): Step => ({ kind, side, phase });
/** Standard LoL tournament draft: 3 bans each, snake picks, 2 more bans each (red first), snake picks. */
export const DRAFT_ORDER: readonly Step[] = [
  S("ban", "blue", 1), S("ban", "red", 1), S("ban", "blue", 1), S("ban", "red", 1), S("ban", "blue", 1), S("ban", "red", 1),
  S("pick", "blue", 1), S("pick", "red", 1), S("pick", "red", 1), S("pick", "blue", 1), S("pick", "blue", 1), S("pick", "red", 1),
  S("ban", "red", 2), S("ban", "blue", 2), S("ban", "red", 2), S("ban", "blue", 2),
  S("pick", "red", 2), S("pick", "blue", 2), S("pick", "blue", 2), S("pick", "red", 2),
];

export type BoardEvent =
  | { t: "side"; blue: TeamKey }
  | { t: "ban"; champion: string | null }
  | { t: "pick"; champion: string; role: Role }
  | { t: "result"; winner: TeamKey };

export interface BoardState {
  config: BoardConfig;
  log: BoardEvent[];
  redo: BoardEvent[];
}

export type BoardCommand =
  | { type: "event"; event: BoardEvent }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "configure"; config: BoardConfig };

export interface ActionView {
  step: Step;
  team: TeamKey;
  /** null for a skipped ban. */
  champion: string | null;
  role?: Role;
}

export interface GameView {
  number: number;
  blue: TeamKey;
  red: TeamKey;
  actions: ActionView[];
  complete: boolean;
  winner: TeamKey | null;
}

export type PoolStatus = "ok" | "thin" | "critical" | "unset";

export interface RolePool {
  role: Role;
  player: string;
  pool: string[];
  /** Pool minus every champion already used (picked) in this series, when Fearless. */
  remaining: string[];
  /** Remaining champions that can still be picked right now (not banned in the current game). */
  availableNow: string[];
  /** Games this role may still have to be filled in the worst case. */
  needed: number;
  status: PoolStatus;
}

export interface BoardView {
  games: GameView[];
  current: GameView | null;
  /** Next draft step with the team that owns it, or null when the draft is complete or the series is over. */
  next: (Step & { team: TeamKey }) | null;
  phase: "draft" | "result" | "done";
  score: Record<TeamKey, number>;
  winner: TeamKey | null;
  /** Champions picked in earlier games (and in the current one) when Fearless; always includes the current game's picks. */
  used: string[];
  maxRemainingGames: number;
  pools: Record<TeamKey, RolePool[]>;
}

export const other = (t: TeamKey): TeamKey => (t === "A" ? "B" : "A");

export function emptyTeam(name: string): TeamSetup {
  return {
    name,
    players: { top: "", jungle: "", mid: "", bot: "", support: "" },
    pool: { top: [], jungle: [], mid: [], bot: [], support: [] },
  };
}

export function defaultConfig(): BoardConfig {
  return { format: 3, fearless: true, teams: { A: emptyTeam("Team A"), B: emptyTeam("Team B") }, firstBlue: "A" };
}

export function initialState(config: BoardConfig = defaultConfig()): BoardState {
  return { config, log: [], redo: [] };
}

/** Longest the series can still go, counting the current game when it has no result yet. */
export function maxRemainingGames(format: SeriesFormat, score: Record<TeamKey, number>): number {
  const w = WINS_NEEDED[format];
  if (score.A >= w || score.B >= w) return 0;
  return w - score.A + (w - score.B) - 1;
}

export function poolStatus(remaining: number, needed: number, poolSize: number): PoolStatus {
  if (poolSize === 0) return "unset";
  if (remaining < needed) return "critical";
  if (remaining < needed + THIN_BUFFER) return "thin";
  return "ok";
}

function newGame(number: number, blue: TeamKey): GameView {
  return { number, blue, red: other(blue), actions: [], complete: false, winner: null };
}

/**
 * Replay the log from the config. Throws on an invalid event so callers can reject it; the log is
 * the only source of truth, which makes undo and persistence trivial.
 */
export function deriveView(config: BoardConfig, log: readonly BoardEvent[]): BoardView {
  const games: GameView[] = [newGame(1, config.firstBlue)];
  const score: Record<TeamKey, number> = { A: 0, B: 0 };
  const w = WINS_NEEDED[config.format];
  let winner: TeamKey | null = null;
  const cur = () => games[games.length - 1];

  for (const [i, ev] of log.entries()) {
    const fail = (msg: string): never => {
      throw new Error(`event ${i + 1} (${ev.t}): ${msg}`);
    };
    if (winner) fail("the series is over");
    const g = cur();
    if (ev.t === "side") {
      if (g.actions.length > 0) fail("side can only change before the first ban");
      g.blue = ev.blue;
      g.red = other(ev.blue);
    } else if (ev.t === "ban" || ev.t === "pick") {
      const step = DRAFT_ORDER[g.actions.length];
      if (!step) fail("the draft is complete, enter the result");
      if (step.kind !== ev.t) fail(`expected a ${step.kind}`);
      const team = step.side === "blue" ? g.blue : g.red;
      if (ev.t === "ban") {
        if (ev.champion !== null) {
          const reason = unavailableReasonIn(config, games, ev.champion);
          if (reason) fail(`${ev.champion} is unavailable (${reason})`);
        }
        g.actions.push({ step, team, champion: ev.champion });
      } else {
        const reason = unavailableReasonIn(config, games, ev.champion);
        if (reason) fail(`${ev.champion} is unavailable (${reason})`);
        if (!ROLES.includes(ev.role)) fail(`unknown role ${ev.role}`);
        if (g.actions.some((a) => a.team === team && a.role === ev.role)) fail(`${ev.role} is already filled`);
        g.actions.push({ step, team, champion: ev.champion, role: ev.role });
      }
      g.complete = g.actions.length === DRAFT_ORDER.length;
    } else {
      if (!g.complete) fail("finish the draft first");
      g.winner = ev.winner;
      score[ev.winner]++;
      if (score[ev.winner] >= w) winner = ev.winner;
      else games.push(newGame(g.number + 1, other(ev.winner)));
    }
  }

  const current = winner ? null : cur();
  const step = current ? DRAFT_ORDER[current.actions.length] : undefined;
  const next = current && step ? { ...step, team: step.side === "blue" ? current.blue : current.red } : null;
  const phase: BoardView["phase"] = winner ? "done" : next ? "draft" : "result";
  const used = usedChampions(config, games);
  const maxRem = maxRemainingGames(config.format, score);
  return {
    games,
    current,
    next,
    phase,
    score,
    winner,
    used,
    maxRemainingGames: maxRem,
    pools: { A: buildPools(config, "A", current, used, maxRem, phase), B: buildPools(config, "B", current, used, maxRem, phase) },
  };
}

function usedChampions(config: BoardConfig, games: GameView[]): string[] {
  const picks = new Set<string>();
  const list = config.fearless ? games : games.slice(-1);
  for (const g of list) for (const a of g.actions) if (a.step.kind === "pick" && a.champion) picks.add(a.champion);
  return [...picks];
}

function unavailableReasonIn(config: BoardConfig, games: GameView[], champion: string): string | null {
  const g = games[games.length - 1];
  if (config.fearless) {
    for (const old of games.slice(0, -1)) {
      if (old.actions.some((a) => a.step.kind === "pick" && a.champion === champion))
        return `Fearless lock, picked in game ${old.number}`;
    }
  }
  const hit = g.actions.find((a) => a.champion === champion);
  if (hit) return hit.step.kind === "pick" ? "already picked this game" : "already banned this game";
  return null;
}

/** Why a champion cannot be banned or picked right now, or null when it can. */
export function unavailableReason(config: BoardConfig, view: BoardView, champion: string): string | null {
  return unavailableReasonIn(config, view.games, champion);
}

function buildPools(
  config: BoardConfig,
  team: TeamKey,
  current: GameView | null,
  used: string[],
  maxRem: number,
  phase: BoardView["phase"],
): RolePool[] {
  const setup = config.teams[team];
  const usedSet = new Set(used);
  const bannedNow = new Set(
    (current?.actions ?? []).filter((a) => a.step.kind === "ban" && a.champion).map((a) => a.champion as string),
  );
  const pickedNow = new Set(
    (current?.actions ?? []).filter((a) => a.step.kind === "pick" && a.champion).map((a) => a.champion as string),
  );
  return ROLES.map((role) => {
    const pool = setup.pool[role];
    const remaining = pool.filter((c) => !usedSet.has(c));
    const filledNow = !!current?.actions.some((a) => a.team === team && a.role === role);
    const availableNow = remaining.filter((c) => !bannedNow.has(c) && !pickedNow.has(c));
    const needed = phase === "done" ? 0 : Math.max(0, maxRem - (filledNow ? 1 : 0));
    const status = config.fearless || pool.length === 0 ? poolStatus(remaining.length, needed, pool.length) : "ok";
    return { role, player: setup.players[role], pool, remaining, availableNow, needed, status };
  });
}

/** Apply a command; invalid events leave the state unchanged and return an error message. */
export function boardReducer(state: BoardState, cmd: BoardCommand): { state: BoardState; error?: string } {
  switch (cmd.type) {
    case "configure":
      return { state: initialState(cmd.config) };
    case "undo": {
      const last = state.log[state.log.length - 1];
      if (!last) return { state, error: "nothing to undo" };
      return { state: { ...state, log: state.log.slice(0, -1), redo: [...state.redo, last] } };
    }
    case "redo": {
      const ev = state.redo[state.redo.length - 1];
      if (!ev) return { state, error: "nothing to redo" };
      return { state: { ...state, log: [...state.log, ev], redo: state.redo.slice(0, -1) } };
    }
    case "event": {
      const log = [...state.log, cmd.event];
      try {
        deriveView(state.config, log);
      } catch (e) {
        return { state, error: e instanceof Error ? e.message : String(e) };
      }
      return { state: { ...state, log, redo: [] } };
    }
  }
}

/** Check that a persisted state still replays; used when loading from localStorage. */
export function validState(state: unknown): state is BoardState {
  if (!state || typeof state !== "object") return false;
  const s = state as BoardState;
  if (!s.config || !Array.isArray(s.log) || !Array.isArray(s.redo)) return false;
  try {
    deriveView(s.config, s.log);
    deriveView(s.config, [...s.log, ...[...s.redo].reverse()]);
    return true;
  } catch {
    return false;
  }
}
