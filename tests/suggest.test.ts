import { describe, expect, it } from "vitest";
import type { TeamAggregate } from "@/lib/aggregate";
import { boardReducer, defaultConfig, deriveView, initialState, type BoardConfig, type BoardEvent, type BoardState } from "@/lib/board";
import { buildInsights, confidence, wilson } from "@/lib/insights";
import { buildPrepSheet, toCsv, toMarkdown } from "@/lib/prep";
import { nextGameOutlook, suggestForStep, type Context } from "@/lib/suggest";
import type { Role } from "@/lib/types";

const pick = (champion: string, games: number, wins: number, roles: Partial<Record<Role, number>>, avgOrder = 2) => ({
  champion, games, wins, blue: Math.ceil(games / 2), red: Math.floor(games / 2), avgOrder, roles,
});

function team(over: Partial<TeamAggregate> = {}): TeamAggregate {
  return {
    teamId: "opp", name: "Opp", games: 100, wins: 50, series: 40, fearlessGames: 100,
    firstDate: "2025-01-01T00:00:00Z", lastDate: "2026-01-01T00:00:00Z", events: ["Cup"],
    sides: { blue: { games: 50, wins: 25 }, red: { games: 50, wins: 25 } },
    picks: [
      pick("Aaa", 30, 24, { mid: 30 }),
      pick("Bbb", 20, 10, { top: 20 }),
      pick("Ccc", 12, 6, { jungle: 12 }),
      pick("Ddd", 4, 4, { bot: 4 }),
    ],
    bans: [
      { champion: "Xxx", count: 25, phase1: 20, phase2: 5, avgOrder: 1.4, firstBan: 10 },
      { champion: "Yyy", count: 3, phase1: 3, phase2: 0, avgOrder: 2, firstBan: 0 },
    ],
    bansAgainst: [{ champion: "Zzz", count: 22 }],
    fearless: null,
    ...over,
  };
}

const fearless = (g1Comfort: number, g3Comfort: number, g1n = 30, g3n = 30) => ({
  byGame: {
    "1": { games: g1n, wins: 15, distinctPicks: 20, comfortShare: g1Comfort, topPicks: [{ champion: "Aaa", count: 12 }], topBans: [] },
    "2": { games: 30, wins: 15, distinctPicks: 25, comfortShare: 0.3, topPicks: [], topBans: [] },
    "3+": { games: g3n, wins: 15, distinctPicks: 30, comfortShare: g3Comfort, topPicks: [], topBans: [] },
  },
  top5PickOverlapG1vsG3: 0,
  comfortShareDelta: g3Comfort - g1Comfort,
});

function play(config: BoardConfig, ...events: BoardEvent[]): BoardState {
  let s = initialState(config);
  for (const event of events) {
    const r = boardReducer(s, { type: "event", event });
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return s;
}
const bans = (n: number, prefix = "b") => Array.from({ length: n }, (_, i) => ({ t: "ban", champion: `${prefix}${i}` }) as BoardEvent);

/** We are team A (blue), the scouted opponent is team B (red). */
const cfg = (): BoardConfig => ({ ...defaultConfig(), scout: { opponent: "B", opponentId: "opp" } });
const ctx = (s: BoardState, opp = team(), extra: Partial<Context> = {}): Context => ({
  config: s.config, view: deriveView(s.config, s.log), scout: s.config.scout!, opponent: opp, ...extra,
});

describe("confidence and wilson", () => {
  it("labels sample sizes", () => {
    expect(confidence(0)).toBe("insufficient");
    expect(confidence(4)).toBe("insufficient");
    expect(confidence(5)).toBe("low");
    expect(confidence(11)).toBe("low");
    expect(confidence(12)).toBe("medium");
    expect(confidence(29)).toBe("medium");
    expect(confidence(30)).toBe("high");
  });

  it("computes the Wilson interval", () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
    const [lo, hi] = wilson(8, 10);
    expect(lo).toBeCloseTo(0.49, 2);
    expect(hi).toBeCloseTo(0.943, 2);
    const [lo2] = wilson(80, 100);
    expect(lo2).toBeGreaterThan(0.7);
  });
});

