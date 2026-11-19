import type { Metadata } from "next";
import Link from "next/link";
import { loadMarkdown, renderMarkdown } from "@/lib/markdown";

export const metadata: Metadata = { title: "Methodology | DraftLedger" };

export default function MethodologyPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        All teams
      </Link>
      <article className="mt-2">{renderMarkdown(loadMarkdown("METHODOLOGY.md"))}</article>
    </main>
  );
}
