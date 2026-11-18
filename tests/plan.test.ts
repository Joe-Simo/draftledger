import { describe, expect, it } from "vitest";
import { boardReducer, defaultConfig, deriveView, initialState, type BoardConfig, type BoardEvent, type BoardState } from "@/lib/board";
import { buildForecast } from "@/lib/forecast";
import { RIOT_BOILERPLATE, RIOT_JIBBER_JABBER } from "@/lib/legal";
import { emptyPlan, emptyPlans, firedBranches, normalizePlans, ourTeam, planSuggestion, validatePlan, type GamePlan } from "@/lib/plan";
import type { Role } from "@/lib/types";

const ROLE_LIST: Role[] = ["top", "jungle", "mid", "bot", "support"];

function play(config: BoardConfig, ...events: BoardEvent[]): BoardState {
  let s = initialState(config);
  for (const event of events) {
    const r = boardReducer(s, { type: "event", event });
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

/** One full game, blue = first team. `bluePicks` and `redPicks` are listed in role order. */
function fullGame(tag: string, bluePicks: string[], redPicks: string[]): BoardEvent[] {
  const bans = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ t: "ban", champion: `${tag}${p}${i}` }) as BoardEvent);
  const order = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  const used = [0, 0];
  const step = (t: number) => {
    const i = used[t]++;
    return { t: "pick", champion: (t === 0 ? bluePicks : redPicks)[i], role: ROLE_LIST[i] } as BoardEvent;
  };
  return [...bans(6, "a"), ...order.slice(0, 6).map(step), ...bans(4, "c"), ...order.slice(6).map(step)];
}

const cfg = (over: Partial<BoardConfig> = {}): BoardConfig => ({ ...defaultConfig(), format: 3, fearless: true, scout: { opponent: "B", opponentId: "x" }, ...over });
const plan = (over: Partial<GamePlan>): GamePlan => ({ ...emptyPlan(), ...over });
const known = new Set(["Azir", "Rumble", "Vi", "Orianna", "KSante", "Renekton", "Kaisa", "Varus", "Rell", "Zed", "Ahri"]);

describe("ourTeam", () => {
  it("is the side that is not scouted", () => {
    expect(ourTeam(cfg())).toBe("A");
    expect(ourTeam(cfg({ scout: { opponent: "A", opponentId: "x" } }))).toBe("B");
    expect(ourTeam(cfg({ scout: undefined }))).toBe("A");
  });
});

describe("normalizePlans", () => {
  it("returns five empty plans for junk", () => {
    expect(normalizePlans(null)).toEqual(emptyPlans());
    expect(normalizePlans("x")).toHaveLength(5);
  });
  it("keeps valid parts and drops malformed ones", () => {
    const out = normalizePlans([
      { bans: ["Azir", 3], picks: ["Vi"], notes: "n", branches: [{ id: "b", when: { action: "ban", champion: "Vi" }, then: { action: "pick", champions: ["Zed"] } }, { id: 1 }] },
    ]);
    expect(out[0].bans).toEqual([]);
    expect(out[0].picks).toEqual(["Vi"]);
    expect(out[0].notes).toBe("n");
    expect(out[0].branches).toHaveLength(1);
    expect(out[1]).toEqual(emptyPlan());
  });
});

