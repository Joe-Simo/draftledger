import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TeamAggregate } from "@/lib/aggregate";
import { boardReducer, defaultConfig, deriveView, initialState, type BoardConfig, type BoardEvent, type BoardState } from "@/lib/board";
import { resolvePickRole, suggestRole, type ChampionInfo } from "@/lib/champions";
import { buildInsights, insightContext } from "@/lib/insights";
import { buildPrepSheet, toMarkdown } from "@/lib/prep";
import { applyScoutSetup } from "@/lib/suggest";
import type { Role } from "@/lib/types";

const pick = (champion: string, games: number, wins: number, roles: Partial<Record<Role, number>>) => ({
  champion, games, wins, blue: Math.ceil(games / 2), red: Math.floor(games / 2), avgOrder: 2, roles,
});

function team(id: string, name: string): TeamAggregate {
  const lock = (champion: string, count: number) => ({ champion, count });
  return {
    teamId: id, name, games: 100, wins: 50, series: 40, fearlessGames: 100,
    firstDate: "2025-01-01T00:00:00Z", lastDate: "2026-01-01T00:00:00Z", events: ["Cup"],
    sides: { blue: { games: 50, wins: 25 }, red: { games: 50, wins: 25 } },
    picks: [pick("Aaa", 30, 24, { mid: 30 }), pick("Bbb", 20, 10, { top: 20 }), pick("Ccc", 12, 6, { jungle: 12 }), pick("Eee", 10, 5, { bot: 10 })],
    bans: [{ champion: "Xxx", count: 25, phase1: 20, phase2: 5, avgOrder: 1.4, firstBan: 10 }],
    bansAgainst: [],
    fearless: {
      byGame: {
        "1": { games: 30, wins: 15, distinctPicks: 20, comfortShare: 0.5, topPicks: [lock("Aaa", 12)], topBans: [] },
        "2": { games: 30, wins: 15, distinctPicks: 25, comfortShare: 0.4, topPicks: [lock("Aaa", 10), lock("Eee", 6)], topBans: [] },
        "3+": { games: 30, wins: 15, distinctPicks: 30, comfortShare: 0.2, topPicks: [lock("Ccc", 6)], topBans: [] },
      },
      top5PickOverlapG1vsG3: 0,
      comfortShareDelta: -0.3,
    },
  };
}

function play(config: BoardConfig, ...events: BoardEvent[]): BoardState {
  let s = initialState(config);
  for (const event of events) {
    const r = boardReducer(s, { type: "event", event });
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return s;
}
const ROLE_LIST: Role[] = ["top", "jungle", "mid", "bot", "support"];
/** One full game: blue is A, red is B. Red picks Aaa (mid) and Bbb (top) among its five. */
function fullGame(tag: string): BoardEvent[] {
  const bans = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ t: "ban", champion: `${tag}${p}${i}` }) as BoardEvent);
  const red = ["Aaa", "Bbb", `${tag}r3`, `${tag}r4`, `${tag}r5`];
  const redRoles: Role[] = ["mid", "top", "jungle", "bot", "support"];
  const order = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  const used = { 0: 0, 1: 0 };
  const ev: BoardEvent[] = [...bans(6, "a")];
  const step = (t: number) => {
    const i = used[t as 0 | 1]++;
    return { t: "pick", champion: t === 1 ? (tag === "g1" ? red[i] : `${tag}r${i}`) : `${tag}p${i}`, role: t === 1 ? redRoles[i] : ROLE_LIST[i] } as BoardEvent;
  };
  for (const t of order.slice(0, 6)) ev.push(step(t));
  ev.push(...bans(4, "c"));
  for (const t of order.slice(6)) ev.push(step(t));
  return ev;
}

const cfg = (): BoardConfig => ({ ...defaultConfig(), scout: { opponent: "B", opponentId: "opp" } });

describe("insights follow the board context", () => {
  const opp = team("opp", "Opp");
  const game1Done = play(cfg(), ...fullGame("g1"), { t: "result", winner: "A" });

  it("is game 1 with nothing locked by default", () => {
    const r = buildInsights(opp);
    expect(r.gameNumber).toBe(1);
    expect(r.insights.find((i) => i.id === "ban-Aaa")).toBeTruthy();
    expect(r.insights.find((i) => i.id === "g1-signature")!.text).toContain("In game 1 expect Aaa");
    expect(r.lockedOut).toEqual([]);
  });

  it("builds the game 2 context after game 1 finishes", () => {
    const ctx = insightContext(game1Done.config, deriveView(game1Done.config, game1Done.log));
    expect(ctx.gameNumber).toBe(2);
    expect(ctx.unavailable).toEqual(expect.arrayContaining(["Aaa", "Bbb", "g1p0"]));
  });

  it("drops locked champions from ban advice and rewrites the signature for game 2", () => {
    const ctx = insightContext(game1Done.config, deriveView(game1Done.config, game1Done.log));
    const r = buildInsights(opp, ctx);
    const ids = r.insights.map((i) => i.id);
    expect(ids).not.toContain("ban-Aaa");
    expect(ids).not.toContain("ban-Bbb");
    expect(ids).toContain("ban-Ccc");
    expect(r.lockedOut).toEqual(expect.arrayContaining(["Aaa", "Bbb"]));
    const text = r.insights.map((i) => i.text).join("\n");
    expect(text).not.toContain("In game 1 expect");
    expect(text).not.toMatch(/banning (Aaa|Bbb)/);
    const sig = r.insights.find((i) => i.id === "signature-g2")!;
    expect(sig.text).toContain("In game 2 expect Eee");
    expect(sig.n).toBe(30);
  });

  it("also treats bans of the game in progress as unavailable", () => {
    const cont = boardReducer(game1Done, { type: "event", event: { t: "ban", champion: "Ccc" } }).state;
    const r = buildInsights(opp, insightContext(cont.config, deriveView(cont.config, cont.log)));
    expect(r.insights.map((i) => i.id)).not.toContain("ban-Ccc");
    expect(r.lockedOut).toContain("Ccc");
  });

  it("counts only unlocked champions in pool depth", () => {
    const withPool = buildInsights(opp, { unavailable: ["Aaa"] }).insights.find((i) => i.id === "pool-mid");
    expect(withPool?.text).toContain("1 already locked");
  });

  it("exports the game and the locked list in the prep sheet", () => {
    const sheet = buildPrepSheet(game1Done.config, game1Done.log, opp, "2026-11-18");
    const md = toMarkdown(sheet);
    expect(md).toContain("## How to win (for game 2)");
    expect(md).not.toContain("In game 1 expect");
    expect(md).not.toMatch(/banning (Aaa|Bbb)/);
    expect(md).toContain("Not advised because they are already locked or used:");
    expect(md).not.toContain("\u2014");
  });
});