describe("buildInsights", () => {
  it("makes ban-target insights only with enough games and a real pick rate, with n shown", () => {
    const { insights } = buildInsights(team());
    const ids = insights.map((i) => i.id);
    expect(ids).toContain("ban-Aaa");
    expect(ids).toContain("ban-Bbb");
    expect(ids).toContain("ban-Ccc"); // 12 percent is the cutoff
    expect(ids).not.toContain("ban-Ddd"); // 4 games, below minimum
    const aaa = insights.find((i) => i.id === "ban-Aaa")!;
    expect(aaa.text).toContain("30%");
    expect(aaa.evidence).toContain("30 of 100");
    expect(aaa.n).toBe(100);
    expect(aaa.confidence).toBe("high");
  });

  it("only calls a champion high value when the Wilson lower bound beats their baseline, never on tiny n", () => {
    const t = team({ picks: [pick("Hot", 20, 18, { mid: 20 }), pick("Lucky", 6, 6, { top: 6 }), pick("Okay", 20, 11, { bot: 20 })] });
    const r = buildInsights(t);
    const ids = r.insights.map((i) => i.id);
    expect(ids).toContain("form-Hot");
    expect(ids).not.toContain("form-Lucky");
    expect(ids).not.toContain("form-Okay");
    expect(r.suppressed).toBeGreaterThan(0);
    expect(r.insights.find((i) => i.id === "form-Hot")!.evidence).toContain("n=20");
  });

  it("claims a side effect only when the intervals do not overlap", () => {
    const strong = buildInsights(team({ sides: { blue: { games: 50, wins: 42 }, red: { games: 50, wins: 20 } } }));
    expect(strong.insights.map((i) => i.id)).toContain("side");
    expect(strong.insights.find((i) => i.id === "side")!.text).toContain("blue side");
    const weak = buildInsights(team({ sides: { blue: { games: 50, wins: 28 }, red: { games: 50, wins: 24 } } }));
    expect(weak.insights.map((i) => i.id)).not.toContain("side");
    const tiny = buildInsights(team({ sides: { blue: { games: 6, wins: 6 }, red: { games: 6, wins: 0 } } }));
    expect(tiny.insights.map((i) => i.id)).not.toContain("side");
  });

  it("reports comfort-pool erosion only with 15+ games in both buckets and a 5 point drop", () => {
    expect(buildInsights(team({ fearless: fearless(0.4, 0.25) })).insights.map((i) => i.id)).toContain("comfort-erosion");
    expect(buildInsights(team({ fearless: fearless(0.4, 0.38) })).insights.map((i) => i.id)).not.toContain("comfort-erosion");
    expect(buildInsights(team({ fearless: fearless(0.4, 0.2, 30, 10) })).insights.map((i) => i.id)).not.toContain("comfort-erosion");
  });

  it("reports the game 1 signature champion", () => {
    const i = buildInsights(team({ fearless: fearless(0.4, 0.3) })).insights.find((x) => x.id === "g1-signature")!;
    expect(i.text).toContain("Aaa");
    expect(i.n).toBe(30);
  });

  it("flags shallow role pools and sorts higher confidence first", () => {
    const t = team({ picks: [pick("Aaa", 30, 15, { mid: 30 }), pick("Bbb", 25, 12, { mid: 25 })] });
    const r = buildInsights(t);
    expect(r.insights.some((i) => i.id === "pool-mid")).toBe(true);
    const ranks = r.insights.map((i) => ["insufficient", "low", "medium", "high"].indexOf(i.confidence));
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });

  it("returns nothing for a tiny team", () => {
    const r = buildInsights(team({ games: 3, wins: 2, picks: [pick("Aaa", 3, 3, { mid: 3 })], sides: { blue: { games: 2, wins: 2 }, red: { games: 1, wins: 0 } } }));
    expect(r.insights).toEqual([]);
  });
});