describe("validatePlan", () => {
  const locked = new Set(["Azir"]);
  it("flags unknown champions, skipping the check while the list is not loaded", () => {
    const p = plan({ picks: ["Nope"] });
    expect(validatePlan(p, known, new Set()).map((i) => i.code)).toEqual(["UNKNOWN_CHAMPION"]);
    expect(validatePlan(p, null, new Set())).toEqual([]);
  });
  it("errors on a locked pick and warns on a wasted locked ban", () => {
    const issues = validatePlan(plan({ picks: ["Azir"], bans: ["Azir"] }), known, locked);
    expect(issues.find((i) => i.code === "LOCKED_PICK")?.level).toBe("error");
    expect(issues.find((i) => i.code === "LOCKED_BAN_WASTE")?.level).toBe("warning");
    expect(issues.find((i) => i.code === "BAN_AND_PICK")).toBeTruthy();
  });
  it("warns on duplicates and dead branches", () => {
    const p = plan({
      bans: ["Vi", "Vi"],
      branches: [
        { id: "b1", when: { action: "ban", champion: "Vi" }, then: { action: "pick", champions: ["Azir"] } },
        { id: "b2", when: { action: "pick", champion: "Azir" }, then: { action: "ban", champions: ["Rumble"] } },
      ],
    });
    const codes = validatePlan(p, known, locked).map((i) => i.code);
    expect(codes).toContain("DUPLICATE");
    expect(codes.filter((c) => c === "EMPTY_BRANCH")).toHaveLength(2);
    expect(codes).toContain("LOCKED_PICK");
  });
  it("is clean for a sound plan", () => {
    expect(validatePlan(plan({ bans: ["Rumble"], picks: ["Orianna", "Vi"] }), known, locked)).toEqual([]);
  });
});

describe("planSuggestion and branches", () => {
  const p = plan({
    bans: ["Azir", "Rumble", "Vi"],
    picks: ["KSante", "Orianna"],
    branches: [
      { id: "b1", when: { action: "ban", champion: "KSante" }, then: { action: "pick", champions: ["Renekton", "Zed"] } },
      { id: "b2", when: { action: "pick", champion: "Kaisa" }, then: { action: "ban", champions: ["Rell"] } },
    ],
  });
  const view = (...ev: BoardEvent[]) => {
    const s = play(cfg(), ...ev);
    return { config: s.config, view: deriveView(s.config, s.log) };
  };

  it("is silent when it is not our turn", () => {
    const s = play(cfg(), { t: "ban", champion: "q" });
    expect(planSuggestion(s.config, deriveView(s.config, s.log), p)).toBeNull();
  });
  it("suggests the first ban priority and lists alternatives", () => {
    const { config, view: v } = view();
    const s = planSuggestion(config, v, p)!;
    expect(s).toMatchObject({ champion: "Azir", source: "priority", alternatives: ["Rumble", "Vi"] });
  });
  it("skips champions that are already gone", () => {
    const { config, view: v } = view({ t: "ban", champion: "Azir" }, { t: "ban", champion: "Rumble" });
    expect(planSuggestion(config, v, p)?.champion).toBe("Vi");
  });
  it("says so when nothing legal is left", () => {
    const { config, view: v } = view({ t: "ban", champion: "Azir" }, { t: "ban", champion: "Rumble" }, { t: "ban", champion: "Vi" }, { t: "ban", champion: "q" });
    expect(planSuggestion(config, v, p)?.source).toBe("none");
  });
  it("fires an if-they-ban branch on the pick step", () => {
    const events: BoardEvent[] = [
      { t: "ban", champion: "a1" }, { t: "ban", champion: "KSante" }, { t: "ban", champion: "a3" },
      { t: "ban", champion: "a4" }, { t: "ban", champion: "a5" }, { t: "ban", champion: "a6" },
    ];
    const { config, view: v } = view(...events);
    // Blue picks first; blue is team A (ours).
    expect(firedBranches(v.current!.actions, p, "A").map((b) => b.id)).toEqual(["b1"]);
    expect(planSuggestion(config, v, p)).toMatchObject({ champion: "Renekton", source: "branch", reason: "They banned KSante" });
  });
  it("ignores our own actions as triggers", () => {
    const { view: v } = view({ t: "ban", champion: "KSante" });
    expect(firedBranches(v.current!.actions, p, "A")).toEqual([]);
  });
});

