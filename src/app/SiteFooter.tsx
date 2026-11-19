import Link from "next/link";
import { DATA_NOTE, RIOT_BOILERPLATE, RIOT_JIBBER_JABBER } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="no-print mt-12 border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto w-full max-w-6xl space-y-2 px-6 py-6 text-xs leading-relaxed text-zinc-500">
        <nav aria-label="Site">
          <Link className="underline-offset-2 hover:underline" href="/methodology">
            Methodology
          </Link>
        </nav>
        <p>{RIOT_BOILERPLATE}</p>
        <p>{RIOT_JIBBER_JABBER}</p>
        <p>{DATA_NOTE}</p>
      </div>
    </footer>
  );
}
