"use client";

import { useState } from "react";
import type { SeriesForecast, GameStatus } from "@/lib/forecast";
import type { Branch, GamePlan, PlanIssue } from "@/lib/plan";

const statusBadge: Record<GameStatus, string> = {
  empty: "bg-zinc-100 text-zinc-600",
  ready: "bg-emerald-100 text-emerald-800",
  warnings: "bg-amber-100 text-amber-800",
  errors: "bg-red-100 text-red-800",
};
const statusText: Record<GameStatus, string> = { empty: "empty", ready: "ok", warnings: "warnings", errors: "errors" };

function ChampionList({
  label,
  items,
  issues,
  names,
  onChange,
}: {
  label: string;
  items: string[];
  issues: PlanIssue[];
  names: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = `plan-names-${label.replace(/\s+/g, "-")}`;
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const exact = names.find((n) => n.toLowerCase() === v.toLowerCase());
    onChange([...items, exact ?? v]);
    setDraft("");
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      <h4 className="text-sm font-medium">{label}</h4>
      <ol className="mt-1 space-y-1 text-sm">
        {items.map((c, i) => {
          const own = issues.filter((x) => x.champion === c);
          return (
            <li key={`${c}-${i}`} className="flex items-center gap-1">
              <span className="w-5 text-right text-zinc-500">{i + 1}.</span>
              <span className={own.some((x) => x.level === "error") ? "text-red-700" : ""}>{c}</span>
              {own.map((x) => (
                <span key={x.code} className={`rounded px-1 text-xs ${x.level === "error" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                  {x.code === "LOCKED_PICK" || x.code === "LOCKED_BAN_WASTE" ? "locked" : x.code === "UNKNOWN_CHAMPION" ? "unknown" : x.code === "DUPLICATE" ? "twice" : "ban+pick"}
                </span>
              ))}
              <span className="ml-auto flex gap-1">
                <button className="rounded border border-zinc-300 px-1 text-xs" aria-label={`Move ${c} up`} onClick={() => move(i, -1)}>
                  up
                </button>
                <button className="rounded border border-zinc-300 px-1 text-xs" aria-label={`Move ${c} down`} onClick={() => move(i, 1)}>
                  down
                </button>
                <button className="rounded border border-zinc-300 px-1 text-xs" aria-label={`Remove ${c}`} onClick={() => onChange(items.filter((_, k) => k !== i))}>
                  remove
                </button>
              </span>
            </li>
          );
        })}
        {items.length === 0 ? <li className="text-zinc-500">None yet.</li> : null}
      </ol>
      <div className="mt-2 flex gap-1">
        <input
          list={listId}
          aria-label={`Add to ${label}`}
          className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm"
          placeholder="Champion, Enter to add"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <datalist id={listId}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button className="rounded border border-zinc-300 px-2 py-1 text-sm" onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}

function BranchEditor({ branches, names, onChange }: { branches: Branch[]; names: string[]; onChange: (b: Branch[]) => void }) {
  const [when, setWhen] = useState<"ban" | "pick">("ban");
  const [trigger, setTrigger] = useState("");
  const [then, setThen] = useState<"ban" | "pick">("pick");
  const [response, setResponse] = useState("");
  const fix = (v: string) => names.find((n) => n.toLowerCase() === v.trim().toLowerCase()) ?? v.trim();
  const add = () => {
    const champions = response.split(",").map(fix).filter(Boolean);
    if (!trigger.trim() || champions.length === 0) return;
    const id = `b${Date.now().toString(36)}`;
    onChange([...branches, { id, when: { action: when, champion: fix(trigger) }, then: { action: then, champions } }]);
    setTrigger("");
    setResponse("");
  };
  const sel = "rounded border border-zinc-300 bg-transparent px-1 py-1 text-sm";
  return (
    <div>
      <h4 className="text-sm font-medium">If they... we...</h4>
      <ul className="mt-1 space-y-1 text-sm">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center gap-2">
            <span>
              If they {b.when.action} {b.when.champion}, we {b.then.action} {b.then.champions.join(" > ")}
            </span>
            <button className="ml-auto rounded border border-zinc-300 px-1 text-xs" aria-label={`Remove branch ${b.id}`} onClick={() => onChange(branches.filter((x) => x.id !== b.id))}>
              remove
            </button>
          </li>
        ))}
        {branches.length === 0 ? <li className="text-zinc-500">No branches yet.</li> : null}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
        If they
        <select aria-label="Trigger action" className={sel} value={when} onChange={(e) => setWhen(e.target.value as "ban" | "pick")}>
          <option value="ban">ban</option>
          <option value="pick">pick</option>
        </select>
        <input list="plan-names-branch" aria-label="Trigger champion" className={`${sel} w-32`} placeholder="Champion" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
        we
        <select aria-label="Response action" className={sel} value={then} onChange={(e) => setThen(e.target.value as "ban" | "pick")}>
          <option value="pick">pick</option>
          <option value="ban">ban</option>
        </select>
        <input aria-label="Response champions" list="plan-names-branch" className={`${sel} w-48`} placeholder="Champions, comma separated" value={response} onChange={(e) => setResponse(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <datalist id="plan-names-branch">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button className="rounded border border-zinc-300 px-2 py-1" onClick={add}>
          Add branch
        </button>
      </div>
    </div>
  );
}

export function PlanPanel({
  plans,
  forecast,
  names,
  format,
  currentGame,
  teamName,
  onChange,
}: {
  plans: GamePlan[];
  forecast: SeriesForecast;
  names: string[];
  format: number;
  currentGame: number;
  teamName: string;
  onChange: (index: number, plan: GamePlan) => void;
}) {
  const [sel, setSel] = useState(0);
  const idx = Math.min(sel, format - 1);
  const plan = plans[idx];
  const gf = forecast.games[idx];
  const set = (patch: Partial<GamePlan>) => onChange(idx, { ...plan, ...patch });
  return (
    <section className="no-print mt-8" aria-label="Game plans">
      <h2 className="text-lg font-semibold">Game plans for {teamName}</h2>
      <p className="text-sm text-zinc-500">
        Write the bans, picks and if-they-then-we branches for each game before the series. Checks run live against the
        Fearless locks each game will face, real ones from drafted games and projected ones from your earlier plans. The
        plan also shows its next move in the draft step.
      </p>
      <div role="tablist" className="mt-3 flex flex-wrap gap-2">
        {forecast.games.map((g, i) => (
          <button
            key={g.game}
            role="tab"
            aria-selected={i === idx}
            className={`rounded border px-3 py-1 text-sm ${i === idx ? "border-zinc-900 font-medium dark:border-zinc-100" : "border-zinc-300"}`}
            onClick={() => setSel(i)}
          >
            Game {g.game}{" "}
            <span className={`ml-1 rounded px-1 text-xs ${statusBadge[g.status]}`}>{statusText[g.status]}</span>
            {g.played ? <span className="ml-1 text-xs text-zinc-500">played</span> : g.game === currentGame ? <span className="ml-1 text-xs text-zinc-500">current</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <ChampionList label="Ban targets" items={plan.bans} issues={gf.issues} names={names} onChange={(bans) => set({ bans })} />
        <ChampionList label="Pick priorities" items={plan.picks} issues={gf.issues} names={names} onChange={(picks) => set({ picks })} />
      </div>
      <div className="mt-4">
        <BranchEditor branches={plan.branches} names={names} onChange={(branches) => set({ branches })} />
      </div>
      <label className="mt-4 block text-sm">
        Notes
        <textarea className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1" rows={2} value={plan.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <button className="mt-2 rounded border border-zinc-300 px-2 py-1 text-sm" onClick={() => onChange(idx, { bans: [], picks: [], branches: [], notes: "" })}>
        Clear game {idx + 1} plan
      </button>

      <div className="mt-4 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800" aria-live="polite">
        <h3 className="font-medium">Checks for game {idx + 1}</h3>
        {gf.lockedActual.length + gf.lockedProjected.length > 0 ? (
          <p className="mt-1 text-zinc-600">
            Locked by then: {gf.lockedActual.join(", ") || "nothing drafted yet"}
            {gf.lockedProjected.length ? `; expected to be used by your earlier plans: ${gf.lockedProjected.join(", ")}` : ""}.
          </p>
        ) : null}
        {gf.issues.length === 0 ? (
          <p className="mt-1 text-emerald-800">No problems found.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {gf.issues.map((x, i) => (
              <li key={i} className={x.level === "error" ? "text-red-800" : "text-amber-800"}>
                {x.level === "error" ? "Error: " : "Warning: "}
                {x.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        <h3 className="font-medium">Series forecast</h3>
        <p className="text-zinc-600">
          Assumes each game plays its top five pick priorities. Under Fearless those champions are gone for the games
          after it. {forecast.totals.errors} error(s), {forecast.totals.warnings} warning(s) across the plans.
        </p>
        {forecast.conflicts.length === 0 ? (
          <p className="mt-1 text-emerald-800">No champion is counted on twice.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-red-800">
            {forecast.conflicts.map((c) => (
              <li key={`${c.champion}-${c.laterGame}`}>
                {c.champion}: game {c.firstGame} is expected to use it, so game {c.laterGame} cannot.
              </li>
            ))}
          </ul>
        )}
        <table className="mt-2 w-full text-left">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="pr-2 font-normal">Game</th>
              <th className="pr-2 font-normal">Expected picks</th>
              <th className="font-normal">Locked for it</th>
            </tr>
          </thead>
          <tbody>
            {forecast.games.map((g) => (
              <tr key={g.game} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                <td className="py-1 pr-2">{g.game}</td>
                <td className="pr-2">{g.projected.join(", ") || "none"}{g.played ? " (played)" : ""}</td>
                <td>{[...g.lockedActual, ...g.lockedProjected.map((c) => `${c}*`)].join(", ") || "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-zinc-500">* expected from a plan, not drafted yet.</p>
      </div>
    </section>
  );
}