describe("suggestForStep", () => {
  it("suggests bans against the opponent's most picked champions, with n, hiding tiny samples", () => {
    const s = play(cfg());
    const r = suggestForStep(ctx(s))!;
    expect(r.mode).toBe("ban-ours");
    expect(r.items.map((i) => i.champion)).toEqual(["Aaa", "Bbb", "Ccc"]);
    expect(r.items[0]).toMatchObject({ n: 30, total: 100, confidence: "high", role: "mid" });
    expect(r.hiddenLowSample).toBe(1); // Ddd has 4 games
    expect(r.items[0].reason).toContain("30 of 100");
  });

  it("drops champions that are banned this game", () => {
    const s = play(cfg(), { t: "ban", champion: "Aaa" }, { t: "ban", champion: "q" });
    const r = suggestForStep(ctx(s))!;
    expect(r.items.map((i) => i.champion)).not.toContain("Aaa");
  });

  it("shows expected opponent bans on their ban step", () => {
    const s = play(cfg(), { t: "ban", champion: "q1" });
    const r = suggestForStep(ctx(s))!;
    expect(r.mode).toBe("ban-theirs");
    expect(r.items.map((i) => i.champion)).toEqual(["Xxx"]);
    expect(r.hiddenLowSample).toBe(1); // Yyy has 3 bans
  });

  it("expects opponent picks only for roles they have not filled and unlocked champions", () => {
    // Blue (us) bans 3, red bans 3, blue picks, then it is red's pick.
    const s = play(cfg(), ...bans(6), { t: "pick", champion: "mine", role: "top" });
    let r = suggestForStep(ctx(s))!;
    expect(r.mode).toBe("pick-theirs");
    expect(r.items.map((i) => [i.champion, i.role])).toEqual([["Aaa", "mid"], ["Bbb", "top"], ["Ccc", "jungle"]]);
    // After they take Aaa as mid, the mid slot is filled.
    const s2 = play(cfg(), ...bans(6), { t: "pick", champion: "mine", role: "top" }, { t: "pick", champion: "Aaa", role: "mid" });
    r = suggestForStep(ctx(s2))!; // red pick #2 (still red's turn)
    expect(r.mode).toBe("pick-theirs");
    expect(r.items.map((i) => i.champion)).not.toContain("Aaa");
  });

  it("suggests our picks from our own aggregate by open role, or league-wide as a fallback", () => {
    const base = play(cfg(), ...bans(6), { t: "pick", champion: "o1", role: "top" }, { t: "pick", champion: "o2", role: "top" }, { t: "pick", champion: "o3", role: "mid" });
    // Now blue picks twice (steps 10 and 11).
    const own = team({ teamId: "own", name: "Us", picks: [pick("Mid1", 20, 15, { mid: 20 }), pick("Sup1", 18, 9, { support: 18 }), pick("Top1", 15, 9, { top: 15 })] });
    const r = suggestForStep(ctx(base, team(), { own }))!;
    expect(r.mode).toBe("pick-ours");
    expect(r.items.map((i) => i.champion)).toContain("Mid1");
    expect(r.items[0].reason).toContain("Us played it");
    const league = suggestForStep(ctx(base, team(), { champions: [{ name: "Lg1", picks: 50, bans: 1, roles: { support: 50 } }] }))!;
    expect(league.items.map((i) => i.champion)).toEqual(["Lg1"]);
  });

  it("returns null when the draft is complete", () => {
    const events: BoardEvent[] = [];
    // Draft a whole game quickly: names are unique.
    const picks = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]; // team index per pick step
    const counts = [0, 0];
    let b = 0;
    events.push(...bans(6, "a"));
    for (const t of picks.slice(0, 6)) events.push({ t: "pick", champion: `p${b++}`, role: (["top", "jungle", "mid", "bot", "support"] as Role[])[counts[t]++] });
    events.push(...bans(4, "c"));
    for (const t of picks.slice(6)) events.push({ t: "pick", champion: `p${b++}`, role: (["top", "jungle", "mid", "bot", "support"] as Role[])[counts[t]++] });
    expect(suggestForStep(ctx(play(cfg(), ...events)))).toBeNull();
  });
});

