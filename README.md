# DraftLedger

Fearless Draft preparation for League of Legends coaching staffs. Built for the
Cloud9 x JetBrains "Sky's The Limit" hackathon, Category 2 (LoL): Macro Scouting
& Draft Management System.

Status: working build. Draft ingestion, Fearless detection, per-team tendencies,
a static team report, the `/board` series board (Bo1/3/5, Fearless locks, role
pools, scouting suggestions, how-to-win insights, prep sheet export), and
per-game plans with live checks and a series forecast (ported from the Fearplan
prototype). Data audit: `docs/data-notes.md`.

## Live demo

Public site (GitHub Pages): https://joe-simo.github.io/draftledger/

- Home: https://joe-simo.github.io/draftledger/
- Series board: https://joe-simo.github.io/draftledger/board/
- Methodology: https://joe-simo.github.io/draftledger/methodology/

Source: https://github.com/Joe-Simo/draftledger

## Data and Riot API

DraftLedger uses only the official Cloud9 GRID starter data for this hackathon.
The public build ships derived aggregates under `public/data/` (per-team pick,
ban, and win counts, plus champion role frequencies). Those counts are what the
demo needs to run. Raw GRID files, JSONL, Parquet, and the `.derived/` extract
are not in the repository and are not in the Pages artifact.

The app never calls the Riot API.

Risk: no Riot Developer Portal registration was done, because DraftLedger never
calls the Riot API. If the organizers later require a registered product, that
step would need Joe's Riot account and is not something this project can
complete on its own.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest
npm run typecheck
```

Run the production build locally (static export, no dev overlay):

```bash
npm ci && npm run build
python3 -m http.server 4180 --directory out   # http://127.0.0.1:4180/board/
```

`tests/e2e-path.test.ts` covers the demo path end to end through the real modules: load the aggregates over HTTP, set up a Fearless Bo3, draft game 1 from the recommendations, record the result, check the Fearless lock in game 2, export the prep sheet.

## GRID data

The official GRID match data is licensed only for the hackathon and must never
be committed. Clone it next to this repo and point `STL_DATA_DIR` at it:

```bash
git clone --filter=blob:none --sparse https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git ../stl-hackathon-2026-grid-starter
git -C ../stl-hackathon-2026-grid-starter sparse-checkout set lol meta
```

Pipeline (all code reads the data outside this repo, nothing licensed is committed):

```bash
export STL_DATA_DIR=../stl-hackathon-2026-grid-starter
npm run data:records     # draft records into .derived/ (gitignored)
npm run data:aggregate   # team aggregates into public/data/ (counts only, committed)
npm run data:audit       # prints the facts used in docs/data-notes.md
npm run check:no-data    # fails if licensed data is tracked
npm run build            # static export into out/
```

## Documentation

- `METHODOLOGY.md` (also at `/methodology`): data, role inference and its limits, Fearless detection, confidence thresholds and intervals.
- `AI_SHOWCASE.md`: how the agents built it, the IntelliJ IDEA loop, the QA loop.
- `docs/accessibility.md`: keyboard shortcuts, axe results, manual checklist.
- `docs/demo-script.md`: demo video script.
- `docs/data-notes.md`: GRID data audit facts.

## Deploy to GitHub Pages

`.github/workflows/pages.yml` runs the checks and builds the static export with
`NEXT_PUBLIC_BASE_PATH` set to `/draftledger` (override with the repository
variable `PAGES_BASE_PATH`, empty for a custom domain). The live site is
https://joe-simo.github.io/draftledger/. Local build with the same base path:

```bash
NEXT_PUBLIC_BASE_PATH=/draftledger npm run build
```

## Built with JetBrains

IntelliJ IDEA's command-line inspector is run over `src/` with the committed
profile in `.idea/`; see `jetbrains/README.md` for the runs, the findings fixed
and what that evidence does and does not show. JetBrains tool use overall will
be written up in `AI_SHOWCASE.md`.

## AI use disclosure

This project was built by AI coding agents directed by Joe Simo, who defined the
problem, scope and design direction and reviewed and approved the outputs.

## License

MIT. See `LICENSE`.

DraftLedger isn't endorsed by Riot Games and doesn't reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games, and all associated properties are trademarks
or registered trademarks of Riot Games, Inc.

DraftLedger was created under Riot Games' "Legal Jibber Jabber" policy using
assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
