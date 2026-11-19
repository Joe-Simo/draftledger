import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseMarkdown, renderMarkdown } from "@/lib/markdown";

const SECTIONS = [
  "Methodology",
  "1. Data",
  "2. Player roles are inferred",
  "3. Fearless detection",
  "4. Aggregates and tendencies",
  "5. Confidence labels and intervals",
  "6. Fearless-aware suggestions and the series forecast",
  "7. What is not claimed",
  "8. Checking it",
];

describe("methodology page", () => {
  const md = readFileSync("METHODOLOGY.md", "utf8");

  it("exists as a route with the main landmark and loads METHODOLOGY.md at build time", () => {
    const page = readFileSync("src/app/methodology/page.tsx", "utf8");
    expect(page).toContain('<main id="main"');
    expect(page).toContain("METHODOLOGY.md");
    expect(page).toContain("loadMarkdown");
    expect(readFileSync("src/app/SiteFooter.tsx", "utf8")).toContain('href="/methodology"');
  });

  it("parses and renders every heading, the confidence table, and inline markup from METHODOLOGY.md", () => {
    const blocks = parseMarkdown(md);
    const headings = blocks.filter((b) => b.type === "h").map((b) => b.text);
    expect(headings).toEqual(SECTIONS);
    const table = blocks.find((b) => b.type === "table");
    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.headers).toEqual(["n (games the claim rests on)", "Label", "What the tool does"]);
      expect(table.rows).toHaveLength(4);
      expect(table.rows[0][1]).toBe("insufficient");
    }
    const html = renderToStaticMarkup(renderMarkdown(md));
    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("<table");
    expect(html).toContain("src/lib/roles.ts");
    expect(html).toContain("<strong>");
    expect(html).toContain("Wilson score interval");
    expect(html).toContain("left out");
    expect(html).not.toContain("\u2014");
  });
});
