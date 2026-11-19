import { readFileSync } from "node:fs";
import path from "node:path";
import { type ReactElement, type ReactNode } from "react";

export type MdBlock =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

/** Reads a repo-root Markdown file at build time (static export). */
export function loadMarkdown(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isTableSeparator(line: string | undefined): boolean {
  return !!line && /^\s*\|?(?:\s*:?-{3,}:?\s*\|?)+\s*$/.test(line);
}

function isBlockStart(lines: string[], i: number): boolean {
  const line = lines[i];
  if (/^#{1,3}\s+\S/.test(line)) return true;
  if (/^\s*[-*]\s+\S/.test(line)) return true;
  return line.startsWith("|") && isTableSeparator(lines[i + 1]);
}

/** Parses the subset of Markdown used in METHODOLOGY.md: headings, paragraphs, lists, tables, bold and inline code. */
export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ type: "h", level, text: heading[2].trim() });
      i += 1;
      continue;
    }
    if (line.startsWith("|") && isTableSeparator(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && !isTableSeparator(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (/^\s*[-*]\s+\S/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+\S/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines, i)) {
      parts.push(lines[i].trim());
      i += 1;
    }
    if (parts.length) blocks.push({ type: "p", text: parts.join(" ") });
  }
  return blocks;
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={k} className="rounded bg-zinc-100 px-1 font-mono text-[0.9em] dark:bg-zinc-800">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<strong key={k}>{token.slice(2, -2)}</strong>);
    }
    k += 1;
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const headingClass: Record<1 | 2 | 3, string> = {
  1: "text-3xl font-semibold tracking-tight",
  2: "mt-8 text-lg font-semibold",
  3: "mt-6 text-base font-semibold",
};

export function renderMarkdown(src: string): ReactElement {
  const blocks = parseMarkdown(src);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "h") {
          const Tag = (`h${b.level}`) as "h1" | "h2" | "h3";
          return (
            <Tag key={i} className={headingClass[b.level]}>
              {inline(b.text)}
            </Tag>
          );
        }
        if (b.type === "p") {
          return (
            <p key={i} className="mt-3">
              {inline(b.text)}
            </p>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="mt-3 list-disc space-y-2 pl-6">
              {b.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <div key={i} className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-300 text-zinc-500 dark:border-zinc-700">
                <tr>
                  {b.headers.map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium">
                      {inline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r} className="border-b border-zinc-200 dark:border-zinc-800">
                    {row.map((c, cidx) => (
                      <td key={cidx} className="py-2 pr-4">
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