describe("scouting setup names both teams", () => {
  const opp = team("opp", "Karmine Corp");
  const own = { ...team("c9", "Cloud9 Kia"), picks: [pick("Zed", 20, 10, { mid: 20 })] };

  it("names our side and fills its pool", () => {
    const c = applyScoutSetup({ ...cfg(), scout: { opponent: "B", opponentId: "opp", ownId: "c9" } }, [opp, own]);
    expect(c.teams.A.name).toBe("Cloud9 Kia");
    expect(c.teams.A.pool.mid).toContain("Zed");
    expect(c.teams.B.name).toBe("Karmine Corp");
    expect(c.teams.B.pool.mid).toContain("Aaa");
  });

  it("follows the scouted side", () => {
    const c = applyScoutSetup({ ...cfg(), scout: { opponent: "A", opponentId: "opp", ownId: "c9" } }, [opp, own]);
    expect(c.teams.A.name).toBe("Karmine Corp");
    expect(c.teams.B.name).toBe("Cloud9 Kia");
  });

  it("leaves our side alone with a league-wide choice", () => {
    const c = applyScoutSetup({ ...cfg(), scout: { opponent: "B", opponentId: "opp" } }, [opp, own]);
    expect(c.teams.A.name).toBe("Team A");
  });

  it("the prep sheet title names both teams", () => {
    const c = applyScoutSetup({ ...cfg(), scout: { opponent: "B", opponentId: "opp", ownId: "c9" } }, [opp, own]);
    const sheet = buildPrepSheet(c, [], opp, "2026-11-18");
    expect(sheet.title).toBe("Prep sheet: Cloud9 Kia vs Karmine Corp");
  });

  it("scout command can carry names and pools without clearing the log", () => {
    const s = play(cfg(), { t: "ban", champion: "Aaa" });
    const c = applyScoutSetup({ ...s.config, scout: { opponent: "B", opponentId: "opp", ownId: "c9" } }, [opp, own]);
    const r = boardReducer(s, { type: "scout", scout: c.scout, teams: c.teams });
    expect(r.state.log).toHaveLength(1);
    expect(r.state.config.teams.A.name).toBe("Cloud9 Kia");
  });
});

describe("role auto-assignment", () => {
  const info = (name: string, roles: Partial<Record<Role, number>>): ChampionInfo => ({ name, picks: 10, bans: 0, roles });

  it("uses the most common role among unfilled roles", () => {
    const sett = info("Sett", { mid: 3, top: 4, support: 1 });
    expect(suggestRole(sett, [])).toBe("top");
    expect(suggestRole(sett, ["top"])).toBe("mid");
    expect(suggestRole(sett, ["top", "mid"])).toBe("support");
  });

  it("falls back to a pool role, then the first open role, for champions with no data in open roles", () => {
    expect(suggestRole(undefined, ["top"], ["bot"])).toBe("bot");
    expect(suggestRole(undefined, ["top"])).toBe("jungle");
    expect(suggestRole(info("X", { top: 5 }), ["top"], ["support"])).toBe("support");
  });

  it("returns null when all roles are filled", () => {
    expect(suggestRole(info("X", { top: 5 }), ROLE_LIST)).toBeNull();
  });

  it("ignores a stale manual role that is already filled", () => {
    const azir = info("Azir", { mid: 402, top: 1 });
    expect(resolvePickRole("jungle", azir, ["jungle"])).toBe("mid");
    expect(resolvePickRole("jungle", azir, [])).toBe("jungle");
    expect(resolvePickRole("auto", azir, [])).toBe("mid");
  });

  it("matches the committed champions.json for the QA cases", () => {
    const file = JSON.parse(readFileSync("public/data/champions.json", "utf8")) as { champions: ChampionInfo[] };
    const by = new Map(file.champions.map((c) => [c.name, c]));
    expect(suggestRole(by.get("Azir"), [])).toBe("mid");
    expect(suggestRole(by.get("Sett"), [])).toBe("top");
    expect(suggestRole(by.get("Yasuo"), [])).toBe("top");
    expect(suggestRole(by.get("Rumble"), [])).toBe("top");
    expect(suggestRole(by.get("Yasuo"), ["top"])).toBe("mid");
  });
});
