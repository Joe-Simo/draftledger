# GRID LoL data notes (aggregate facts only)

Audit of the official GRID League of Legends data from the Sky's The Limit 2026 starter repository
(`cloud9esports/stl-hackathon-2026-grid-starter`, folders `lol/` and `meta/`), run on 2026-11-18 with
`node scripts/audit.ts`. This file holds counts and schema facts only. No raw events, no player names and
no match identifiers are quoted. The data license forbids committing the data, see "License and what is committed".

## Coverage
- 745 series files in `lol/series.csv`; `meta/games.csv` lists 1,739 LoL games. Seasons 2025 and 2026: LCK, LEC, LTA (North, South, Cross-Conference) and LCS.
- 1,735 games have a full draft and become draft records; 4 games have none. 1,716 games have 10 picks and 10 bans, 18 have 8 or 9 bans (a missed or skipped ban), 1 has no picks.
- 743 series have at least one draft record: 568 are multi-game series (Bo2 to Bo5) and 175 are single games (Bo1).
- The feed files also contain draft actions for about 40 game ids that are not in `meta/games.csv`; they are ignored because side and winner are unknown.
- 42 teams have at least 8 drafted games. Cloud9 Kia: 142 games in 53 series, 134 of those games in Fearless series.

## Draft event schema (as used by `src/lib/ingest.ts`)
Each line of an `events_<seriesId>_grid.jsonl.zst` file is an envelope (`id, correlationId, occurredAt, seriesId, sequenceNumber, events[]`). Draft moves are events of type:
- `team-banned-character` and `team-picked-character` (`type == actor.type-action-target.type`).
- `actor` is the drafting team (`actor.id` = team id, `actor.state.side` = blue or red); `target` is the champion (`target.state.name`).
- The new move also appears in `seriesStateDelta.games[].draftActions[]` with `sequenceNumber` (1 to 20), `type` (`ban` or `pick`), `drafter.id` (team id) and `draftable.name` (champion). The module reads this field, keyed by `games[].id` (game id), and de-duplicates by sequence number.
- Typical order: bans 1 to 6 (three each, alternating), picks 7 to 12 (blue, red, red, blue, blue, red), bans 13 to 16, picks 17 to 20. The module does not assume the order, it uses sequence numbers. Ban phase 1 is bans 1 to 6 by ordinal, phase 2 is the rest.
- First pick belongs to blue in 1,491 of 1,735 games (86%), so first-pick team is not always blue and is recorded per game.
- Side, winner, patch and game number come from `meta/games.csv` (`team1_side`, `winner_team_id`, `patch`, `game_number`). Series event and stage come from `lol/series.csv`.
- Decompression: Node 24 `zlib.zstdDecompressSync`, no extra package. A line filter (`-banned-character`, `-picked-character` substring) avoids parsing the large in-game events; all 745 files take about 45 seconds with a warm disk cache.

## Per-player roles: not provided, inferred
- GRID has no role or position field for LoL players. `meta/rosters.csv` lists exactly five active players per team and game (17 team-games list a sixth, `inactive`), in a stable order per series and team: the same player id sits in the same slot in all games of a series (7,461 of 7,461 series, team, slot combinations).
- That slot order is NOT a role order. Using slot 0 to 4 as top, jungle, mid, bot, support gives only 54.1% of picks in the champion's most common slot (a first test, rejected).
- Method (`src/lib/roles.ts`): hard EM over the 120 role permutations of each five-player lineup, scored by champion-role and player-role frequencies. Anchors: a small seed list of unambiguous champions per role, and each player's votes from the seeded champions they played. Six iterations.
- Result: 17,310 of 17,340 picks get a role. 94.7% of picks are in their champion's most common role, and for the 251 players with 10 or more games, 99.9% of their games are in their most common role. These are self-consistency numbers, not a comparison with ground truth; spot checks look right (for example Leona 230 of 230 support, Kai'Sa 290 of 290 bot, Sejuani 285 of 285 jungle, Lee Sin 65 of 69 jungle). Flex picks are the main ambiguity. The app labels roles as inferred.

## Fearless Draft: counts and how it was detected
- No Fearless flag exists in the data. Detection (`classifyFearlessStages` in `src/lib/fearless.ts`): in a Fearless series no champion can be picked twice, so a multi-game series has zero champion reuse across its games (both teams share the lock). In normal series popular champions come back in game 2 and 3.
- All 568 multi-game series have zero reuse, so every multi-game series in this data set is a Fearless series. Lock scope is both teams: zero picks of a champion already picked by either team in an earlier game, in 568 of 568 series. Zero violations.
- Series are grouped by event and stage. A stage is Fearless when at least 95% of at least 5 multi-game series show zero reuse, and small clean stages inherit the verdict of their event. 37 of 41 event stages are Fearless; the other 4 (Regular Season or Round 1 stages of LEC Winter 2025, LEC Versus 2026, LTA North Split 2 2025 and LTA South Split 2 2025) contain only single games, so there is nothing to detect, and they are not counted.
- Fearless series length: 252 Bo2 or two-game series, 238 three-game, 48 four-game, 30 five-game. Fearless games: 1,560 (all games of those 568 series). Single-game series are treated as non-Fearless.
- Bans are not locked: only picks are tracked as consumed. If the app needs the exact current rules per league (for example whether a champion banned and unpicked stays available), that comes from league rules, not this data.

## License and what is committed
The data license (LICENSE.md in the starter repo) allows using the data to build the project during the hackathon. It forbids redistribution, commercial use and committing the data. It also says the project may show results, statistics and charts and "small excerpts of the Data reasonably necessary to demonstrate the Project". Its README states "Your code, charts, screenshots and aggregate results are fine to commit".

| Item | Where | Committed? |
|---|---|---|
| Raw feeds and meta CSVs | `/workspace/data/stl-hackathon-2026-grid-starter` (outside the repo) | Never |
| Draft records (one row per game: series id, game id, dates, all picks and bans) | `.derived/records.json` | No (gitignored). It is a derived dataset that could be used to reconstruct draft events |
| Team aggregates: counts of picks, bans, wins, sides and Fearless buckets per team and champion, first and last date per team | `public/data/teams.json` | Yes: aggregate results only. No player names, series ids, game ids, per-game rows or timestamps beyond one first and one last date per team |
| Run totals and stage verdicts (counts) | `public/data/meta.json` | Yes |

Guards: `.gitignore` blocks `*.zst`, `*.jsonl`, `.derived/` and database or parquet extracts; `npm run check:no-data` fails if any such file is tracked. Team-level aggregates mention team names, which are public competitive facts; no individual players are profiled (license section 3(e)). Open question for Cloud9: confirm that committing the team aggregates is acceptable (the README says yes). If not, `public/data` can move to gitignore and be generated in CI from the starter repo.

## Known dev-only audit findings
`npm audit` reports 16 high items, all the same advisory: picomatch `ReDoS` through single-branch repeated extglobs (GHSA-fc5q-39xc-vjpf, affects up to 4.0.7, which is the latest published version; the 2.x copy under fast-glob is also affected), reached through `vitest`, `tinyglobby`, `fdir`, `fast-glob` and the ESLint plugins. They exist only in the build and test toolchain. The static export ships none of these packages and no user input reaches picomatch. No patched release exists yet, so there is no non-breaking fix; `npm audit fix` changed nothing useful, and `--force` would downgrade `vitest` and `eslint-config-next`. Re-check before submission.
