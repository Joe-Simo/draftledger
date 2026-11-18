"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  suggestRole,
  type ChampionInfo,
} from "@/lib/champions";
import { ROLES, type Role } from "@/lib/types";

const STORAGE_KEY = "draftledger.board.v1";
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
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/data/champions.json")
      .then((r) => r.json())
      .then((d: { champions: ChampionInfo[] }) => setChampions(d.champions))
      .catch(() => undefined);
    fetch("/data/teams.json")
      .then((r) => r.json())
      .then((d: { teams: TeamAggregate[] }) => setTeams(d.teams))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, ready]);

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

  const names = (t: TeamKey) => state.config.teams[t].name || `Team ${t}`;
  const cur = view.current;
  const filled = (team: TeamKey): Role[] =>
    (cur?.actions ?? []).filter((a) => a.team === team && a.role).map((a) => a.role as Role);

  const visible = champions.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  function choose(name: string) {
    if (!view.next) return;
    if (view.next.kind === "ban") dispatch({ type: "event", event: { t: "ban", champion: name } });
    else {
      const r = role === "auto" ? suggestRole(info.get(name), filled(view.next.team)) : role;
      if (!r) return setError("All five roles are filled for this team.");
      dispatch({ type: "event", event: { t: "pick", champion: name, role: r } });
    }
    setQuery("");
  }

  function applySetup() {
    dispatch({ type: "configure", config });
    setShowSetup(false);
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
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Series board</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          Team reports
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Standard LoL draft, Fearless lock across games, per-role pools. Saved in this browser only.
      </p>

      <section className="mt-4 rounded border border-zinc-300 p-4 dark:border-zinc-700">
        <button className="text-sm font-medium underline-offset-2 hover:underline" onClick={() => setShowSetup((s) => !s)}>
          {showSetup ? "Hide setup" : "Show setup"}
        </button>
        {showSetup ? (
          <div className="mt-3 space-y-4">
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
            <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900" onClick={applySetup}>
              Start new series (clears the draft)
            </button>
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">
            {names("A")} {view.score.A} : {view.score.B} {names("B")}
          </h2>
          <span className="text-sm text-zinc-500">
            Bo{state.config.format}, {state.config.fearless ? "Fearless" : "standard"}
          </span>
          <div className="ml-auto flex gap-2 text-sm">
            <button className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40" disabled={state.log.length === 0} onClick={() => dispatch({ type: "undo" })}>
              Undo
            </button>
            <button className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40" disabled={state.redo.length === 0} onClick={() => dispatch({ type: "redo" })}>
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
                    aria-label="Search champions"
                    className="rounded border border-zinc-300 bg-transparent px-2 py-1"
                    placeholder="Search champion"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {view.next.kind === "pick" ? (
                    <label>
                      Role{" "}
                      <select className="rounded border border-zinc-300 bg-transparent px-2 py-1" value={role} onChange={(e) => setRole(e.target.value as Role | "auto")}>
                        <option value="auto">auto</option>
                        {ROLES.filter((r) => !filled(view.next!.team).includes(r)).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <button className="rounded border border-zinc-300 px-2 py-1" onClick={() => dispatch({ type: "event", event: { t: "ban", champion: null } })}>
                      Skip ban
                    </button>
                  )}
                  {query.trim() && !champions.some((c) => c.name.toLowerCase() === query.trim().toLowerCase()) ? (
                    <button className="rounded border border-zinc-300 px-2 py-1" onClick={() => choose(query.trim())}>
                      Use &ldquo;{query.trim()}&rdquo;
                    </button>
                  ) : null}
                </div>
                <ul className="mt-3 grid max-h-64 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
                  {visible.map((c) => {
                    const reason = unavailableReason(state.config, view, c.name);
                    return (
                      <li key={c.name}>
                        <button
                          className="flex w-full items-center gap-2 rounded border border-zinc-200 px-2 py-1 text-left text-sm enabled:hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:enabled:hover:bg-zinc-900"
                          disabled={!!reason}
                          title={reason ?? undefined}
                          onClick={() => choose(c.name)}
                        >
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {initials(c.name)}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
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

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Role pools</h2>
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

      <footer className="mt-10 text-xs text-zinc-500">
        DraftLedger is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone
        officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are
        trademarks or registered trademarks of Riot Games, Inc. Champion names are shown as text only; the two-letter
        badges are generic initials, not game art. Built with AI coding agents directed by Joe Simo.
      </footer>
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
