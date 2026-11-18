import Link from "next/link";
import { loadMeta, loadTeams, pct } from "@/lib/data";

export default function Home() {
  const teams = loadTeams();
  const meta = loadMeta();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">DraftLedger</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Fearless Draft prep for League of Legends coaching staffs. Pick an opponent to see what they repeat, with sample
        sizes.
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        {meta.games.toLocaleString()} games from {meta.series} series, {meta.fearlessSeries} of them Fearless series.
        Teams with at least {meta.minGamesPerTeam} games are listed.
      </p>
      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-zinc-300 text-zinc-500 dark:border-zinc-700">
          <tr>
            <th className="py-2 pr-4 font-medium">Team</th>
            <th className="py-2 pr-4 font-medium">Games</th>
            <th className="py-2 pr-4 font-medium">Win rate</th>
            <th className="py-2 font-medium">Fearless games</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.teamId} className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-2 pr-4">
                <Link className="font-medium underline-offset-2 hover:underline" href={`/team/${t.teamId}`}>
                  {t.name}
                </Link>
              </td>
              <td className="py-2 pr-4">{t.games}</td>
              <td className="py-2 pr-4">{pct(t.wins, t.games)}</td>
              <td className="py-2">{t.fearlessGames}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="mt-10 text-xs text-zinc-500">
        Built with AI coding agents directed by Joe Simo. Not endorsed by Riot Games. Data: official GRID esports data
        supplied for the Cloud9 x JetBrains hackathon, shown as aggregate counts only.
      </footer>
    </main>
  );
}
