import { parseCsv } from "./csv.ts";
import { inferRoles, type Lineup } from "./roles.ts";
import {
  type BanRecord,
  type DraftAction,
  type DraftGameRecord,
  type GameRow,
  type PickRecord,
  type RosterRow,
  type SeriesRow,
  type Side,
} from "./types.ts";

type Json = Record<string, unknown>;

const DRAFT_EVENT_TYPES = ["team-banned-character", "team-picked-character"];

/** Cheap pre-filter so we only JSON.parse envelopes that carry a draft event. */
export function mayContainDraftEvent(line: string): boolean {
  return line.includes("-banned-character") || line.includes("-picked-character");
}

/**
 * Pull draft actions out of GRID envelope lines (JSON Lines). Each draft event carries the new
 * action in seriesStateDelta.games[].draftActions. Result is keyed by game id, ordered by
 * sequence number, de-duplicated.
 */
export function extractDraftActions(lines: Iterable<string>): Map<string, DraftAction[]> {
  const byGame = new Map<string, Map<number, DraftAction>>();
  for (const line of lines) {
    if (!line || !mayContainDraftEvent(line)) continue;
    let envelope: Json;
    try {
      envelope = JSON.parse(line) as Json;
    } catch {
      continue;
    }
    const events = (envelope.events as Json[] | undefined) ?? [];
    for (const ev of events) {
      if (!DRAFT_EVENT_TYPES.includes(ev.type as string)) continue;
      const games = ((ev.seriesStateDelta as Json | undefined)?.games as Json[] | undefined) ?? [];
      for (const g of games) {
        const gameId = g.id as string;
        for (const d of (g.draftActions as Json[] | undefined) ?? []) {
          const seq = d.sequenceNumber as number;
          const kind = d.type as string;
          const teamId = (d.drafter as Json | undefined)?.id as string | undefined;
          const champion = (d.draftable as Json | undefined)?.name as string | undefined;
          if (!seq || (kind !== "ban" && kind !== "pick") || !teamId || !champion) continue;
          let m = byGame.get(gameId);
          if (!m) byGame.set(gameId, (m = new Map()));
          m.set(seq, { seq, kind, teamId, champion });
        }
      }
    }
  }
  const out = new Map<string, DraftAction[]>();
  for (const [gameId, m] of byGame) out.set(gameId, [...m.values()].sort((a, b) => a.seq - b.seq));
  return out;
}

export function readSeriesRows(csvText: string): SeriesRow[] {
  return parseCsv(csvText).map((r) => ({
    seriesId: r.series_id,
    event: r.event,
    stage: r.stage,
    scheduledStart: r.scheduled_start,
  }));
}

export function readGameRows(csvText: string): GameRow[] {
  return parseCsv(csvText)
    .filter((r) => r.title === "lol")
    .map((r) => ({
      seriesId: r.series_id,
      gameId: r.game_id,
      gameNumber: Number(r.game_number),
      patch: r.patch,
      startedAt: r.started_at,
      winnerTeamId: r.winner_team_id || null,
      blueTeamId: r.team1_side === "blue" ? r.team1_id : r.team2_id,
      blueTeamName: r.team1_side === "blue" ? r.team1_name : r.team2_name,
      redTeamId: r.team1_side === "red" ? r.team1_id : r.team2_id,
      redTeamName: r.team1_side === "red" ? r.team1_name : r.team2_name,
    }));
}

/** rosters.csv lists five players per team and game, not in a fixed role order (roles are inferred, see roles.ts). */
export function readRosterRows(csvText: string): RosterRow[] {
  const counters = new Map<string, number>();
  const out: RosterRow[] = [];
  for (const r of parseCsv(csvText)) {
    if (r.title !== "lol") continue;
    const key = `${r.game_id}|${r.team_id}`;
    const idx = counters.get(key) ?? 0;
    counters.set(key, idx + 1);
    out.push({
      gameId: r.game_id,
      teamId: r.team_id,
      playerIndex: idx,
      playerId: r.player_id,
      champion: r.character_name,
      active: r.participation_status !== "inactive",
    });
  }
  return out;
}

