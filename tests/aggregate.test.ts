import { describe, expect, it } from "vitest";
import { aggregateTeams } from "@/lib/aggregate";
import { classifyFearlessStages, groupBySeries, seriesReuse } from "@/lib/fearless";
import { game, names } from "./fixtures";

// Fearless-clean Bo3: no champion repeats across games.
const fearlessSeries = (id: string, event = "Fearless Cup") => [
  game({ seriesId: id, event, gameNumber: 1, blue: "A", red: "B", winner: "A", bluePicks: ["Ahri", "Vi", "Zed", "Jinx", "Leona"], redPicks: names("r", 5, 0), blueBans: ["Ban1", "Ban2"], redBans: ["Ban3"] }),
  game({ seriesId: id, event, gameNumber: 2, blue: "B", red: "A", winner: "B", bluePicks: names("r", 5, 5), redPicks: ["Lux", "Gnar", "Orianna", "Kai'Sa", "Thresh"], blueBans: ["Ban3"], redBans: ["Ban1"] }),
  game({ seriesId: id, event, gameNumber: 3, blue: "A", red: "B", winner: "A", bluePicks: ["Syndra", "Sejuani", "Azir", "Ezreal", "Nami"].map((c) => `${c}-${id}`), redPicks: names("r", 5, 10), blueBans: ["Ban1"], redBans: ["Ban9"] }),
];

// Normal (non-fearless) Bo3: popular picks repeat.
const normalSeries = (id: string, event = "Normal Cup") => [
  game({ seriesId: id, event, gameNumber: 1, blue: "A", red: "B", winner: "A", bluePicks: ["Ahri", "Vi", "Zed", "Jinx", "Leona"], redPicks: ["Lux", "Gnar", "Orianna", "Kai'Sa", "Thresh"] }),
  game({ seriesId: id, event, gameNumber: 2, blue: "B", red: "A", winner: "B", bluePicks: ["Lux", "Gnar", "Orianna", "Kai'Sa", "Thresh"], redPicks: ["Ahri", "Vi", "Zed", "Jinx", "Leona"] }),
];

describe("seriesReuse", () => {
  it("is zero for a Fearless-clean series and counts opponent reuse otherwise", () => {
    expect(seriesReuse(fearlessSeries("f1")).reusedPicks).toBe(0);
    const r = seriesReuse(normalSeries("n1"));
    expect(r.reusedPicks).toBe(10);
    expect(r.reusedFromOpponent).toBe(0);
    const swapped = [
      game({ seriesId: "s", gameNumber: 1, blue: "A", red: "B", winner: "A", bluePicks: ["Ahri"], redPicks: ["Lux"] }),
      game({ seriesId: "s", gameNumber: 2, blue: "A", red: "B", winner: "A", bluePicks: ["Lux"], redPicks: ["Vi"] }),
    ];
    expect(seriesReuse(swapped)).toMatchObject({ reusedPicks: 1, reusedFromOpponent: 1 });
  });
});

