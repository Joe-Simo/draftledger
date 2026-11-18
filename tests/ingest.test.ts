import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import {
  buildDraftRecords,
  extractDraftActions,
  readGameRows,
  readRosterRows,
  readSeriesRows,
} from "@/lib/ingest";

const draftLine = (seq: number, type: "ban" | "pick", teamId: string, champion: string, gameId = "g1") =>
  JSON.stringify({
    seriesId: "s1",
    events: [
      {
        type: type === "ban" ? "team-banned-character" : "team-picked-character",
        seriesStateDelta: {
          games: [
            {
              id: gameId,
              draftActions: [
                { sequenceNumber: seq, type, drafter: { id: teamId }, draftable: { name: champion } },
              ],
            },
          ],
        },
      },
    ],
  });

describe("parseCsv", () => {
  it("handles quotes, commas, CRLF", () => {
    const rows = parseCsv('a,b\r\n1,"x, y"\r\n2,"say ""hi"""\r\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y" },
      { a: "2", b: 'say "hi"' },
    ]);
  });
});

describe("extractDraftActions", () => {
  it("collects, orders and de-duplicates draft actions per game, ignoring other events", () => {
    const lines = [
      JSON.stringify({ events: [{ type: "player-killed-player" }] }),
      draftLine(2, "ban", "B", "Zed"),
      draftLine(1, "ban", "A", "Ahri"),
      draftLine(1, "ban", "A", "Ahri"),
      "not json -banned-character",
      draftLine(3, "pick", "A", "Lux", "g2"),
      "",
    ];
    const out = extractDraftActions(lines);
    expect(out.get("g1")).toEqual([
      { seq: 1, kind: "ban", teamId: "A", champion: "Ahri" },
      { seq: 2, kind: "ban", teamId: "B", champion: "Zed" },
    ]);
    expect(out.get("g2")?.[0].champion).toBe("Lux");
  });
});

describe("buildDraftRecords", () => {
  const series = readSeriesRows("series_id,event,stage,scheduled_start\ns1,Fake Cup,Finals,2026-01-01T00:00:00Z\n");
  const games = readGameRows(
    [
      "title,series_id,game_id,game_number,map,patch,started_at,finished,winner_team_id,team1_id,team1_name,team1_side,team1_score,team2_id,team2_name,team2_side,team2_score",
      "lol,s1,g1,1,Rift,1.1,2026-01-01T00:00:00Z,True,B,A,Alpha,red,1,B,Beta,blue,5",
      "lol,s1,g2,2,Rift,1.1,2026-01-01T01:00:00Z,True,A,A,Alpha,blue,5,B,Beta,red,1",
      "val,s9,gx,1,Bind,1.1,2026-01-01T00:00:00Z,True,A,A,Alpha,red,1,B,Beta,blue,5",
    ].join("\n"),
  );
  const rosters = readRosterRows(
    [
      "title,series_id,game_id,game_number,team_id,team_name,side,player_id,player_name,character_id,character_name,participation_status",
      ...["Aatrox", "Vi", "Ahri", "Jinx", "Leona"].map((c, i) => `lol,s1,g1,1,B,Beta,blue,p${i},P${i},id,${c},active`),
      ...["Gnar", "Lee Sin", "Zed", "Kai'Sa", "Thresh"].map((c, i) => `lol,s1,g1,1,A,Alpha,red,q${i},Q${i},id,${c},active`),
    ].join("\n"),
  );

  it("reads sides, winners and role order, and builds one record per drafted game", () => {
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ blueTeamId: "B", redTeamId: "A", winnerTeamId: "B" });
    const actions = extractDraftActions([
      draftLine(1, "ban", "B", "Zed"),
      draftLine(2, "ban", "A", "Ahri"),
      draftLine(7, "pick", "B", "Aatrox"),
      draftLine(8, "pick", "A", "Lee Sin"),
      draftLine(9, "pick", "B", "Leona"),
      draftLine(10, "ban", "A", "Syndra"),
    ]);
    const records = buildDraftRecords({ series, games, rosters, actions });
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r).toMatchObject({ seriesId: "s1", event: "Fake Cup", stage: "Finals", gameNumber: 1, firstPickTeamId: "B" });
    expect(r.picks.map((p) => [p.champion, p.side, p.order, p.role])).toEqual([
      ["Aatrox", "blue", 1, "top"],
      ["Lee Sin", "red", 1, "jungle"],
      ["Leona", "blue", 2, "support"],
    ]);
    expect(r.bans.map((b) => [b.champion, b.teamId, b.targetTeamId, b.order, b.phase])).toEqual([
      ["Zed", "B", "A", 1, 1],
      ["Ahri", "A", "B", 1, 1],
      ["Syndra", "A", "B", 2, 1],
    ]);
  });

  it("puts the 7th ban and later in phase 2", () => {
    const acts = Array.from({ length: 8 }, (_, i) => draftLine(i + 1, "ban", i % 2 ? "A" : "B", `C${i}`));
    const [r] = buildDraftRecords({ series, games, rosters, actions: extractDraftActions(acts) });
    expect(r.bans.map((b) => b.phase)).toEqual([1, 1, 1, 1, 1, 1, 2, 2]);
  });
});
