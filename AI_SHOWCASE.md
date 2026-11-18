# AI workflow story

This is an account of how DraftLedger was built with AI coding agents, written for the Best AI-Powered Workflow Story bonus prize. It says what the human did, what the agents did, and where the process was clumsy. It makes no claim about speed or productivity beyond what the repository history shows.

## Who did what

**Joe Simo** defined the problem (a Fearless Draft preparation tool for the League of Legends category), the scope of each chunk of work, and the design direction. He also set the rules: commit locally, no pushing before review, no committing licensed data, aggregates only, no Riot art. He reviewed each result in a browser, found the bugs, and decided what to fix next. He also ran the IntelliJ IDEA GUI session described below.

**AI coding agents** wrote the code, tests and documents, ran the commands, and committed locally. The work was split into milestones, each given to an agent as a written brief with a time box of about 30 minutes. The commit history shows the sequence.

## The milestones

| Milestone | What the agent did | What the human decided |
| --- | --- | --- |
| m1, data audit and ingestion | Read the GRID feeds, wrote the schema notes, built a typed ingestion and aggregation module, found that roles are not in the data and wrote an inference, found that every multi-game series is Fearless by checking champion reuse, fixed dev-only npm audit findings where possible | Scope; that count-only aggregates may be committed under the data license |
| m2, series board | Wrote a pure TypeScript reducer for Bo1, Bo3 and Bo5 draft order, the Fearless lock, per-role pool tracking and undo, with exhaustive tests; built the `/board` page with a text-only champion picker and local storage | The Riot IP rule (names only, no art, disclaimer) |
| m3, scouting | Wired opponent tendencies into the board: suggestions per draft step, a next-game outlook under the lock, how-to-win insights with sample-size guards, prep sheet export | The rule that no claim is made on tiny samples and every claim shows n |
| m4, browser QA fixes | Fixed what the human found in the browser (see below) | What counted as a bug |
| m5, merge | Re-implemented the best parts of a second prototype ("Fearplan", built in parallel) on this reducer: per-game plans, live checks, a series forecast | One entry only; the other folder is kept for reference and marked as not to be submitted |
| m6, IntelliJ evidence | Ran IntelliJ IDEA's inspector headless, fixed the real findings, documented the false ones | Which `.idea` files to commit |
| m7, accessibility and docs | Keyboard pass, contrast fixes, these documents, a Pages workflow | Scope |

## Concrete steps and where the human caught the agent

These happened and are in the history:

- **Role labels.** The first board labeled roles from the roster order. A data check showed that matched the champion's usual role only 54% of the time, so the agent built an inference. Later the human's browser pass showed Azir labeled jungle and Sett labeled bot. The agent traced this to a sticky Role dropdown that kept an old manual choice, not to the inference. It fixed the dropdown and added tests with the real role counts.
- **Fearless locks in advice.** In game 2 the insights still said "Consider banning Rumble" for a champion that was already locked, and still said "In game 1 expect...". The human saw it in the browser; the agent made insights and the prep sheet take the board state and added tests.
- **Own team scouting.** Choosing Cloud9 Kia as "our team" did not name Team A or fill its pool. Fixed and tested.
- **Duplicate work.** Two agents built a Fearless Draft planner at the same time for the same event. The human chose DraftLedger; the useful parts of the other were ported rather than shipping two entries.
- **A mistaken assumption about the IDE.** The agent first described the other prototype's `.idea` folder as real. On inspection, it was handwritten and only opened by a headless IDE run, so the documentation was corrected to say exactly that.
- **A finding that did not reproduce.** The GUI session reported one CSS error that the headless inspector never showed. The agent did not change code blind and reported it as unreproduced.

## IntelliJ IDEA loop

IntelliJ IDEA 2026.3 (build IU-263.7307.200) was used three ways:

1. **Headless formatter** on the scaffold, committed as its own change.
2. **Headless inspector** (`jetbrains/run-inspections.sh`) with the committed profile in `.idea/`. Each run's raw JSON and the IDE log are saved in `jetbrains/inspections/`. Runs on the first prototype found 22 findings that were fixed in commits that name each inspection. The headless run on this project before the fixes listed 34 findings (import suggestions in node scripts, a generated file, grammar and style in docs, false positives on package subpaths, and a QA export); after the fixes it lists none on repeated runs. Findings that were false positives were suppressed with a comment that says why, not deleted silently.
3. **GUI session on Nov 18 2026.** The project was opened in the IDE and Code | Inspect Code was run. The IDE wrote `.idea/workspace.xml` and `.idea/vcs.xml`. Screenshots are in `qa/ide-01.png` and `qa/ide-02.png`.

No JetBrains account or license was needed for the inspections. The build agents did not use JetBrains Air or the Junie agent, as far as the repository history and the IDE logs show. If the author used them, update this section before submission.

## Browser QA

After each milestone the human opened the built site and wrote down what was wrong. The screenshots are in `qa/`. The agent fixed the list, added a test for each logic bug, rebuilt, and restarted the static server. A scripted browser pass with an accessibility engine (axe-core) found dark mode contrast failures and heading order problems in m7, which were fixed and are covered by tests.

## Data audit

The first milestone was a data audit, not code: counting series and games, checking what the roster and draft events contain, and testing the Fearless hypothesis on all 568 multi-game series. That is why the roles are labeled as inferred and why the documentation states the self-consistency numbers and their limits. See `METHODOLOGY.md`.

## What the agents were bad at

- They trusted a first idea (roster order as roles) until a measurement said otherwise.
- They duplicated effort when two briefs overlapped.
- They claimed more than they had checked, for example about the other prototype's IDE folder, until the claim was verified. Each such claim was corrected in the documents.
- They needed a human in a browser: several bugs only showed up there.

## What I would not claim

This was one person directing agents over a short stretch. It does not show that agents can replace a coach, an analyst or an engineer, and the statistics in the tool are descriptive, not predictive.