describe("classifyFearlessStages", () => {
  it("flags stages where nearly every multi-game series has zero reuse", () => {
    const records = [
      ...Array.from({ length: 6 }, (_, i) => fearlessSeries(`f${i}`)).flat(),
      ...Array.from({ length: 6 }, (_, i) => normalSeries(`n${i}`)).flat(),
    ];
    const { stages, fearlessSeriesIds } = classifyFearlessStages(records);
    const f = stages.find((s) => s.key.startsWith("Fearless Cup"))!;
    const n = stages.find((s) => s.key.startsWith("Normal Cup"))!;
    expect(f).toMatchObject({ multiGameSeries: 6, zeroReuseSeries: 6, rate: 1, fearless: true });
    expect(n).toMatchObject({ zeroReuseSeries: 0, fearless: false });
    expect(fearlessSeriesIds.has("f0")).toBe(true);
    expect(fearlessSeriesIds.has("n0")).toBe(false);
  });

  it("needs enough series before calling a stage Fearless", () => {
    const records = fearlessSeries("only");
    expect(classifyFearlessStages(records).stages[0].fearless).toBe(false);
    expect(classifyFearlessStages(records, { minSeries: 1 }).stages[0].fearless).toBe(true);
  });

  it("lets a tiny clean stage inherit the Fearless verdict of its event, but not a stage with reuse", () => {
    const records = [
      ...Array.from({ length: 6 }, (_, i) => fearlessSeries(`m${i}`).map((g) => ({ ...g, event: "Cup", stage: "Main" }))).flat(),
      ...fearlessSeries("tiny").map((g) => ({ ...g, event: "Cup", stage: "Tiny" })),
      ...normalSeries("dirty").map((g) => ({ ...g, event: "Cup", stage: "Dirty" })),
      ...normalSeries("lonely").map((g) => ({ ...g, event: "Other Cup", stage: "Tiny" })),
    ];
    const { stages, fearlessSeriesIds } = classifyFearlessStages(records);
    expect(stages.find((s) => s.key === "Cup | Tiny")).toMatchObject({ fearless: true, inherited: true });
    expect(stages.find((s) => s.key === "Cup | Dirty")?.fearless).toBe(false);
    expect(stages.find((s) => s.key === "Other Cup | Tiny")?.fearless).toBe(false);
    expect(fearlessSeriesIds.has("tiny")).toBe(true);
    expect(fearlessSeriesIds.has("dirty")).toBe(false);
  });

  it("does not count single-game series as Fearless", () => {
    const bo1 = Array.from({ length: 6 }, (_, i) => game({ seriesId: `b${i}`, gameNumber: 1, blue: "A", red: "B", winner: "A", bluePicks: names("x", 5), redPicks: names("y", 5) }));
    const multi = Array.from({ length: 6 }, (_, i) => fearlessSeries(`m${i}`)).flat();
    const { fearlessSeriesIds } = classifyFearlessStages([...bo1, ...multi]);
    expect(fearlessSeriesIds.has("b0")).toBe(false);
    expect(fearlessSeriesIds.has("m0")).toBe(true);
  });

  it("groups and sorts series by game number", () => {
    const shuffled = [...fearlessSeries("x")].reverse();
    expect(groupBySeries(shuffled).get("x")!.map((g) => g.gameNumber)).toEqual([1, 2, 3]);
  });
});

describe("aggregateTeams", () => {
  const records = Array.from({ length: 3 }, (_, i) => fearlessSeries(`f${i}`)).flat();
  const fearlessIds = new Set(["f0", "f1", "f2"]);
  const teams = aggregateTeams(records, fearlessIds);
  const a = teams.find((t) => t.teamId === "A")!;

  it("counts games, wins and sides", () => {
    expect(a.games).toBe(9);
    expect(a.wins).toBe(6);
    expect(a.series).toBe(3);
    expect(a.fearlessGames).toBe(9);
    expect(a.sides.blue.games).toBe(6);
    expect(a.sides.red.games).toBe(3);
  });

  it("computes pick tendencies with side, order, role and win counts", () => {
    const ahri = a.picks.find((p) => p.champion === "Ahri")!;
    expect(ahri).toMatchObject({ games: 3, wins: 3, blue: 3, red: 0, avgOrder: 1 });
    expect(ahri.roles).toEqual({ top: 3 });
  });

  it("computes ban tendencies and bans aimed at the team", () => {
    const ban1 = a.bans.find((b) => b.champion === "Ban1")!;
    expect(ban1.count).toBe(9);
    expect(ban1.firstBan).toBe(9);
    expect(a.bansAgainst[0]).toEqual({ champion: "Ban3", count: 6 });
  });

  it("separates Fearless game 1, 2 and 3+ and reports the shift", () => {
    const f = a.fearless!;
    expect(f.byGame["1"].games).toBe(3);
    expect(f.byGame["2"].games).toBe(3);
    expect(f.byGame["3+"].games).toBe(3);
    expect(f.byGame["1"].topPicks[0].champion).toBe("Ahri");
    expect(f.byGame["3+"].topPicks.map((c) => c.champion)).not.toContain("Ahri");
    expect(f.top5PickOverlapG1vsG3).toBe(0);
    expect(f.byGame["1"].comfortShare).toBe(1);
    expect(f.byGame["3+"].comfortShare).toBe(0);
    expect(f.comfortShareDelta).toBe(-1);
  });

  it("returns null fearless data when the team has no Fearless games and respects minGames", () => {
    const plain = aggregateTeams(normalSeries("n"), new Set());
    expect(plain[0].fearless).toBeNull();
    expect(aggregateTeams(normalSeries("n"), new Set(), { minGames: 5 })).toHaveLength(0);
  });
});