describe("series forecast", () => {
  const blue = ["Aa1", "Aa2", "Aa3", "Aa4", "Aa5"];
  const red = ["Bb1", "Bb2", "Bb3", "Bb4", "Bb5"];

  it("flags a champion that an earlier planned game uses up", () => {
    const s = play(cfg());
    const plans = emptyPlans();
    plans[0] = plan({ picks: ["Orianna", "Vi"] });
    plans[1] = plan({ picks: ["Zed", "Orianna"] });
    const f = buildForecast(s.config, deriveView(s.config, s.log), plans, known);
    expect(f.conflicts).toEqual([{ champion: "Orianna", firstGame: 1, laterGame: 2 }]);
    expect(f.games[1].lockedProjected).toEqual(expect.arrayContaining(["Orianna", "Vi"]));
    expect(f.games[1].status).toBe("errors");
    expect(f.games[0].status).toBe("ready");
    expect(f.games[2].status).toBe("empty");
    expect(f.totals.errors).toBe(1);
  });

  it("only the top five priorities are projected as played", () => {
    const s = play(cfg());
    const plans = emptyPlans();
    plans[0] = plan({ picks: ["Orianna", "Vi", "Zed", "Ahri", "Kaisa", "Varus"] });
    plans[1] = plan({ picks: ["Varus"] });
    const f = buildForecast(s.config, deriveView(s.config, s.log), plans, known);
    expect(f.games[0].projected).toHaveLength(5);
    expect(f.games[1].issues).toEqual([]);
    // Varus is the sixth priority of game 1, so it is not expected to be played there and stays free.
    expect(f.conflicts).toEqual([]);
  });

  it("uses real picks of drafted games, including the opponent's, as locks", () => {
    const s = play(cfg(), ...fullGame("g1", blue, red), { t: "result", winner: "A" });
    const plans = emptyPlans();
    plans[0] = plan({ picks: ["Orianna"] });
    plans[1] = plan({ picks: ["Bb2", "Zed"], bans: ["Bb1"] });
    const f = buildForecast(s.config, deriveView(s.config, s.log), plans, null);
    expect(f.games[0].played).toBe(true);
    expect(f.games[0].projected).toEqual(blue);
    expect(f.games[1].lockedActual).toEqual(expect.arrayContaining([...blue, ...red]));
    expect(f.games[1].lockedProjected).toEqual([]);
    const codes = f.games[1].issues.map((i) => i.code);
    expect(codes).toContain("LOCKED_PICK");
    expect(codes).toContain("LOCKED_BAN_WASTE");
  });

  it("projects only our own unplayed plans, never the real picks twice", () => {
    const s = play(cfg(), ...fullGame("g1", blue, red), { t: "result", winner: "A" });
    const plans = emptyPlans();
    plans[2] = plan({ picks: ["Aa1"] });
    const f = buildForecast(s.config, deriveView(s.config, s.log), plans, null);
    expect(f.conflicts).toEqual([{ champion: "Aa1", firstGame: 1, laterGame: 3 }]);
  });

  it("has no locks or conflicts without Fearless", () => {
    const s = play(cfg({ fearless: false }));
    const plans = emptyPlans();
    plans[0] = plan({ picks: ["Orianna"] });
    plans[1] = plan({ picks: ["Orianna"] });
    const f = buildForecast(s.config, deriveView(s.config, s.log), plans, known);
    expect(f.conflicts).toEqual([]);
    expect(f.games[1].issues).toEqual([]);
  });

  it("only covers the games the format can reach", () => {
    const s = play(cfg({ format: 1 }));
    expect(buildForecast(s.config, deriveView(s.config, s.log), emptyPlans(), null).games).toHaveLength(1);
  });
});

describe("Riot notices", () => {
  it("use the wording from Riot's policy pages with our product name", () => {
    expect(RIOT_BOILERPLATE.startsWith("DraftLedger isn't endorsed by Riot Games and doesn't reflect the views or opinions")).toBe(true);
    expect(RIOT_BOILERPLATE.endsWith("trademarks or registered trademarks of Riot Games, Inc.")).toBe(true);
    expect(RIOT_JIBBER_JABBER).toBe(`DraftLedger was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.`);
    expect(RIOT_BOILERPLATE + RIOT_JIBBER_JABBER).not.toContain("\u2014");
  });
});
