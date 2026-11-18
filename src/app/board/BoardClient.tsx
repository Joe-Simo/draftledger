"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeamAggregate } from "@/lib/aggregate";
import {
  DRAFT_ORDER,
  boardReducer,
  defaultConfig,
  deriveView,
  initialState,
  unavailableReason,
  validState,
  type BoardCommand,
  type BoardConfig,
  type BoardState,
  type RolePool,
  type SeriesFormat,
  type TeamKey,
} from "@/lib/board";
import {
  initials,
  leaguePools,
  parsePoolText,
  poolsFromTeam,
  resolvePickRole,
  type ChampionInfo,
} from "@/lib/champions";
import { buildForecast } from "@/lib/forecast";
import { buildInsights, insightContext } from "@/lib/insights";
import { emptyPlans, normalizePlans, ourTeam, planSuggestion, type GamePlan } from "@/lib/plan";
import { buildPrepSheet } from "@/lib/prep";
import { SHORTCUTS, shortcutFor } from "@/lib/shortcuts";
import { applyScoutSetup, nextGameOutlook, suggestForStep } from "@/lib/suggest";
import { ROLES, type Role } from "@/lib/types";
import { PlanPanel } from "./PlanPanel";
import { InsightsPanel, OutlookPanel, PrepSheetPanel, SuggestionsPanel } from "./ScoutingPanels";

