# DraftLedger

Fearless Draft preparation for League of Legends coaching staffs. Built for the
Cloud9 x JetBrains "Sky's The Limit" hackathon, Category 2 (LoL): Macro Scouting
& Draft Management System.

Status: working build. Draft ingestion, Fearless detection, per-team tendencies,
a static team report, the `/board` series board (Bo1/3/5, Fearless locks, role
pools, scouting suggestions, how-to-win insights, prep sheet export), and
per-game plans with live checks and a series forecast (ported from the Fearplan
prototype). Data audit: `docs/data-notes.md`.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest
npm run typecheck
```

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