export interface BuildInput {
  series: SeriesRow[];
  games: GameRow[];
  rosters: RosterRow[];
  actions: Map<string, DraftAction[]>;
}

/** Combine metadata, rosters and draft actions into one record per game that has a full draft. */
export function buildDraftRecords(input: BuildInput): DraftGameRecord[] {
  const seriesById = new Map(input.series.map((s) => [s.seriesId, s]));
  const rosterByGameTeam = new Map<string, RosterRow[]>();
  for (const r of input.rosters) {
    const k = `${r.gameId}|${r.teamId}`;
    const list = rosterByGameTeam.get(k);
    if (list) list.push(r);
    else rosterByGameTeam.set(k, [r]);
  }
  // Infer roles from every lineup of five active players (needs the whole data set, not one game).
  const lineups: Lineup[] = [];
  for (const [key, rows] of rosterByGameTeam) {
    const active = rows.filter((r) => r.active);
    if (active.length === 5)
      lineups.push({ key, champions: active.map((r) => r.champion), playerIds: active.map((r) => r.playerId) });
  }
  const roleByLineup = inferRoles(lineups);
  const drafted = input.games
    .filter((g) => (input.actions.get(g.gameId)?.length ?? 0) > 0)
    .sort((a, b) => a.seriesId.localeCompare(b.seriesId) || a.gameNumber - b.gameNumber);
  const countBySeries = new Map<string, number>();
  for (const g of drafted) countBySeries.set(g.seriesId, (countBySeries.get(g.seriesId) ?? 0) + 1);

  const records: DraftGameRecord[] = [];
  for (const g of drafted) {
    const actions = input.actions.get(g.gameId) ?? [];
    const sideOf = (teamId: string): Side | null =>
      teamId === g.blueTeamId ? "blue" : teamId === g.redTeamId ? "red" : null;
    const opponentOf = (teamId: string) => (teamId === g.blueTeamId ? g.redTeamId : g.blueTeamId);
    const pickCount = new Map<string, number>();
    const banCount = new Map<string, number>();
    let banOrdinal = 0;
    const picks: PickRecord[] = [];
    const bans: BanRecord[] = [];
    for (const a of actions) {
      const side = sideOf(a.teamId);
      if (!side) continue;
      if (a.kind === "pick") {
        const order = (pickCount.get(a.teamId) ?? 0) + 1;
        pickCount.set(a.teamId, order);
        const key = `${g.gameId}|${a.teamId}`;
        const active = (rosterByGameTeam.get(key) ?? []).filter((r) => r.active);
        const slot = active.findIndex((r) => r.champion === a.champion);
        const roles = roleByLineup.get(key);
        picks.push({
          teamId: a.teamId,
          side,
          champion: a.champion,
          order,
          seq: a.seq,
          role: slot >= 0 && roles ? (roles[slot] ?? null) : null,
        });
      } else {
        banOrdinal++;
        const order = (banCount.get(a.teamId) ?? 0) + 1;
        banCount.set(a.teamId, order);
        bans.push({
          teamId: a.teamId,
          side,
          targetTeamId: opponentOf(a.teamId),
          champion: a.champion,
          order,
          phase: banOrdinal <= 6 ? 1 : 2,
          seq: a.seq,
        });
      }
    }
    const s = seriesById.get(g.seriesId);
    const firstPick = picks[0]?.teamId ?? null;
    records.push({
      seriesId: g.seriesId,
      event: s?.event ?? "",
      stage: s?.stage ?? "",
      gameId: g.gameId,
      gameNumber: g.gameNumber,
      seriesGameCount: countBySeries.get(g.seriesId) ?? 1,
      patch: g.patch,
      date: g.startedAt,
      blue: { teamId: g.blueTeamId, name: g.blueTeamName },
      red: { teamId: g.redTeamId, name: g.redTeamName },
      winnerTeamId: g.winnerTeamId,
      firstPickTeamId: firstPick,
      picks,
      bans,
    });
  }
  return records;
}
