# Methodology

DraftLedger is a Fearless Draft preparation tool for League of Legends coaching staffs (Category 2). This note explains where the numbers come from, how far to trust them, and what the tool does not claim. The data facts behind it are in `docs/data-notes.md`.

## 1. Data

- **Source.** The official GRID League of Legends feeds and meta CSVs from the hackathon starter repository, seasons 2025 and 2026 (LCK, LEC, LTA, LCS). 745 series files, 1,739 listed games, 1,735 with a full draft.
- **What is read.** Only draft moves (ban and pick events with team, side, champion and sequence number), plus side, winner, patch and game number from the meta files.
- **What is committed.** Team-level counts only (`public/data/teams.json`, `champions.json`, `meta.json`). The per-game draft records that the pipeline builds stay in `.derived/` and are gitignored, and `npm run check:no-data` fails if licensed raw data is tracked. The raw feeds never enter the repository.
- **Pipeline.** `node scripts/build-records.ts` (records), `node scripts/aggregate.ts` (aggregates), `node scripts/audit.ts` (the facts quoted in the notes). The static site loads the aggregates at runtime; nothing leaves the browser.

## 2. Player roles are inferred

GRID has no role field. Roster slot order is stable within a series but is not a role order (using slots as top, jungle, mid, bot, support matches the champion's most common role for only 54.1% of picks, so that idea was rejected).

Roles are inferred with a small hard-assignment EM (`src/lib/roles.ts`): for each five-player lineup the tool scores the 120 role permutations by champion-role and player-role frequencies, keeps the best, and repeats six times. Anchors are a short seed list of unambiguous champions per role and each player's votes from the seeded champions they played.

Limits, stated plainly:

- **Self-consistency, not accuracy.** 94.7% of picks land in their champion's most common role and 99.9% of games by players with 10 or more games land in the player's most common role. These numbers measure agreement with the data's own frequencies. There is no ground-truth role label to compare against. Spot checks (for example Leona 230 of 230 support) look right.
- **Flex picks are the weak spot.** A champion played in two roles is assigned by lineup context, which can be wrong in a single lineup.
- **The seeds are hand-picked.** The seed list is a fixed anchor chosen by hand, not learned, so the result depends on it.
- The board uses a champion's most common role among the roles a team has not filled yet. It is only a default, and the user can override it.
- Roles are labeled "inferred" wherever they are shown.

## 3. Fearless detection

The data has no Fearless flag. In Fearless Draft no champion picked in an earlier game of a series can be picked again by either team, so a multi-game series has zero champion reuse.

- All 568 multi-game series have zero reuse across their games, and the lock held for both teams in 568 of 568 series. So every multi-game series in this data set is treated as Fearless. 1,560 games belong to those series.
- Events and stages are classified (`src/lib/fearless.ts`): a stage is Fearless when at least 95% of at least 5 multi-game series show zero reuse; small clean stages inherit the verdict of their event. 37 of 41 event stages are Fearless. The other 4 contain only single games, so there is nothing to detect.
- Single-game series are treated as non-Fearless.
- **Not covered:** only picks are tracked as consumed. Bans are not locked in the model. League-specific rule variations (for example a final-game reset) are not in the data and are not modeled.

## 4. Aggregates and tendencies

For each team the aggregate holds pick and ban counts by champion, wins, blue and red side results, and ban phase and order. It also holds a Fearless split by game number (game 1, game 2, games 3 and later) with distinct picks, comfort share, top picks and top bans. "Comfort share" is the share of picks that come from the team's ten most picked champions.

- All counts cover every game on record for the team in the data. They are not weighted by recency and are not split by patch, so a champion that was strong two patches ago still counts.
- Fearless buckets only use games in Fearless series. The game 2 bucket is shown separately because the lock already bites there.

## 5. Confidence labels and intervals

Every claim in suggestions, insights and the prep sheet shows its sample size n and a label (`src/lib/insights.ts`):

| n (games the claim rests on) | Label | What the tool does |
| --- | --- | --- |
| under 5 | insufficient | no claim is made, the candidate is hidden and counted as left out |
| 5 to 11 | low | shown with the label |
| 12 to 29 | medium | shown with the label |
| 30 and up | high | shown with the label |

Win-rate claims need more than a sample size:

- **Champion form.** A team's win rate with a champion is only called out when the champion has at least 10 games and the lower bound of the 95% Wilson score interval is above the team's own overall win rate. Tiny winning streaks are counted as "left out" instead.
- **Side.** A side claim needs at least 20 games on each side and non-overlapping 95% Wilson intervals.
- **Ban targets.** A champion is suggested as a ban when it is picked in at least 12% of the team's games and in at least 5 games. This is a frequency claim, not a win-rate claim.
- **Fearless signature.** For the game being drafted, the tool names the most common pick of that game bucket (game 1, game 2, or games 3 and later) that is still unlocked. It does so only when the bucket has at least 5 games and the pick appears in at least 20% of them (game 1) or 12% of them (later games).

Known statistical limits:

- The intervals are not corrected for looking at many champions at once, so a few "form" claims can appear by chance. The label and n are shown so a coach can judge.
- Games within a series are not independent (the same players, the same lock), which makes the intervals somewhat too narrow.
- Win rates are not adjusted for opponent strength.
- Correlation is not causation: a champion that wins a lot for a team may reflect who they play it against.

## 6. Fearless-aware suggestions and the series forecast

- **Locks.** The board replays the draft log (`src/lib/board.ts`) and marks every champion picked in an earlier game as unavailable to both teams when Fearless is on. Suggestions, insights and the prep sheet take that set, drop locked champions (and list them as left out), and use the current game number for the game-specific advice.
- **Pools.** Per role, a team's pool minus the locked champions is compared with the games the role may still have to fill in the worst case. Remaining fewer than needed is critical, fewer than needed plus two spares is thin.
- **Plans and forecast.** A game plan lists ordered bans, ordered picks and if-they-then-we branches. The forecast assumes each undrafted game plays its top five pick priorities, projects those as locked for later games, and flags later plans that still count on them. The prediction is a planning aid, not a model of what the opponent will do.

## 7. What is not claimed

- No claim about the future win probability of a draft. A live win-rate model was considered and left out because the data is too small and too confounded to support one honestly.
- No individual player profiling beyond role inference, and no player names are stored in the committed aggregates.
- Results describe past drafts in this data set. They are advice for preparation, not a prediction.

## 8. Checking it

- 123 Vitest tests on synthetic fixtures (not GRID data) cover ingestion, Fearless detection, aggregation, role inference, the draft reducer, locks, suggestions, insights, plans and the forecast.
- `typecheck`, ESLint and `check:no-data` run clean. IntelliJ IDEA inspections are listed in `jetbrains/README.md`.
- Accessibility checks are in `docs/accessibility.md`.
