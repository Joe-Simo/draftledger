"use client";

import { useState } from "react";
import type { TeamAggregate } from "@/lib/aggregate";
import { pctText } from "@/lib/insights";
import type { PrepSheet } from "@/lib/prep";
import { toCsv, toMarkdown } from "@/lib/prep";
import type { NextGameOutlook, StepSuggestions } from "@/lib/suggest";
import type { InsightResult, Confidence } from "@/lib/insights";

const conf: Record<Confidence, string> = {
  insufficient: "bg-zinc-100 text-zinc-600",
  low: "bg-amber-100 text-amber-800",
  medium: "bg-sky-100 text-sky-800",
  high: "bg-emerald-100 text-emerald-800",
};

export function ConfidenceBadge({ level, n }: { level: Confidence; n: number }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${conf[level]}`}>{level}, n={n}</span>;
}

export function SuggestionsPanel({ data, onPick }: { data: StepSuggestions | null; onPick: (champion: string) => void }) {
  if (!data) return null;
  return (
    <section className="no-print rounded border border-zinc-300 p-3 dark:border-zinc-700" aria-label="Suggestions">
      <h3 className="font-medium">{data.title}</h3>
      {data.items.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">Nothing with enough games behind it for this step.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {data.items.map((s) => (
            <li key={s.champion} className="flex flex-wrap items-center gap-2 text-sm">
              <button
                className="rounded border border-zinc-300 px-2 py-0.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                onClick={() => onPick(s.champion)}
                title="Use this champion for the current step"
              >
                {s.champion}
                {s.role ? <span className="ml-1 font-normal text-zinc-500">{s.role}</span> : null}
              </button>
              <ConfidenceBadge level={s.confidence} n={s.n} />
              <span className="text-zinc-600 dark:text-zinc-400">{s.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        {data.note}
        {data.hiddenLowSample > 0 ? ` ${data.hiddenLowSample} hidden for a tiny sample.` : ""}
      </p>
    </section>
  );
}

export function OutlookPanel({ data }: { data: NextGameOutlook | null }) {
  if (!data) return null;
  return (
    <section className="no-print rounded border border-zinc-300 p-3 dark:border-zinc-700" aria-label="Next game outlook">
      <h3 className="font-medium">What to expect in game {data.gameNumber} (Fearless locks applied)</h3>
      <p className="mt-1 text-sm">
        Locked from their ten favourite champions:{" "}
        {data.burned.length === 0 ? "none yet" : data.burned.map((b) => `${b.champion} (${b.count})`).join(", ")}
        {data.burned.length > 0 ? ` (${pctText(data.burnedShare)} of that pick volume)` : ""}.
      </p>
      {data.comfortNote ? <p className="mt-1 text-sm">{data.comfortNote}</p> : null}
      <table className="mt-2 w-full text-left text-sm">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1 pr-2 font-medium">Role</th>
            <th className="py-1 pr-2 font-medium">Likely picks (games in role)</th>
            <th className="py-1 font-medium">Known pool left</th>
          </tr>
        </thead>
        <tbody>
          {data.byRole.map((r) => (
            <tr key={r.role} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2 capitalize">{r.role}</td>
              <td className="py-1 pr-2">
                {r.likely.length === 0
                  ? "no unlocked champion with enough games"
                  : r.likely.map((l) => `${l.champion} (${l.n})`).join(", ")}
              </td>
              <td className="py-1">
                {r.remainingDepth}/{r.totalDepth}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function InsightsPanel({ result, opponent }: { result: InsightResult; opponent: TeamAggregate }) {
  return (
    <section className="no-print" aria-label="How to win">
      <h2 className="text-lg font-semibold">How to win against {opponent.name} (game {result.gameNumber})</h2>
      <p className="text-sm text-zinc-500">
        Every point shows its sample size. Under 5 games nothing is claimed, and win-rate claims need the 95% interval to
        clear the comparison.
      </p>
      {result.insights.length === 0 ? (
        <p className="mt-2 text-sm">No claim has enough data behind it.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {result.insights.map((i) => (
            <li key={i.id} className="rounded border border-zinc-200 p-2 text-sm dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <ConfidenceBadge level={i.confidence} n={i.n} />
                <span className="font-medium">{i.text}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{i.evidence}</p>
            </li>
          ))}
        </ul>
      )}
      {result.lockedOut.length ? (
        <p className="mt-2 text-xs text-zinc-500">
          Left out because they are already locked or used: {result.lockedOut.join(", ")}.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500">
        {result.suppressed} candidate point(s) left out for a small sample or an unclear effect.
      </p>
    </section>
  );
}

function download(name: string, text: string, mime: string): string {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

export function PrepSheetPanel({ sheet, onRefresh }: { sheet: PrepSheet; onRefresh: () => void }) {
  const o = sheet.opponent;
  const [saved, setSaved] = useState<string | null>(null);
  const slug = o.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <section className="print-sheet mt-8 rounded border border-zinc-300 p-4 dark:border-zinc-700" aria-label="Prep sheet">
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Prep sheet</h2>
        <button className="rounded border border-zinc-300 px-2 py-1 text-sm" onClick={() => { onRefresh(); window.print(); }}>
          Print
        </button>
        <button className="rounded border border-zinc-300 px-2 py-1 text-sm" onClick={() => { onRefresh(); setSaved(download(`prep-${slug}.md`, toMarkdown(sheet), "text/markdown")); }}>
          Download Markdown
        </button>
        <button className="rounded border border-zinc-300 px-2 py-1 text-sm" onClick={() => { onRefresh(); setSaved(download(`prep-${slug}.csv`, toCsv(sheet), "text/csv")); }}>
          Download CSV
        </button>
        {saved ? (
          <span role="status" className="text-xs text-emerald-700">
            Saved to your Downloads as {saved}
          </span>
        ) : null}
      </div>
      <h1 className="mt-3 text-xl font-semibold">{sheet.title}</h1>
      <p className="text-sm">
        {o.name}: {o.games} games in {o.series} series, win rate {pctText(o.wins / o.games)}. Bo{sheet.config.format},{" "}
        {sheet.config.fearless ? "Fearless" : "standard draft"}. Generated {sheet.generated}.
      </p>
      <h3 className="mt-3 font-medium">How to win (for game {sheet.insights.gameNumber})</h3>
      <ul className="list-disc pl-5 text-sm">
        {sheet.insights.insights.length === 0 ? <li>No claim has enough data behind it.</li> : null}
        {sheet.insights.insights.map((i) => (
          <li key={i.id}>
            {i.text} <em>[{i.confidence}, n={i.n}]</em>
          </li>
        ))}
      </ul>
      {sheet.insights.lockedOut.length ? (
        <p className="text-xs text-zinc-500">
          Not advised because they are already locked or used: {sheet.insights.lockedOut.join(", ")}.
        </p>
      ) : null}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="font-medium">Most picked</h3>
          <table className="w-full text-left text-sm">
            <tbody>
              {o.picks.slice(0, 10).map((p) => (
                <tr key={p.champion} className="border-t border-zinc-200">
                  <td className="py-0.5">{p.champion}</td>
                  <td>{p.games}/{o.games}</td>
                  <td>{pctText(p.wins / p.games)} won</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="font-medium">Most banned by them</h3>
          <table className="w-full text-left text-sm">
            <tbody>
              {o.bans.slice(0, 10).map((b) => (
                <tr key={b.champion} className="border-t border-zinc-200">
                  <td className="py-0.5">{b.champion}</td>
                  <td>{b.count}/{o.games}</td>
                  <td>first ban {b.firstBan}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {sheet.outlook ? (
        <div className="mt-3 text-sm">
          <h3 className="font-medium">Expect in game {sheet.outlook.gameNumber}</h3>
          <p>
            Locked: {sheet.outlook.burned.map((b) => b.champion).join(", ") || "none"}.{" "}
            {sheet.outlook.byRole.map((r) => `${r.role}: ${r.likely.map((l) => l.champion).join("/") || "unknown"}`).join("; ")}
          </p>
        </div>
      ) : null}
      {sheet.drafts.map((d) => (
        <div key={d.game} className="mt-3 text-sm">
          <h3 className="font-medium">Game {d.game}: {d.blue} (blue) vs {d.red} (red){d.winner ? `, won by ${d.winner}` : ""}</h3>
          <p>Bans: {d.bans.join("; ") || "none"}</p>
          <p>Picks: {d.picks.join("; ") || "none"}</p>
        </div>
      ))}
      <p className="mt-4 text-xs text-zinc-500">
        Counts from official GRID esports data supplied for the Cloud9 x JetBrains hackathon (aggregates only).
        DraftLedger is not endorsed by Riot Games. Built with AI coding agents directed by Joe Simo.
      </p>
    </section>
  );
}
