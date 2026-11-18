export type Side = "blue" | "red";
export type Role = "top" | "jungle" | "mid" | "bot" | "support";
/** Roster order in GRID rosters.csv: top, jungle, mid, bot, support (validated in docs/data-notes.md). */
export const ROLES: readonly Role[] = ["top", "jungle", "mid", "bot", "support"];

export interface DraftAction {
  seq: number;
  kind: "ban" | "pick";
  teamId: string;
  champion: string;
}

export interface SeriesRow {
  seriesId: string;
  event: string;
  stage: string;
  scheduledStart: string;
}

export interface GameRow {
  seriesId: string;
  gameId: string;
  gameNumber: number;
  patch: string;
  startedAt: string;
  winnerTeamId: string | null;
  blueTeamId: string;
  blueTeamName: string;
  redTeamId: string;
  redTeamName: string;
}

export interface RosterRow {
  gameId: string;
  teamId: string;
  /** 0..4 position of the player inside the team in that game. */
  playerIndex: number;
  playerId: string;
  champion: string;
  active: boolean;
}

export interface PickRecord {
  teamId: string;
  side: Side;
  champion: string;
  /** 1..5 within the team's own picks. */
  order: number;
  /** Overall draft sequence number. */
  seq: number;
  role: Role | null;
}

export interface BanRecord {
  teamId: string;
  side: Side;
  /** The team the ban was aimed at. */
  targetTeamId: string;
  champion: string;
  /** 1..5 within the team's own bans. */
  order: number;
  phase: 1 | 2;
  seq: number;
}

export interface DraftGameRecord {
  seriesId: string;
  event: string;
  stage: string;
  gameId: string;
  gameNumber: number;
  /** Games with a recorded draft in this series. */
  seriesGameCount: number;
  patch: string;
  date: string;
  blue: { teamId: string; name: string };
  red: { teamId: string; name: string };
  winnerTeamId: string | null;
  firstPickTeamId: string | null;
  picks: PickRecord[];
  bans: BanRecord[];
}
