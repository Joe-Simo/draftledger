import Link from "next/link";
import { notFound } from "next/navigation";
import type { ChampCount, TeamAggregate } from "@/lib/aggregate";
import { LOW_SAMPLE, loadTeams, pct } from "@/lib/data";

export function generateStaticParams() {
  return loadTeams().map((t) => ({ id: t.teamId }));
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note ? <p className="text-sm text-zinc-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Low({ n }: { n: number }) {
  return n < LOW_SAMPLE ? <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">low sample</span> : null;
}

function Chips({ items, total }: { items: ChampCount[]; total: number }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((c) => (
        <li key={c.champion} className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700">
          {c.champion} <span className="text-zinc-500">{c.count}/{total}</span>
        </li>
      ))}
    </ul>
  );
}

function topRole(roles: Record<string, number | undefined>): string {
  const best = Object.entries(roles).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  return best ? best[0] : "";
}

export default async function TeamPage({ params }: PageProps<"/team/[id]">) {
  const { id } = await params;
  const team: TeamAggregate | undefined = loadTeams().find((t) => t.teamId === id);
  if (!team) notFound();
  const f = team.fearless;
  const g1 = f?.byGame["1"];
  const g2 = f?.byGame["2"];
  const g3 = f?.byGame["3+"];
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        All teams
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{team.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {team.games} games in {team.series} series ({team.firstDate.slice(0, 10)} to {team.lastDate.slice(0, 10)}). Win
        rate {pct(team.wins, team.games)}. Blue side {pct(team.sides.blue.wins, team.sides.blue.games)} of{" "}
        {team.sides.blue.games}, red side {pct(team.sides.red.wins, team.sides.red.games)} of {team.sides.red.games}.
      </p>

      <Section title="Most picked champions" note="Picks per game played, with the role the champion was played in most often.">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {team.picks.slice(0, 8).map((p) => (
            <li key={p.champion} className="flex justify-between border-b border-zinc-200 py-1 dark:border-zinc-800">
              <span>
                {p.champion} <span className="text-zinc-500">({topRole(p.roles)})</span>
                <Low n={p.games} />
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {p.games}/{team.games} games, {pct(p.wins, p.games)} won
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Most banned by this team" note="First number is bans made, then how often it was their first ban.">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {team.bans.slice(0, 8).map((b) => (
            <li key={b.champion} className="flex justify-between border-b border-zinc-200 py-1 dark:border-zinc-800">
              <span>
                {b.champion}
                <Low n={b.count} />
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {b.count}/{team.games} games, first ban {b.firstBan}x
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Banned against this team" note="What opponents remove before drafting against them.">
        <Chips items={team.bansAgainst.slice(0, 8)} total={team.games} />
      </Section>

      {f && g1 && g2 && g3 ? (
        <Section
          title="Fearless shift: game 1, game 2, game 3 and later"
          note="Only games in Fearless series. In Fearless Draft a champion picked in an earlier game cannot be picked again by either team."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <h3 className="font-medium">
                Game 1 <span className="text-sm text-zinc-500">({g1.games} games)</span>
              </h3>
              <p className="mt-1 text-xs text-zinc-500">Top picks</p>
              <Chips items={g1.topPicks} total={g1.games} />
              <p className="mt-2 text-xs text-zinc-500">Top bans</p>
              <Chips items={g1.topBans} total={g1.games} />
            </div>
            <div>
              <h3 className="font-medium">
                Game 2 <span className="text-sm text-zinc-500">({g2.games} games)</span>
              </h3>
              <p className="mt-1 text-xs text-zinc-500">Top picks</p>
              <Chips items={g2.topPicks} total={g2.games} />
              <p className="mt-2 text-xs text-zinc-500">Top bans</p>
              <Chips items={g2.topBans} total={g2.games} />
            </div>
            <div>
              <h3 className="font-medium">
                Game 3+ <span className="text-sm text-zinc-500">({g3.games} games)</span>
              </h3>
              <p className="mt-1 text-xs text-zinc-500">Top picks</p>
              <Chips items={g3.topPicks} total={g3.games} />
              <p className="mt-2 text-xs text-zinc-500">Top bans</p>
              <Chips items={g3.topBans} total={g3.games} />
            </div>
          </div>
          <p className="mt-4 text-sm">
            Comfort share (picks from the team&apos;s ten most picked champions): game 1 {Math.round(g1.comfortShare * 100)}%,
            game 2 {Math.round(g2.comfortShare * 100)}%, game 3+ {Math.round(g3.comfortShare * 100)}%. Top-5 pick overlap between game 1 and game 3+:{" "}
            {f.top5PickOverlapG1vsG3 === null ? "n/a" : Math.round(f.top5PickOverlapG1vsG3 * 100) + "%"}.
            {Math.min(g2.games, g3.games) < LOW_SAMPLE ? <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">low sample</span> : null}
          </p>
        </Section>
      ) : (
        <Section title="Fearless shift">
          <p className="text-sm text-zinc-500">Not enough Fearless games with a game 1 and a game 3 or later.</p>
        </Section>
      )}
    </main>
  );
}
