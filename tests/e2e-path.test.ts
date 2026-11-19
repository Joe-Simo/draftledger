import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TeamAggregate } from "@/lib/aggregate";
import {
  boardReducer,
  defaultConfig,
  deriveView,
  initialState,
  unavailableReason,
  validState,
  type BoardEvent,
  type BoardState,
} from "@/lib/board";
import { poolsFromTeam, resolvePickRole, type ChampionInfo } from "@/lib/champions";
import { buildPrepSheet, toCsv, toMarkdown } from "@/lib/prep";
import { applyScoutSetup, suggestForStep, type Context } from "@/lib/suggest";
import type { Role } from "@/lib/types";

/**
 * End-to-end path of docs/demo-script.md through the real modules, from data load to export:
 * load the committed aggregates over HTTP (the same URLs the /board page fetches), set up a Fearless
 * Bo3, draft game 1 by following the suggestions, record the result, check the Fearless lock in game 2,
 * and export the prep sheet. No mocks and no raw GRID data: only public/data aggregates.
 */

const DATA_DIR = path.join(process.cwd(), "public", "data");
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const name = path.basename((req.url ?? "").split("?")[0]);
    readFile(path.join(DATA_DIR, name)).then(
      (buf) => { res.writeHead(200, { "content-type": "application/json" }); res.end(buf); },
      () => { res.writeHead(404); res.end(); },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const getJson = async <T>(file: string): Promise<T> => {
  const r = await fetch(`${base}/data/${file}`);
  expect(r.status).toBe(200);
  return (await r.json()) as T;
};

const KARMINE = "53165";
const CLOUD9 = "47351";

describe("end-to-end: data load, board, draft, recommendations, export", () => {
  let teams: TeamAggregate[];
  let champions: ChampionInfo[];
  let state: BoardState;

  it("loads the committed aggregates", async () => {
    teams = (await getJson<{ teams: TeamAggregate[] }>("teams.json")).teams;
    champions = (await getJson<{ champions: ChampionInfo[] }>("champions.json")).champions;
    const meta = await getJson<{ games: number; teams: number }>("meta.json");
    expect(teams).toHaveLength(meta.teams);
    expect(champions.length).toBeGreaterThan(100);
    expect(teams.find((t) => t.teamId === KARMINE)?.name).toBe("Karmine Corp");
    expect(teams.find((t) => t.teamId === CLOUD9)?.name).toBe("Cloud9 Kia");
  });

  it("sets up a Fearless Bo3 scouting Karmine Corp as Cloud9 Kia", () => {
    const config = applyScoutSetup(
      { ...defaultConfig(), scout: { opponent: "B", opponentId: KARMINE, ownId: CLOUD9 } },
      teams,
    );
    expect(config.teams.B.name).toBe("Karmine Corp");
    expect(config.teams.A.name).toBe("Cloud9 Kia");
    expect(config.teams.B.pool.mid.length).toBeGreaterThan(0);
    state = initialState(config);
    expect(validState(state)).toBe(true);
  });

  const ctxFor = (s: BoardState): Context => {
    const scout = s.config.scout!;
    return {
      config: s.config,
      view: deriveView(s.config, s.log),
      scout,
      opponent: teams.find((t) => t.teamId === scout.opponentId)!,
      own: teams.find((t) => t.teamId === scout.ownId),
      champions,
    };
  };

  /** Plays one full draft by taking the top recommendation (or the first free champion) at every step. */
  function draftGame(s: BoardState): { state: BoardState; recommended: number; explained: number } {
    let recommended = 0;
    let explained = 0;
    for (let guard = 0; guard < 25; guard++) {
      const ctx = ctxFor(s);
      const next = ctx.view.next;
      if (!next || ctx.view.phase !== "draft") break;
      const rec = suggestForStep(ctx);
      const top = rec?.items[0];
      if (top) {
        recommended++;
        if (top.reason.length > 20 && top.n >= 5 && top.confidence !== "insufficient") explained++;
      }
      const champion =
        top?.champion ??
        champions.find((c) => unavailableReason(s.config, ctx.view, c.name) === null)!.name;
      let event: BoardEvent;
      if (next.kind === "ban") {
        event = { t: "ban", champion };
      } else {
        const filled = (ctx.view.current?.actions ?? [])
          .filter((a) => a.team === next.team && a.role)
          .map((a) => a.role as Role);
        const info = champions.find((c) => c.name === champion);
        const poolRoles = (Object.entries(ctx.config.teams[next.team].pool) as [Role, string[]][])
          .filter(([, list]) => list.includes(champion))
          .map(([r]) => r);
        const role = (top?.role as Role | undefined) && !filled.includes(top!.role!)
          ? top!.role!
          : resolvePickRole("auto", info, filled, poolRoles)!;
        event = { t: "pick", champion, role };
      }
      const r = boardReducer(s, { type: "event", event });
      expect(r.error, `step ${guard + 1}`).toBeUndefined();
      s = r.state;
    }
    return { state: s, recommended, explained };
  }

  it("drafts game 1 from the recommendations, with an explanation at each recommendation", () => {
    // Before the first ban there is already a recommendation with its reason and sample size.
    const first = suggestForStep(ctxFor(state))!;
    expect(first.mode).toBe("ban-ours");
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.items[0].reason).toContain("Karmine Corp picked it in");
    expect(first.note).toContain("locked by Fearless");

    const out = draftGame(state);
    state = out.state;
    const view = deriveView(state.config, state.log);
    expect(view.phase).toBe("result");
    expect(view.current?.actions).toHaveLength(20);
    expect(out.recommended).toBeGreaterThanOrEqual(10);
    expect(out.explained).toBe(out.recommended);
    const picks = view.current!.actions.filter((a) => a.step.kind === "pick").map((a) => a.champion);
    expect(new Set(picks).size).toBe(10);
  });

  it("records the winner and locks game 1 picks in game 2 (Fearless)", () => {
    state = boardReducer(state, { type: "event", event: { t: "result", winner: "A" } }).state;
    const view = deriveView(state.config, state.log);
    expect(view.phase).toBe("draft");
    expect(view.current?.number).toBe(2);
    expect(view.score).toEqual({ A: 1, B: 0 });
    expect(view.used).toHaveLength(10);

    const locked = view.used[0];
    expect(unavailableReason(state.config, view, locked)).not.toBeNull();
    const rec = suggestForStep(ctxFor(state))!;
    expect(rec.items.map((i) => i.champion)).not.toContain(locked);
    for (const c of view.used) expect(rec.items.map((i) => i.champion)).not.toContain(c);
    // The reducer rejects a locked champion as well, so a stale click cannot break the series.
    const bad = boardReducer(state, { type: "event", event: { t: "ban", champion: locked } });
    expect(bad.error).toContain("Fearless lock");
  });

  it("saves and restores the board the way the page does (JSON round trip)", () => {
    const restored = JSON.parse(JSON.stringify(state)) as unknown;
    expect(validState(restored)).toBe(true);
    const a = deriveView(state.config, state.log);
    const b = deriveView((restored as BoardState).config, (restored as BoardState).log);
    expect(b.used).toEqual(a.used);
    expect(b.score).toEqual(a.score);
  });

  it("exports the prep sheet as Markdown and CSV with the series result and recommendations", () => {
    const opponent = teams.find((t) => t.teamId === KARMINE)!;
    const sheet = buildPrepSheet(state.config, state.log, opponent, "2026-11-19");
    const md = toMarkdown(sheet);
    const csv = toCsv(sheet);
    expect(md).toContain("# Prep sheet: Cloud9 Kia vs Karmine Corp");
    expect(md).toContain("## How to win (for game 2)");
    expect(md).toContain("Not advised because they are already locked or used:");
    expect(md).toContain("Cloud9 Kia");
    expect(md).not.toContain("\u2014");
    expect(csv.split("\n").length).toBeGreaterThan(5);
    expect(sheet.drafts[0].picks).toHaveLength(10);
    expect(sheet.drafts[0].winner).toBe("Cloud9 Kia");
  });

  it("uses only the committed aggregates (no raw record fields)", () => {
    const sample = JSON.stringify(teams[0]);
    expect(sample).not.toMatch(/gameId|playerId|seriesId/);
    expect(poolsFromTeam(teams[0], 2).top).toBeDefined();
  });
});
