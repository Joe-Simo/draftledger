# Accessibility notes

Checked on 2026-11-18 against the static export, light and dark system themes, with axe-core 4.x (WCAG 2.0 A and AA, 2.1 AA and best practices) run in headless Chrome, plus a keyboard-only run of a full 20-step draft.

## Automated results

| Page | Light | Dark |
| --- | --- | --- |
| Home | 0 violations | 0 violations |
| Team report | 0 | 0 |
| `/board` empty | 0 | 0 |
| `/board` with a scouted series and a game plan | 0 | 0 |

Before this pass dark mode failed color contrast on 45 to 64 elements per page (muted text, side headings, status text on the dark background) and the board had a heading level skip. Muted and status text colors now switch to lighter equivalents in dark mode and headings follow h1, h2, h3.

`tests/a11y.test.ts` checks, without a browser, that:

- the keyboard shortcut mapping matches the documented list and does not steal keys while typing;
- the light theme color pairs used for text, badges, alerts and the focus outline reach 4.5:1;
- every text color in the dark-mode block of `globals.css` reaches 4.5:1 on the dark background (it parses the real CSS);
- every page has a skip link target (`<main id="main">`).

ESLint (`eslint-config-next`) includes the `jsx-a11y` rules and runs in CI-style checks.

## Keyboard-only draft flow (manual checklist)

1. Load `/board/`. Press `Tab` from the top: a "Skip to main content" link comes first, then the page links, the shortcuts panel, setup controls, draft controls, plan, pools and prep sheet, in reading order.
2. Open "Keyboard shortcuts" (a disclosure, `Enter` or `Space`) to read the list below.
3. Press `/` to jump to the champion search. Type part of a name and press `Enter`: the first champion that is still available is picked or banned, the search clears, and focus returns to the search box.
4. Role defaults to the champion's most common unfilled role; change it with the Role select before pressing `Enter`.
5. `Alt+P` takes the move the game plan suggests. `Alt+B` skips a ban. `Ctrl+Z` and `Ctrl+Shift+Z` undo and redo.
6. When the draft is complete, `Tab` to the "Who won" buttons and press `Enter`.
7. A visually hidden live region announces each pick, ban, skip, undo and redo (for example "Team B picked Ziggs as bot").

| Keys | Action |
| --- | --- |
| `/` | Jump to the champion search |
| `Esc` | Clear the search |
| `Enter` in the search | Pick or ban the first available match |
| `Ctrl+Z`, `Ctrl+Shift+Z` (or `Ctrl+Y`) | Undo, redo |
| `Alt+P` | Take the plan's suggested move |
| `Alt+B` | Skip this ban |

Result of the scripted run: all 20 steps completed with the keyboard only, `Ctrl+Z` undid a step and was announced, and no page errors were logged. Focus is shown by a 2px outline (blue on light, light blue on dark).

## Other notes

- Unavailable champions are disabled buttons with an accessible name that includes the reason (for example "Azir, unavailable: Fearless lock, picked in game 1").
- Empty states are written out: no pool set, no plan yet, no champion matches the search (with what to do), no scouted opponent.
- Panels have labels (`Series setup`, `Game plans`, `Plan says`, `Role pools`, the draft section) and the setup toggle uses `aria-expanded` and `aria-controls`.
- Status is not shown by color alone: badges carry words (`ok`, `thin`, `critical`, `unset`, `locked`, `unknown`).

## Not done

- No screen reader pass with a real assistive technology (NVDA, VoiceOver). Only automated checks and keyboard operation were tested.
- Print layout contrast was not measured.
- The champion list is shown as text chips; there is no roving-tabindex grid, so tabbing through a long full list is slow (search first is the intended path).
