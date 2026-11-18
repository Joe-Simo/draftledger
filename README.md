# DraftLedger

Fearless Draft preparation for League of Legends coaching staffs. Built for the
Cloud9 x JetBrains "Sky's The Limit" hackathon, Category 2 (LoL): Macro Scouting
& Draft Management System.

Status: milestone 1. Draft ingestion, Fearless detection, per-team pick and ban
tendencies and a static team report page. The series board, insights and demo
link land here as they are built. Data audit: `docs/data-notes.md`.

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

JetBrains tools used and what each one did is documented in `AI_SHOWCASE.md`
(added during the build).

## AI use disclosure

This project was built by AI coding agents directed by Joe Simo, who defined the
problem, scope and design direction and reviewed and approved the outputs.

## License

MIT. See `LICENSE`.

DraftLedger is not endorsed by Riot Games and does not reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games and all associated properties are trademarks
or registered trademarks of Riot Games, Inc.
