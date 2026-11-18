# Demo video script (target 2:45, hard limit 2:50)

Format: screen recording with a synthetic voice-over. No face and no human voice. The text under "Voice" is the narration, about 300 words, paced at 100 to 150 words per minute so each line fits its time slot. Record the screen at 1080p, browser zoom 110%, light theme. Use the built site (`out/`, served locally) so there is no dev overlay. Captions on (upload the narration text as the caption file). No music, or royalty-free music at low volume; do not add any game footage or logos.

| Time | Screen | Voice |
| --- | --- | --- |
| 0:00 to 0:15 | Home page: list of teams, then click Series board | "DraftLedger helps a League of Legends coaching staff prepare Fearless Draft series. In Fearless, a champion used in one game is gone for both teams for the rest of the series, so every pick has a price." |
| 0:15 to 0:35 | Team page for one opponent: top picks, then the Fearless shift with game 1, game 2 and games 3 plus | "It starts from the official GRID data. For any team it shows pick and ban tendencies, with counts, and how their drafting changes by game number. Their comfort picks shrink as the lock grows. Every number shows its sample size." |
| 0:35 to 0:55 | Board setup: Bo3, Fearless, scout Karmine Corp, our team Cloud9 Kia, Start new series | "On the series board you set the format, pick the scouted opponent, and choose your own team. Both teams get named and their champion pools filled from the data." |
| 0:55 to 1:25 | Keyboard draft: press slash, type a name, Enter. Show the suggestion strip, then the Plan says line and Alt+P | "The draft runs from the keyboard. Type a name, press Enter. The standard ban and pick order, side selection and roles are handled for you. Suggestions show what the opponent usually does at this step, with the sample size, and your own game plan can say what to take next." |
| 1:25 to 1:50 | Finish game 1, mark the winner, show game 2: locked champions disabled, role pools, how-to-win panel | "After game one, the champions used are locked. They are disabled in the picker, removed from the advice, and each role's remaining pool shows a warning when it runs thin. The how-to-win points switch to game two and say what they left out." |
| 1:50 to 2:10 | Plan panel: write a pick in game 1 and game 2, show the conflict in the forecast | "Before the series, write a plan for each game. The forecast plays the series forward and flags a champion that an earlier game will use up, so you find the conflict before the draft, not during it." |
| 2:10 to 2:18 | Prep sheet: Print, Download Markdown | "Everything exports as a prep sheet to print or share." |
| 2:18 to 2:32 | IntelliJ IDEA: project window, then the Inspection Results tool window (qa/ide-02.png layout), cut quickly to jetbrains/README.md | "It was built with AI coding agents under my direction. IntelliJ IDEA ran the inspections: the findings are saved in the repository, fixed, and the rerun is clean." |
| 2:32 to 2:45 | Methodology page or README with the Riot notice in the footer | "Roles are inferred, claims need enough games, and the method is written down. DraftLedger is a fan tool and is not endorsed by Riot Games." |

## Recording notes

- The voice says "my direction" for Joe Simo. If the synthetic voice should not speak in first person, change the line to "under the direction of Joe Simo".
- Do not show raw data files, the data folder, or any `.derived` content. Show only the built site, the IDE and the repository docs.
- Show champion names as text only (the app already does this). Do not add Riot art or logos.
- If the IDE shot is a still, use `qa/ide-02.png` and say so on screen ("IntelliJ IDEA 2026.3 inspection results").
- Keep the cut at or under 2:50 including the end card. The table adds up to 2:45, so the end card must stay under 5 seconds.
- Upload to YouTube as public, with the captions, and put the link in the submission form.
