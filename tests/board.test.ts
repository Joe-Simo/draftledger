import { describe, expect, it } from "vitest";
import {
  DRAFT_ORDER,
  THIN_BUFFER,
  WINS_NEEDED,
  boardReducer,
  defaultConfig,
  deriveView,
  initialState,
  maxRemainingGames,
  poolStatus,
  unavailableReason,
  validState,
  type BoardCommand,
  type BoardConfig,
  type BoardEvent,
  type BoardState,
  type TeamKey,
} from "@/lib/board";
import { ROLES } from "@/lib/types";

let counter = 0;
/** Unique champion names so a whole series can be drafted without hitting a lock. */
const fresh = () => `Champ${++counter}`;

function run(state: BoardState, ...events: BoardEvent[]): BoardState {
  let s = state;
  for (const event of events) {
    const r = boardReducer(s, { type: "event", event });
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

/** Plays out a complete draft of the current game with fresh champions, optionally recording named picks. */
function draftGame(state: BoardState, picks?: Record<number, string>): BoardState {
  let s = state;
  let pickIndex = 0;
  const view = deriveView(s.config, s.log);
  const start = view.current!.actions.length;
  for (let i = start; i < DRAFT_ORDER.length; i++) {
    const step = DRAFT_ORDER[i];
    if (step.kind === "ban") s = run(s, { t: "ban", champion: fresh() });
    else {
      const teamPicksBefore = DRAFT_ORDER.slice(0, i).filter((x) => x.kind === "pick" && x.side === step.side).length;
      s = run(s, { t: "pick", champion: picks?.[pickIndex] ?? fresh(), role: ROLES[teamPicksBefore] });
      pickIndex++;
    }
  }
  return s;
}

const cfg = (over: Partial<BoardConfig> = {}): BoardConfig => ({ ...defaultConfig(), ...over });

describe("draft order", () => {
  it("has 20 steps in the standard pattern", () => {
    expect(DRAFT_ORDER).toHaveLength(20);
    const pattern = DRAFT_ORDER.map((s) => `${s.kind[0]}${s.side[0]}`).join(" ");
    expect(pattern).toBe("bb br bb br bb br pb pr pr pb pb pr br bb br bb pr pb pb pr");
  });

  it("gives each side 5 bans and 5 picks, and phases are 6 bans, 6 picks, 4 bans, 4 picks", () => {
    for (const side of ["blue", "red"] as const) {
      expect(DRAFT_ORDER.filter((s) => s.side === side && s.kind === "ban")).toHaveLength(5);
      expect(DRAFT_ORDER.filter((s) => s.side === side && s.kind === "pick")).toHaveLength(5);
    }
    expect(DRAFT_ORDER.slice(0, 6).every((s) => s.kind === "ban" && s.phase === 1)).toBe(true);
    expect(DRAFT_ORDER.slice(6, 12).every((s) => s.kind === "pick" && s.phase === 1)).toBe(true);
    expect(DRAFT_ORDER.slice(12, 16).every((s) => s.kind === "ban" && s.phase === 2)).toBe(true);
    expect(DRAFT_ORDER.slice(16).every((s) => s.kind === "pick" && s.phase === 2)).toBe(true);
  });

  it("reports the next step with the owning team, following side selection", () => {
    let s = initialState(cfg());
    expect(deriveView(s.config, s.log).next).toMatchObject({ kind: "ban", side: "blue", team: "A" });
    s = run(s, { t: "side", blue: "B" });
    s = run(s, { t: "ban", champion: "X1" }, { t: "ban", champion: "X2" });
    const v = deriveView(s.config, s.log);
    expect(v.next).toMatchObject({ kind: "ban", side: "blue", team: "B" });
    expect(v.current!.actions.map((a) => a.team)).toEqual(["B", "A"]);
  });

  it("rejects the wrong kind of action for the step", () => {
    const s = initialState(cfg());
    expect(boardReducer(s, { type: "event", event: { t: "pick", champion: "Z", role: "top" } }).error).toMatch(/expected a ban/);
    const atPick = run(s, ...Array.from({ length: 6 }, (_, i) => ({ t: "ban", champion: `b${i}` }) as BoardEvent));
    expect(boardReducer(atPick, { type: "event", event: { t: "ban", champion: "q" } }).error).toMatch(/expected a pick/);
  });

  it("allows skipped bans but never skipped picks", () => {
    const s = run(initialState(cfg()), { t: "ban", champion: null });
    expect(deriveView(s.config, s.log).current!.actions[0].champion).toBeNull();
  });

  it("requires the result before more drafting, and a complete draft before the result", () => {
    let s = initialState(cfg());
    expect(boardReducer(s, { type: "event", event: { t: "result", winner: "A" } }).error).toMatch(/finish the draft/);
    s = draftGame(s);
    const v = deriveView(s.config, s.log);
    expect(v.phase).toBe("result");
    expect(v.next).toBeNull();
    expect(boardReducer(s, { type: "event", event: { t: "ban", champion: "late" } }).error).toMatch(/complete/);
  });

  it("rejects a role that the team already filled", () => {
    let s = initialState(cfg());
    s = run(s, ...Array.from({ length: 6 }, (_, i) => ({ t: "ban", champion: `b${i}` }) as BoardEvent));
    s = run(s, { t: "pick", champion: "P1", role: "top" }, { t: "pick", champion: "P2", role: "top" });
    expect(boardReducer(s, { type: "event", event: { t: "pick", champion: "P3", role: "top" } }).error).toMatch(/already filled/);
    expect(boardReducer(s, { type: "event", event: { t: "pick", champion: "P3", role: "jungle" } }).error).toBeUndefined();
  });
});

describe("availability inside a game", () => {
  it("blocks repeating a picked or banned champion in the same game", () => {
    let s = initialState(cfg());
    s = run(s, { t: "ban", champion: "Ahri" });
    expect(boardReducer(s, { type: "event", event: { t: "ban", champion: "Ahri" } }).error).toMatch(/already banned/);
    s = run(s, ...Array.from({ length: 5 }, (_, i) => ({ t: "ban", champion: `b${i}` }) as BoardEvent));
    expect(boardReducer(s, { type: "event", event: { t: "pick", champion: "Ahri", role: "mid" } }).error).toMatch(/already banned/);
    s = run(s, { t: "pick", champion: "Zed", role: "mid" });
    expect(boardReducer(s, { type: "event", event: { t: "pick", champion: "Zed", role: "top" } }).error).toMatch(/already picked/);
  });
});

describe("side selection", () => {
  it("defaults game 2 blue to the loser of game 1, and lets it be overridden before the first ban only", () => {
    let s = draftGame(initialState(cfg({ firstBlue: "A" })));
    s = run(s, { t: "result", winner: "A" });
    let v = deriveView(s.config, s.log);
    expect(v.current).toMatchObject({ number: 2, blue: "B", red: "A" });
    s = run(s, { t: "side", blue: "A" });
    v = deriveView(s.config, s.log);
    expect(v.current).toMatchObject({ blue: "A" });
    s = run(s, { t: "ban", champion: fresh() });
    expect(boardReducer(s, { type: "event", event: { t: "side", blue: "B" } }).error).toMatch(/before the first ban/);
  });

  it("uses firstBlue for game 1", () => {
    const s = initialState(cfg({ firstBlue: "B" }));
    expect(deriveView(s.config, s.log).current).toMatchObject({ blue: "B", red: "A" });
  });
});

describe("series flow", () => {
  const winSeries = (format: 1 | 3 | 5, winners: TeamKey[]) => {
    let s = initialState(cfg({ format }));
    for (const w of winners) {
      s = draftGame(s);
      s = run(s, { t: "result", winner: w });
    }
    return s;
  };

  it("Bo1 ends after one result", () => {
    const s = winSeries(1, ["B"]);
    const v = deriveView(s.config, s.log);
    expect(v).toMatchObject({ phase: "done", winner: "B", current: null, score: { A: 0, B: 1 } });
    expect(boardReducer(s, { type: "event", event: { t: "ban", champion: "x" } }).error).toMatch(/series is over/);
  });

  it("Bo3 ends at 2 wins (2-0 and 2-1) and continues at 1-1", () => {
    expect(deriveView(...(([s]) => [s.config, s.log] as const)([winSeries(3, ["A", "A"])])).winner).toBe("A");
    const mid = winSeries(3, ["A", "B"]);
    const v = deriveView(mid.config, mid.log);
    expect(v).toMatchObject({ phase: "draft", winner: null, score: { A: 1, B: 1 } });
    expect(v.current!.number).toBe(3);
    const end = winSeries(3, ["A", "B", "B"]);
    expect(deriveView(end.config, end.log)).toMatchObject({ winner: "B", phase: "done", games: expect.any(Array) });
    expect(deriveView(end.config, end.log).games).toHaveLength(3);
  });

  it("Bo5 ends at 3 wins and tracks game numbers up to 5", () => {
    const s = winSeries(5, ["A", "B", "A", "B"]);
    const v = deriveView(s.config, s.log);
    expect(v.current!.number).toBe(5);
    expect(v.winner).toBeNull();
    const done = winSeries(5, ["A", "B", "A", "B", "A"]);
    expect(deriveView(done.config, done.log)).toMatchObject({ winner: "A", score: { A: 3, B: 2 } });
    expect(deriveView(done.config, done.log).games).toHaveLength(5);
  });

  it("maxRemainingGames matches the format arithmetic", () => {
    expect(WINS_NEEDED).toEqual({ 1: 1, 3: 2, 5: 3 });
    expect(maxRemainingGames(1, { A: 0, B: 0 })).toBe(1);
    expect(maxRemainingGames(3, { A: 0, B: 0 })).toBe(3);
    expect(maxRemainingGames(3, { A: 1, B: 0 })).toBe(2);
    expect(maxRemainingGames(3, { A: 1, B: 1 })).toBe(1);
    expect(maxRemainingGames(3, { A: 2, B: 0 })).toBe(0);
    expect(maxRemainingGames(5, { A: 0, B: 0 })).toBe(5);
    expect(maxRemainingGames(5, { A: 2, B: 2 })).toBe(1);
    expect(maxRemainingGames(5, { A: 2, B: 1 })).toBe(2);
  });
});

describe("Fearless lock", () => {
  const picks1 = { 0: "Ahri", 1: "Vi", 2: "Zed", 3: "Jinx", 4: "Leona", 5: "Lux", 6: "Gnar", 7: "Orianna", 8: "Kaisa", 9: "Nami" };

  it("makes champions picked in earlier games unavailable to both teams, for picks and bans", () => {
    let s = draftGame(initialState(cfg({ format: 5 })), picks1);
    s = run(s, { t: "result", winner: "A" });
    const v = deriveView(s.config, s.log);
    for (const c of Object.values(picks1)) {
      expect(unavailableReason(s.config, v, c)).toMatch(/Fearless lock, picked in game 1/);
    }
    expect(boardReducer(s, { type: "event", event: { t: "ban", champion: "Ahri" } }).error).toMatch(/Fearless lock/);
    s = run(s, ...Array.from({ length: 6 }, (_, i) => ({ t: "ban", champion: `nb${i}` }) as BoardEvent));
    expect(boardReducer(s, { type: "event", event: { t: "pick", champion: "Vi", role: "jungle" } }).error).toMatch(/Fearless lock/);
  });

  it("does not lock champions that were only banned", () => {
    let s = initialState(cfg({ format: 5 }));
    s = run(s, { t: "ban", champion: "Teemo" });
    s = draftGame(s);
    s = run(s, { t: "result", winner: "B" });
    expect(unavailableReason(s.config, deriveView(s.config, s.log), "Teemo")).toBeNull();
  });

  it("keeps the lock across all later games (game 3 sees games 1 and 2)", () => {
    let s = draftGame(initialState(cfg({ format: 5 })), { 0: "L1" });
    s = run(s, { t: "result", winner: "A" });
    s = draftGame(s, { 0: "L2" });
    s = run(s, { t: "result", winner: "B" });
    const v = deriveView(s.config, s.log);
    expect(unavailableReason(s.config, v, "L1")).toMatch(/game 1/);
    expect(unavailableReason(s.config, v, "L2")).toMatch(/game 2/);
    expect(v.used).toEqual(expect.arrayContaining(["L1", "L2"]));
  });

  it("does not lock anything between games when Fearless is off", () => {
    let s = draftGame(initialState(cfg({ fearless: false })), picks1);
    s = run(s, { t: "result", winner: "A" });
    const v = deriveView(s.config, s.log);
    expect(unavailableReason(s.config, v, "Ahri")).toBeNull();
    expect(v.used).toEqual([]);
    s = run(s, ...Array.from({ length: 6 }, (_, i) => ({ t: "ban", champion: `nb${i}` }) as BoardEvent));
    s = run(s, { t: "pick", champion: "Ahri", role: "mid" });
    expect(deriveView(s.config, s.log).current!.actions.at(-1)!.champion).toBe("Ahri");
  });
});

describe("undo and redo", () => {
  it("undoes the last event and redoes it, clearing redo on a new event", () => {
    let s = run(initialState(cfg()), { t: "ban", champion: "A1" }, { t: "ban", champion: "A2" });
    s = boardReducer(s, { type: "undo" }).state;
    expect(deriveView(s.config, s.log).current!.actions).toHaveLength(1);
    expect(s.redo).toHaveLength(1);
    s = boardReducer(s, { type: "redo" }).state;
    expect(deriveView(s.config, s.log).current!.actions).toHaveLength(2);
    s = boardReducer(s, { type: "undo" }).state;
    s = run(s, { t: "ban", champion: "A3" });
    expect(s.redo).toEqual([]);
    expect(boardReducer(s, { type: "redo" }).error).toMatch(/nothing to redo/);
  });

  it("undoing a pick frees the champion again, including after a Fearless lock", () => {
    let s = draftGame(initialState(cfg({ format: 3 })), { 0: "Ahri" });
    s = run(s, { t: "result", winner: "A" });
    expect(unavailableReason(s.config, deriveView(s.config, s.log), "Ahri")).not.toBeNull();
    s = boardReducer(s, { type: "undo" }).state; // undo result
    const v = deriveView(s.config, s.log);
    expect(v.phase).toBe("result");
    expect(v.score).toEqual({ A: 0, B: 0 });
    expect(v.games).toHaveLength(1);
    // Undo until the Ahri pick is gone.
    while (deriveView(s.config, s.log).current!.actions.some((a) => a.champion === "Ahri")) s = boardReducer(s, { type: "undo" }).state;
    expect(unavailableReason(s.config, deriveView(s.config, s.log), "Ahri")).toBeNull();
  });

  it("undo across a game boundary returns to the previous game and restores side defaults", () => {
    let s = draftGame(initialState(cfg()));
    s = run(s, { t: "result", winner: "B" });
    expect(deriveView(s.config, s.log).current!.number).toBe(2);
    s = boardReducer(s, { type: "undo" }).state;
    expect(deriveView(s.config, s.log).current!.number).toBe(1);
    expect(deriveView(s.config, s.log).games[0].winner).toBeNull();
  });

  it("reports nothing to undo on an empty log and leaves state intact", () => {
    const s = initialState(cfg());
    const r = boardReducer(s, { type: "undo" });
    expect(r.error).toMatch(/nothing to undo/);
    expect(r.state).toBe(s);
  });

  it("an invalid event leaves state untouched", () => {
    const s = initialState(cfg());
    const r = boardReducer(s, { type: "event", event: { t: "result", winner: "A" } });
    expect(r.state).toBe(s);
  });

  it("changing the scouted team keeps the draft", () => {
    let s = run(initialState(cfg()), { t: "ban", champion: "x" });
    s = boardReducer(s, { type: "scout", scout: { opponent: "B", opponentId: "42" } }).state;
    expect(s.log).toHaveLength(1);
    expect(s.config.scout).toEqual({ opponent: "B", opponentId: "42" });
    s = boardReducer(s, { type: "scout", scout: undefined }).state;
    expect(s.config.scout).toBeUndefined();
    expect(validState(s)).toBe(true);
  });

  it("configure resets the log", () => {
    let s = run(initialState(cfg()), { t: "ban", champion: "x" });
    s = boardReducer(s, { type: "configure", config: cfg({ format: 5 }) } as BoardCommand).state;
    expect(s.log).toEqual([]);
    expect(s.config.format).toBe(5);
  });
});

describe("role pools", () => {
  const pooledConfig = (poolSize: number, format: 3 | 5 = 5): BoardConfig => {
    const c = cfg({ format });
    for (const t of ["A", "B"] as const)
      for (const r of ROLES) c.teams[t].pool[r] = Array.from({ length: poolSize }, (_, i) => `${t}-${r}-${i}`);
    return c;
  };

  it("poolStatus thresholds", () => {
    expect(poolStatus(0, 0, 0)).toBe("unset");
    expect(poolStatus(2, 3, 8)).toBe("critical");
    expect(poolStatus(3, 3, 8)).toBe("thin");
    expect(poolStatus(3 + THIN_BUFFER - 1, 3, 8)).toBe("thin");
    expect(poolStatus(3 + THIN_BUFFER, 3, 8)).toBe("ok");
  });

  it("starts with the full pool and no warnings when pools are big enough", () => {
    const s = initialState(pooledConfig(8));
    const v = deriveView(s.config, s.log);
    expect(v.pools.A.map((p) => p.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(v.pools.A[0].remaining).toHaveLength(8);
    expect(v.pools.A[0].needed).toBe(5);
  });

  it("removes champions used by either team from every pool and counts needs per role", () => {
    let s = initialState(pooledConfig(6));
    s = run(s, ...Array.from({ length: 6 }, (_, i) => ({ t: "ban", champion: `b${i}` }) as BoardEvent));
    // Team A is blue. Blue pick 1 uses A top champion; red picks one of A's pool champions as a steal.
    s = run(s, { t: "pick", champion: "A-top-0", role: "top" }, { t: "pick", champion: "A-jungle-0", role: "jungle" });
    const v = deriveView(s.config, s.log);
    expect(v.pools.A[0].remaining).toHaveLength(5);
    expect(v.pools.A[0].needed).toBe(4); // top already filled this game, 4 more games at most in Bo5
    expect(v.pools.A[1].remaining).toHaveLength(5); // stolen by B
    expect(v.pools.A[1].needed).toBe(5); // jungle for A is not filled yet
    expect(v.pools.B[0].remaining).toHaveLength(6);
  });

  it("shows champions banned this game as not available now but still in the remaining pool", () => {
    let s = initialState(pooledConfig(6));
    s = run(s, { t: "ban", champion: "A-mid-0" });
    const mid = deriveView(s.config, s.log).pools.A[2];
    expect(mid.remaining).toHaveLength(6);
    expect(mid.availableNow).toHaveLength(5);
  });

  /** Bo5 where team A plays one champion from its own top pool each game; results A, B, A, B keep it alive to game 5. */
  const topStatuses = (poolSize: number) => {
    const config = pooledConfig(poolSize, 5);
    let s = initialState(config);
    const out: { status: string; remaining: number; needed: number }[] = [];
    for (let game = 0; game < 4; game++) {
      s = run(s, ...Array.from({ length: 6 }, (_, i) => ({ t: "ban", champion: `g${game}b${i}` }) as BoardEvent));
      const aIsBlue = deriveView(s.config, s.log).current!.blue === "A";
      // Blue's first pick is draft step index 0 of the pick list, red's first is index 1.
      s = draftGame(s, aIsBlue ? { 0: config.teams.A.pool.top[game] } : { 1: config.teams.A.pool.top[game] });
      s = run(s, { t: "result", winner: game % 2 === 0 ? "A" : "B" });
      const top = deriveView(s.config, s.log).pools.A[0];
      out.push({ status: top.status, remaining: top.remaining.length, needed: top.needed });
    }
    return out;
  };

  it("stays ok with a deep pool all the way to game 5", () => {
    expect(topStatuses(7)).toEqual([
      { status: "ok", remaining: 6, needed: 4 },
      { status: "ok", remaining: 5, needed: 3 },
      { status: "ok", remaining: 4, needed: 2 },
      { status: "ok", remaining: 3, needed: 1 },
    ]);
  });

  it("warns thin when the spare champions drop under the buffer", () => {
    expect(topStatuses(6).map((x) => x.status)).toEqual(["thin", "thin", "thin", "thin"]);
  });

  it("goes critical when fewer champions remain than games that may still be played", () => {
    expect(topStatuses(4)).toEqual([
      { status: "critical", remaining: 3, needed: 4 },
      { status: "critical", remaining: 2, needed: 3 },
      { status: "critical", remaining: 1, needed: 2 },
      { status: "critical", remaining: 0, needed: 1 },
    ]);
  });

  it("flags a pool that turns thin only after the opponent steals champions from it", () => {
    let s = initialState(pooledConfig(7, 5));
    s = run(s, ...Array.from({ length: 6 }, (_, i) => ({ t: "ban", champion: `b${i}` }) as BoardEvent));
    expect(deriveView(s.config, s.log).pools.A[0].status).toBe("ok");
    // Red (team B) takes two of A's top champions before A fills top; blue picked a different role first.
    s = run(s, { t: "pick", champion: "x1", role: "jungle" }, { t: "pick", champion: "A-top-0", role: "top" }, { t: "pick", champion: "A-top-1", role: "mid" });
    const v = deriveView(s.config, s.log);
    expect(v.pools.A[0].remaining).toHaveLength(5);
    expect(v.pools.A[0].needed).toBe(5);
    expect(v.pools.A[0].status).toBe("thin");
  });

  it("never warns about pools when Fearless is off, and reports unset for empty pools", () => {
    const c = pooledConfig(1, 5);
    c.fearless = false;
    const v = deriveView(c, []);
    expect(v.pools.A.every((p) => p.status === "ok")).toBe(true);
    const empty = deriveView(cfg(), []);
    expect(empty.pools.A.every((p) => p.status === "unset")).toBe(true);
  });

  it("needs nothing once the series is over", () => {
    let s = initialState(pooledConfig(3, 3));
    s = draftGame(s);
    s = run(s, { t: "result", winner: "A" });
    s = draftGame(s);
    s = run(s, { t: "result", winner: "A" });
    const v = deriveView(s.config, s.log);
    expect(v.phase).toBe("done");
    expect(v.pools.A.every((p) => p.needed === 0)).toBe(true);
  });
});

describe("persistence", () => {
  it("round-trips through JSON and rejects corrupted state", () => {
    let s = draftGame(initialState(cfg({ format: 5 })));
    s = run(s, { t: "result", winner: "B" });
    s = boardReducer(s, { type: "undo" }).state;
    const copy = JSON.parse(JSON.stringify(s));
    expect(validState(copy)).toBe(true);
    expect(deriveView(copy.config, copy.log)).toEqual(deriveView(s.config, s.log));
    expect(validState({ config: s.config, log: [{ t: "result", winner: "A" }], redo: [] })).toBe(false);
    expect(validState(null)).toBe(false);
    expect(validState({ config: s.config, log: "nope", redo: [] })).toBe(false);
  });
});