describe("nextGameOutlook under Fearless locks", () => {
  const completeGame = (): BoardEvent[] => {
    const roles: Role[] = ["top", "jungle", "mid", "bot", "support"];
    const order = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
    const c = [0, 0];
    let k = 0;
    const ev: BoardEvent[] = [...bans(6, "a")];
    // Blue (A, us) and red (B, opponent). Red picks Aaa as mid and Bbb as top.
    const redPicks = ["Aaa", "Bbb", "r3", "r4", "r5"];
    let ri = 0;
    for (const t of order.slice(0, 6)) ev.push({ t: "pick", champion: t === 1 ? redPicks[ri++] : `p${k++}`, role: t === 1 ? (["mid", "top", "jungle", "bot", "support"] as Role[])[ri - 1] : roles[c[0]++] });
    ev.push(...bans(4, "c"));
    for (const t of order.slice(6)) ev.push({ t: "pick", champion: t === 1 ? redPicks[ri++] : `p${k++}`, role: t === 1 ? (["mid", "top", "jungle", "bot", "support"] as Role[])[ri - 1] : roles[c[0]++] });
    return ev;
  };

  it("lists burned champions and removes them from likely picks after game 1", () => {
    const s = play(cfg(), ...completeGame(), { t: "result", winner: "A" });
    const o = nextGameOutlook(ctx(s))!;
    expect(o.gameNumber).toBe(2);
    expect(o.burned.map((b) => b.champion).sort()).toEqual(["Aaa", "Bbb"]);
    expect(o.burnedShare).toBeCloseTo((30 + 20) / (30 + 20 + 12 + 4), 3);
    const mid = o.byRole.find((r) => r.role === "mid")!;
    expect(mid.likely).toEqual([]);
    const jungle = o.byRole.find((r) => r.role === "jungle")!;
    expect(jungle.likely.map((l) => l.champion)).toEqual(["Ccc"]);
    expect(o.comfortNote).toBeNull();
  });

  /** A full game with fresh champion names, so later games are not blocked by the Fearless lock. */
  const freshGame = (tag: string): BoardEvent[] => {
    const roles: Role[] = ["top", "jungle", "mid", "bot", "support"];
    const order = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
    const c = [0, 0];
    let k = 0;
    const pickEv = (t: number): BoardEvent => ({ t: "pick", champion: `${tag}${k++}`, role: roles[c[t]++] });
    return [...bans(6, `${tag}a`), ...order.slice(0, 6).map(pickEv), ...bans(4, `${tag}c`), ...order.slice(6).map(pickEv)];
  };

  it("adds the comfort-share note only from game 3 and with enough data", () => {
    const opp = team({ fearless: fearless(0.4, 0.2) });
    // After game 1 the upcoming game is 2: no note yet.
    let s = play(cfg(), ...freshGame("x"), { t: "result", winner: "A" });
    expect(nextGameOutlook(ctx(s, opp))!.gameNumber).toBe(2);
    expect(nextGameOutlook(ctx(s, opp))!.comfortNote).toBeNull();
    // After game 2 (1-1) the upcoming game is 3: note appears with n for both buckets.
    s = play(cfg(), ...freshGame("x"), { t: "result", winner: "A" }, ...freshGame("y"), { t: "result", winner: "B" });
    const o = nextGameOutlook(ctx(s, opp))!;
    expect(o.gameNumber).toBe(3);
    expect(o.comfortNote).toContain("20%");
    expect(o.comfortNote).toContain("40%");
    expect(o.comfortNote).toContain("n=30 and 30");
    // Too little data in game 3+ bucket: no note.
    expect(nextGameOutlook(ctx(s, team({ fearless: fearless(0.4, 0.2, 30, 10) })))!.comfortNote).toBeNull();
    // Fearless off: no note.
    const off = { ...cfg(), fearless: false };
    const s2 = play(off, ...freshGame("x"), { t: "result", winner: "A" }, ...freshGame("y"), { t: "result", winner: "B" });
    expect(nextGameOutlook(ctx(s2, opp))!.comfortNote).toBeNull();
  });

  it("is null once the series is over and respects non-Fearless boards", () => {
    const c = cfg();
    c.format = 1;
    const s = play(c, ...completeGame(), { t: "result", winner: "A" });
    expect(nextGameOutlook(ctx(s))).toBeNull();
  });
});

describe("prep sheet export", () => {
  const s = play(cfg(), { t: "ban", champion: "Aaa" }, { t: "ban", champion: "q" });
  const sheet = buildPrepSheet(s.config, s.log, team({ name: 'Opp, "Inc"', fearless: fearless(0.4, 0.25) }), "2026-11-18");

  it("renders Markdown with sample sizes, evidence and no em dash", () => {
    const md = toMarkdown(sheet);
    expect(md).toContain("# Prep sheet:");
    expect(md).toContain("## How to win");
    expect(md).toContain("n=100");
    expect(md).toContain("| Aaa | mid | 30 | 100 |");
    expect(md).toContain("Board so far");
    expect(md).toContain("Bans: Team A: Aaa; Team B: q");
    expect(md).not.toContain("\u2014");
  });

  it("renders CSV with a header, quoting and one fact per row", () => {
    const csv = toCsv(sheet);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("section,item,role,n,of,rate,wins,note");
    expect(lines).toContain("pick,Aaa,mid,30,100,0.3,24,avg pick #2");
    expect(csv).toContain('"');
    expect(csv).not.toContain("\u2014");
    expect(lines.some((l) => l.startsWith("board_ban,Team A: Aaa"))).toBe(true);
    expect(lines.some((l) => l.startsWith("insight,"))).toBe(true);
  });

  it("states when nothing has enough data behind it", () => {
    const tiny = buildPrepSheet(s.config, s.log, team({ games: 3, wins: 1, picks: [], bans: [], bansAgainst: [], sides: { blue: { games: 2, wins: 1 }, red: { games: 1, wins: 0 } } }), "2026-11-18");
    expect(toMarkdown(tiny)).toContain("No claim has enough data behind it.");
  });
});

describe("insight ordering", () => {
  it("orders same-confidence insights by strength, not alphabetically", () => {
    const t = team({ picks: [pick("Zzz", 40, 20, { mid: 40 }), pick("Aaa", 15, 7, { top: 15 })] });
    const ids = buildInsights(t).insights.filter((i) => i.kind === "ban-target").map((i) => i.id);
    expect(ids).toEqual(["ban-Zzz", "ban-Aaa"]);
  });
});