const STORAGE_KEY = "draftledger.board.v1";
const PLANS_KEY = "draftledger.plans.v1";
/** Set at build time for GitHub Pages project sites; plain fetch calls are not prefixed by Next.js. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TEAMS: TeamKey[] = ["A", "B"];

const badge: Record<RolePool["status"], string> = {
  ok: "bg-emerald-100 text-emerald-800",
  thin: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
  unset: "bg-zinc-100 text-zinc-600",
};

export function BoardClient() {
  const [state, setState] = useState<BoardState>(() => initialState());
  const [config, setConfig] = useState<BoardConfig>(() => defaultConfig());
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [teams, setTeams] = useState<TeamAggregate[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "auto">("auto");
  const [showSetup, setShowSetup] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [announce, setAnnounce] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [plans, setPlans] = useState<GamePlan[]>(() => emptyPlans());
  const [generated, setGenerated] = useState(() => new Date().toISOString().slice(0, 10));

  // Hydrate from localStorage after mount: reading it during render would break static export hydration.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (validState(parsed)) {
          setState(parsed);
          setConfig(parsed.config);
          setShowSetup(parsed.log.length === 0);
        }
      }
      const rawPlans = localStorage.getItem(PLANS_KEY);
      if (rawPlans) setPlans(normalizePlans(JSON.parse(rawPlans)));
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`${BASE_PATH}/data/champions.json`)
      .then((r) => r.json())
      .then((d: { champions: ChampionInfo[] }) => setChampions(d.champions))
      .catch(() => undefined);
    fetch(`${BASE_PATH}/data/teams.json`)
      .then((r) => r.json())
      .then((d: { teams: TeamAggregate[] }) => setTeams(d.teams))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  }, [plans, ready]);

  const view = useMemo(() => deriveView(state.config, state.log), [state]);
  const info = useMemo(() => new Map(champions.map((c) => [c.name, c])), [champions]);

  const dispatch = useCallback(
    (cmd: BoardCommand) => {
      const r = boardReducer(state, cmd);
      setState(r.state);
      setError(r.error ?? null);
    },
    [state],
  );

  const scout = state.config.scout;
  const opponent = useMemo(() => teams.find((x) => x.teamId === scout?.opponentId), [teams, scout]);
  const own = useMemo(() => teams.find((x) => x.teamId === scout?.ownId), [teams, scout]);
  const suggestions = useMemo(
    () => (scout && opponent ? suggestForStep({ config: state.config, view, scout, opponent, own, champions }) : null),
    [state.config, view, scout, opponent, own, champions],
  );
  const outlook = useMemo(
    () => (opponent ? nextGameOutlook({ config: state.config, view, opponent }) : null),
    [state.config, view, opponent],
  );
  const insights = useMemo(
    () => (opponent ? buildInsights(opponent, insightContext(state.config, view)) : null),
    [opponent, state.config, view],
  );
  const sheet = useMemo(
    () => (opponent && scout ? buildPrepSheet(state.config, state.log, opponent, generated) : null),
    [state.config, state.log, opponent, scout, generated],
  );

  const championNames = useMemo(() => champions.map((c) => c.name), [champions]);
  const knownNames = useMemo(() => (champions.length ? new Set(championNames) : null), [champions.length, championNames]);
  const forecast = useMemo(() => buildForecast(state.config, view, plans, knownNames), [state.config, view, plans, knownNames]);
  const planNow = useMemo(() => {
    const game = view.current?.number;
    return game ? planSuggestion(state.config, view, plans[game - 1]) : null;
  }, [state.config, view, plans]);

  const names = (t: TeamKey) => state.config.teams[t].name || `Team ${t}`;
  const cur = view.current;
  const filled = (team: TeamKey): Role[] =>
    (cur?.actions ?? []).filter((a) => a.team === team && a.role).map((a) => a.role as Role);

  const q = query.trim().toLowerCase();
  const matches = q ? champions.filter((c) => c.name.toLowerCase().includes(q)) : [];
  const visible = q ? matches.slice(0, 18) : showAll ? champions : [];
  const firstOpen = visible.find((c) => !view.next || !unavailableReason(state.config, view, c.name));

  function choose(name: string) {
    if (!view.next) return;
    if (view.next.kind === "ban") {
      dispatch({ type: "event", event: { t: "ban", champion: name } });
      setAnnounce(`${names(view.next.team)} banned ${name}`);
    } else {
      const team = view.next.team;
      const poolRoles = ROLES.filter((x) => state.config.teams[team].pool[x].includes(name));
      const r = resolvePickRole(role, info.get(name), filled(team), poolRoles);
      if (!r) return setError("All five roles are filled for this team.");
      dispatch({ type: "event", event: { t: "pick", champion: name, role: r } });
      setAnnounce(`${names(team)} picked ${name} as ${r}`);
    }
    setQuery("");
    setRole("auto");
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function skipBan() {
    if (view.next?.kind !== "ban") return;
    dispatch({ type: "event", event: { t: "ban", champion: null } });
    setAnnounce(`${names(view.next.team)} skipped the ban`);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function undo() {
    dispatch({ type: "undo" });
    setAnnounce("Undid the last draft event");
  }

  function redo() {
    dispatch({ type: "redo" });
    setAnnounce("Redid the draft event");
  }

  // Keyboard shortcuts, documented in the "Keyboard shortcuts" panel. Handlers read the latest state on every render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const action = shortcutFor(e, typing);
      if (!action) return;
      if (action === "clear-search") {
        if (typing && el !== searchRef.current) return;
        setQuery("");
        return;
      }
      e.preventDefault();
      if (action === "focus-search") searchRef.current?.focus();
      else if (action === "undo" && state.log.length) undo();
      else if (action === "redo" && state.redo.length) redo();
      else if (action === "take-plan" && planNow?.champion) choose(planNow.champion);
      else if (action === "skip-ban") skipBan();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function applySetup() {
    dispatch({ type: "configure", config: applyScoutSetup(config, teams) });
    setConfig((c) => applyScoutSetup(c, teams));
    setShowSetup(false);
  }

  function applyScoutOnly() {
    const next = applyScoutSetup(config, teams);
    setConfig(next);
    dispatch({ type: "scout", scout: next.scout, teams: next.teams });
    setShowSetup(false);
  }

  /** Change who is scouted, which side they play and who we are; names and pools follow. */
  function updateScout(patch: { opponentId?: string; opponent?: TeamKey; ownId?: string | undefined }, swapSides = false) {
    setConfig((c) => {
      let base = c;
      if (swapSides) {
        base = { ...c, teams: { A: c.teams.B, B: c.teams.A }, firstBlue: c.firstBlue === "A" ? "B" : "A" };
      }
      const prev = base.scout;
      const opponentId = "opponentId" in patch ? patch.opponentId : prev?.opponentId;
      if (!opponentId) return { ...base, scout: undefined };
      const scout = {
        opponent: patch.opponent ?? prev?.opponent ?? "B",
        opponentId,
        ownId: "ownId" in patch ? patch.ownId : prev?.ownId,
      };
      return applyScoutSetup({ ...base, scout }, teams);
    });
  }

  function setPool(team: TeamKey, r: Role, text: string) {
    setConfig((c) => ({
      ...c,
      teams: { ...c.teams, [team]: { ...c.teams[team], pool: { ...c.teams[team].pool, [r]: parsePoolText(text) } } },
    }));
  }

  function loadPreset(team: TeamKey, id: string) {
    const t = teams.find((x) => x.teamId === id);
    if (!t) return;
    const pools = poolsFromTeam(t, 2);
    setConfig((c) => ({ ...c, teams: { ...c.teams, [team]: { ...c.teams[team], name: t.name, pool: pools } } }));
  }

  function loadLeague(team: TeamKey) {
    const pools = leaguePools(champions);
    setConfig((c) => ({ ...c, teams: { ...c.teams, [team]: { ...c.teams[team], pool: pools } } }));
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="no-print flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Series board</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          Team reports
        </Link>
      </div>
      <p className="no-print mt-1 text-sm text-zinc-500">
        Standard LoL draft, Fearless lock across games, per-role pools. Saved in this browser only.
      </p>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <details className="no-print mt-3 text-sm">
        <summary className="cursor-pointer font-medium">Keyboard shortcuts</summary>
        <table className="mt-2 text-left">
          <caption className="sr-only">Keyboard shortcuts of the series board</caption>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <th scope="row" className="pr-4 font-mono text-xs font-normal">
                  {s.keys}
                </th>
                <td className="py-0.5">{s.does}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="pr-4 font-mono text-xs font-normal">
                Tab and Shift+Tab
              </th>
              <td className="py-0.5">Move between controls in reading order: setup, draft step, plan, pools, prep sheet.</td>
            </tr>
          </tbody>
        </table>
      </details>

      <section className="no-print mt-4 rounded border border-zinc-300 p-4 dark:border-zinc-700" aria-label="Series setup">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            className="font-medium underline-offset-2 hover:underline"
            aria-expanded={showSetup}
            aria-controls="setup-body"
            onClick={() => setShowSetup((s) => !s)}
          >
            {showSetup ? "Hide setup" : "Show setup"}
          </button>
          {!showSetup ? (
            <span className="text-zinc-500">
              Bo{state.config.format}, {state.config.fearless ? "Fearless" : "standard"}, {names("A")} vs {names("B")}
              {opponent ? `, scouting ${opponent.name}` : ""}
            </span>
          ) : null}
        </div>
        {showSetup ? (
          <div id="setup-body" className="mt-3 space-y-4">
            <div className="flex flex-wrap items-end gap-4 text-sm">
              <label>
                Format
                <select
                  className="ml-2 rounded border border-zinc-300 bg-transparent px-2 py-1"
                  value={config.format}
                  onChange={(e) => setConfig({ ...config, format: Number(e.target.value) as SeriesFormat })}
                >
                  <option value={1}>Bo1</option>
                  <option value={3}>Bo3</option>
                  <option value={5}>Bo5</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={config.fearless} onChange={(e) => setConfig({ ...config, fearless: e.target.checked })} />
                Fearless Draft
              </label>
              <label>
                Blue side in game 1
                <select
                  className="ml-2 rounded border border-zinc-300 bg-transparent px-2 py-1"
                  value={config.firstBlue}
                  onChange={(e) => setConfig({ ...config, firstBlue: e.target.value as TeamKey })}
                >
                  <option value="A">{config.teams.A.name}</option>
                  <option value="B">{config.teams.B.name}</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {TEAMS.map((t) => (
                <div key={t} className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label={`Team ${t} name`}
                      className="w-40 rounded border border-zinc-300 bg-transparent px-2 py-1 font-medium"
                      value={config.teams[t].name}
                      onChange={(e) =>
                        setConfig({ ...config, teams: { ...config.teams, [t]: { ...config.teams[t], name: e.target.value } } })
                      }
                    />
                    <select
                      aria-label={`Load ${t} pool from a team`}
                      className="rounded border border-zinc-300 bg-transparent px-2 py-1"
                      defaultValue=""
                      onChange={(e) => loadPreset(t, e.target.value)}
                    >
                      <option value="">Load team pool...</option>
                      {teams.map((x) => (
                        <option key={x.teamId} value={x.teamId}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <button className="rounded border border-zinc-300 px-2 py-1" onClick={() => loadLeague(t)}>
                      League pool
                    </button>
                  </div>
                  {ROLES.map((r) => (
                    <label key={r} className="block">
                      <span className="inline-block w-16 capitalize text-zinc-500">{r}</span>
                      <input
                        aria-label={`${t} ${r} pool`}
                        className="w-[calc(100%-4.5rem)] rounded border border-zinc-300 bg-transparent px-2 py-1"
                        placeholder="Champions, comma separated"
                        value={config.teams[t].pool[r].join(", ")}
                        onChange={(e) => setPool(t, r, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label>
                Scouted opponent
                <select
                  aria-label="Scouted opponent"
                  className="ml-2 rounded border border-zinc-300 bg-transparent px-2 py-1"
                  value={config.scout?.opponentId ?? ""}
                  onChange={(e) => updateScout({ opponentId: e.target.value || undefined })}
                >
                  <option value="">None</option>
                  {teams.map((x) => (
                    <option key={x.teamId} value={x.teamId}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                plays as
                <select
                  aria-label="Scouted side of the board"
                  className="ml-2 rounded border border-zinc-300 bg-transparent px-2 py-1"
                  value={config.scout?.opponent ?? "B"}
                  onChange={(e) => updateScout({ opponent: e.target.value as TeamKey }, !!config.scout && e.target.value !== config.scout.opponent)}
                >
                  <option value="A">Team A</option>
                  <option value="B">Team B</option>
                </select>
              </label>
              <label>
                Our team (for pick ideas)
                <select
                  aria-label="Our team"
                  className="ml-2 rounded border border-zinc-300 bg-transparent px-2 py-1"
                  value={config.scout?.ownId ?? ""}
                  onChange={(e) => updateScout({ ownId: e.target.value || undefined })}
                >
                  <option value="">League-wide</option>
                  {teams.map((x) => (
                    <option key={x.teamId} value={x.teamId}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900" onClick={applySetup}>
                Start new series (clears the draft)
              </button>
              <button
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
                onClick={applyScoutOnly}
              >
                Apply scouting only (keeps the draft)
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="no-print mt-6" aria-labelledby="draft-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="draft-heading" className="text-lg font-semibold">
            {names("A")} {view.score.A} : {view.score.B} {names("B")}
          </h2>
          <span className="text-sm text-zinc-500">
            Bo{state.config.format}, {state.config.fearless ? "Fearless" : "standard"}
          </span>
          {view.games.some((g) => g.winner) ? (
            <span className="text-sm" aria-label="Game results">
              {view.games
                .filter((g) => g.winner)
                .map((g) => `G${g.number}: ${names(g.winner!)}`)
                .join(", ")}
            </span>
          ) : null}
          <div className="ml-auto flex gap-2 text-sm">
            <button className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40" disabled={state.log.length === 0} aria-keyshortcuts="Control+Z" onClick={undo}>
              Undo
            </button>
            <button className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40" disabled={state.redo.length === 0} aria-keyshortcuts="Control+Shift+Z" onClick={redo}>
              Redo
            </button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {view.phase === "done" ? (
          <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Series over. {names(view.winner!)} wins {view.score[view.winner!]}-{view.score[view.winner === "A" ? "B" : "A"]}.
          </p>
        ) : cur ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <strong>Game {cur.number}</strong>
              <span>
                Blue: {names(cur.blue)}, Red: {names(cur.red)}
              </span>
              {cur.actions.length === 0 ? (
                <button
                  className="rounded border border-zinc-300 px-2 py-1"
                  onClick={() => dispatch({ type: "event", event: { t: "side", blue: cur.red } })}
                >
                  Swap sides
                </button>
              ) : null}
              <span className="text-zinc-500">Side defaults to the loser of the previous game.</span>
            </div>

            <DraftStrip view={view} names={names} />

            {planNow ? (
              <div role="group" className="flex flex-wrap items-center gap-2 rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950" aria-label="Plan says">
                <strong>Your plan says:</strong>
                {planNow.champion ? (
                  <>
                    <button className="rounded bg-sky-900 px-2 py-0.5 text-white" aria-keyshortcuts="Alt+P" onClick={() => choose(planNow.champion!)}>
                      {view.next!.kind} {planNow.champion}
                    </button>
                    <span>{planNow.reason}{planNow.alternatives.length ? `. Then: ${planNow.alternatives.slice(0, 3).join(", ")}` : ""}</span>
                  </>
                ) : (
                  <span>{planNow.reason}</span>
                )}
              </div>
            ) : null}
            {view.next ? <SuggestionsPanel data={suggestions} onPick={choose} /> : null}
            <OutlookPanel data={outlook} />

            {view.next ? (
              <div className="rounded border border-zinc-300 p-3 dark:border-zinc-700">
                <p className="text-sm">
                  Step {cur.actions.length + 1} of {DRAFT_ORDER.length}:{" "}
                  <strong>
                    {names(view.next.team)} ({view.next.side}) {view.next.kind}
                  </strong>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input
                    ref={searchRef}
                    aria-label="Search champions"
                    aria-keyshortcuts="/"
                    className="rounded border border-zinc-300 bg-transparent px-2 py-1"
                    placeholder="Search champion, Enter to pick"
                    value={query}
                    autoComplete="off"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && q) choose(firstOpen?.name ?? query.trim());
                    }}
                  />
                  {view.next.kind === "pick" ? (
                    <label>
                      Role{" "}
                      <select className="rounded border border-zinc-300 bg-transparent px-2 py-1" value={role !== "auto" && filled(view.next.team).includes(role) ? "auto" : role} onChange={(e) => setRole(e.target.value as Role | "auto")}>
                        <option value="auto">auto</option>
                        {ROLES.filter((r) => !filled(view.next!.team).includes(r)).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <button className="rounded border border-zinc-300 px-2 py-1" aria-keyshortcuts="Alt+B" onClick={skipBan}>
                      Skip ban
                    </button>
                  )}
                  {query.trim() && !champions.some((c) => c.name.toLowerCase() === query.trim().toLowerCase()) ? (
                    <button className="rounded border border-zinc-300 px-2 py-1" onClick={() => choose(query.trim())}>
                      Use &ldquo;{query.trim()}&rdquo;
                    </button>
                  ) : null}
                </div>
                <ul className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                  {visible.map((c) => {
                    const reason = unavailableReason(state.config, view, c.name);
                    return (
                      <li key={c.name}>
                        <button
                          className="flex items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 text-left text-xs enabled:hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:enabled:hover:bg-zinc-900"
                          disabled={!!reason}
                          title={reason ?? undefined}
                          aria-label={reason ? `${c.name}, unavailable: ${reason}` : `${view.next!.kind === "ban" ? "Ban" : "Pick"} ${c.name}`}
                          onClick={() => choose(c.name)}
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-zinc-200 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {initials(c.name)}
                          </span>
                          <span>{c.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {q && matches.length === 0 && champions.length > 0 ? (
                  <p className="mt-2 text-xs text-zinc-500" role="status">
                    No champion matches &ldquo;{query.trim()}&rdquo;. Press Enter to use it as typed, or check the spelling.
                  </p>
                ) : null}
                {!q && !showAll ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Type a name and press Enter, click a suggestion above, or{" "}
                    <button className="underline" onClick={() => setShowAll(true)}>
                      browse all champions
                    </button>
                    .
                  </p>
                ) : null}
                {showAll && !q ? (
                  <button className="mt-1 text-xs underline" onClick={() => setShowAll(false)}>
                    Hide the full list
                  </button>
                ) : null}
                {q && matches.length > visible.length ? (
                  <p className="mt-1 text-xs text-zinc-500">{matches.length - visible.length} more, keep typing to narrow.</p>
                ) : null}
                {champions.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Loading champion list...</p> : null}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded border border-zinc-300 p-3 text-sm dark:border-zinc-700">
                <span>Draft complete. Who won game {cur.number}?</span>
                {TEAMS.map((t) => (
                  <button key={t} className="rounded bg-zinc-900 px-3 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900" onClick={() => dispatch({ type: "event", event: { t: "result", winner: t } })}>
                    {names(t)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {opponent && insights ? (
        <div className="mt-8">
          <InsightsPanel result={insights} opponent={opponent} />
        </div>
      ) : (
        <p className="no-print mt-8 text-sm text-zinc-500">Pick a scouted opponent in the setup to see suggestions, insights and the prep sheet.</p>
      )}

      <PlanPanel
        plans={plans}
        forecast={forecast}
        names={championNames}
        format={state.config.format}
        currentGame={view.current?.number ?? 0}
        teamName={names(ourTeam(state.config))}
        onChange={(i, p) => setPlans((all) => all.map((x, k) => (k === i ? p : x)))}
      />

      <section className="no-print mt-8" aria-labelledby="pools-heading">
        <h2 id="pools-heading" className="text-lg font-semibold">Role pools</h2>
        <p className="text-sm text-zinc-500">
          Remaining champions per role after Fearless locks. Needed counts the games each role may still have to fill in
          the worst case; thin means fewer than needed plus two spares.
        </p>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          {TEAMS.map((t) => (
            <div key={t}>
              <h3 className="font-medium">{names(t)}</h3>
              <table className="mt-1 w-full text-left text-sm">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Role</th>
                    <th className="py-1 pr-2 font-medium">Left / needed</th>
                    <th className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {view.pools[t].map((p) => (
                    <tr key={p.role} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                      <td className="py-1 pr-2 capitalize">{p.role}</td>
                      <td className="py-1 pr-2">
                        {p.pool.length === 0 ? (
                          "no pool set"
                        ) : (
                          <details>
                            <summary className="cursor-pointer">
                              {p.remaining.length} / {p.needed}
                            </summary>
                            <p className="text-xs text-zinc-500">{p.remaining.join(", ") || "none left"}</p>
                          </details>
                        )}
                      </td>
                      <td className="py-1">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${badge[p.status]}`}>{p.status}</span>
                        {p.status === "thin" || p.status === "critical" ? (
                          <span className="ml-2 text-xs text-zinc-500">
                            {p.status === "critical" ? "cannot cover every remaining game" : "running low"}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {sheet ? <PrepSheetPanel sheet={sheet} onRefresh={() => setGenerated(new Date().toISOString().slice(0, 10))} /> : null}

    </main>
  );
}

function DraftStrip({ view, names }: { view: ReturnType<typeof deriveView>; names: (t: TeamKey) => string }) {
  const cur = view.current!;
  const sideTeam = { blue: cur.blue, red: cur.red };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(["blue", "red"] as const).map((side) => (
        <div key={side} className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <h3 className={`font-medium ${side === "blue" ? "text-blue-700" : "text-red-700"}`}>
            {names(sideTeam[side])} ({side})
          </h3>
          {(["ban", "pick"] as const).map((kind) => {
            const slots = DRAFT_ORDER.map((s, i) => ({ s, i })).filter(({ s }) => s.side === side && s.kind === kind);
            return (
              <ol key={kind} className="mt-1 flex flex-wrap gap-1">
                <li className="w-10 text-xs uppercase text-zinc-500">{kind}s</li>
                {slots.map(({ i }) => {
                  const a = cur.actions[i];
                  return (
                    <li
                      key={i}
                      className={`min-w-20 rounded border px-1.5 py-0.5 text-xs ${a ? "border-zinc-400" : "border-dashed border-zinc-300 text-zinc-400"}`}
                    >
                      {a ? (a.champion ?? "skipped") : "..."}
                      {a?.role ? <span className="text-zinc-500"> ({a.role})</span> : null}
                    </li>
                  );
                })}
              </ol>
            );
          })}
        </div>
      ))}
    </div>
  );
}
