import { describe, expect, it } from "vitest";
import { buildChampionSummary, initials, leaguePools, parsePoolText, poolsFromTeam, suggestRole } from "@/lib/champions";
import { aggregateTeams } from "@/lib/aggregate";
import { game } from "./fixtures";

describe("champions", () => {
  const records = [
    game({ seriesId: "s", gameNumber: 1, blue: "A", red: "B", winner: "A", bluePicks: ["Ahri", "Vi", "Zed", "Jinx", "Leona"], redPicks: ["Gnar", "Lee Sin", "Ahri2", "Kai'Sa", "Thresh"], blueBans: ["Teemo"] }),
    game({ seriesId: "s2", gameNumber: 1, blue: "A", red: "B", winner: "A", bluePicks: ["Ahri", "Vi", "Zed", "Jinx", "Leona"], redPicks: ["Gnar", "Lee Sin", "Ahri2", "Kai'Sa", "Thresh"], redBans: ["Teemo"] }),
  ];

  it("summarises picks, bans and roles", () => {
    const list = buildChampionSummary(records);
    const ahri = list.find((c) => c.name === "Ahri")!;
    expect(ahri).toMatchObject({ picks: 2, bans: 0, roles: { top: 2 } });
    expect(list.find((c) => c.name === "Teemo")).toMatchObject({ picks: 0, bans: 2 });
  });

  it("builds initials without art", () => {
    expect(initials("Ahri")).toBe("Ah");
    expect(initials("Lee Sin")).toBe("LS");
    expect(initials("Kai'Sa")).toBe("Ka");
    expect(initials("")).toBe("?");
  });

  it("suggests the most common unfilled role", () => {
    const info = { name: "Ahri", picks: 5, bans: 0, roles: { mid: 4, top: 1 } as const };
    expect(suggestRole(info, [])).toBe("mid");
    expect(suggestRole(info, ["mid"])).toBe("top");
    expect(suggestRole(undefined, ["top"])).toBe("jungle");
    expect(suggestRole(info, ["top", "jungle", "mid", "bot", "support"])).toBeNull();
  });

  it("builds league and team pools and parses text", () => {
    const pools = leaguePools(buildChampionSummary(records), 2, 0.5);
    expect(pools.top).toEqual(expect.arrayContaining(["Ahri", "Gnar"]));
    const team = aggregateTeams(records, new Set())[0];
    expect(poolsFromTeam(team, 2).jungle).toContain("Vi");
    expect(parsePoolText("Ahri, Vi\nZed, Ahri,  ")).toEqual(["Ahri", "Vi", "Zed"]);
  });
});
