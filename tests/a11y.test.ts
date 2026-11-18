import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHORTCUTS, shortcutFor, type KeyInfo } from "@/lib/shortcuts";

const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over });

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (fg: string, bg: string) => {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

describe("keyboard shortcuts", () => {
  it("maps the documented keys", () => {
    expect(shortcutFor(key("/"), false)).toBe("focus-search");
    expect(shortcutFor(key("z", { ctrlKey: true }), false)).toBe("undo");
    expect(shortcutFor(key("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(shortcutFor(key("y", { metaKey: true }), false)).toBe("redo");
    expect(shortcutFor(key("p", { altKey: true }), false)).toBe("take-plan");
    expect(shortcutFor(key("b", { altKey: true }), false)).toBe("skip-ban");
    expect(shortcutFor(key("Escape"), false)).toBe("clear-search");
  });

  it("does not steal keys while typing", () => {
    expect(shortcutFor(key("/"), true)).toBeNull();
    expect(shortcutFor(key("z", { ctrlKey: true }), true)).toBeNull();
    // Alt combinations and Escape still work inside a field.
    expect(shortcutFor(key("p", { altKey: true }), true)).toBe("take-plan");
    expect(shortcutFor(key("Escape"), true)).toBe("clear-search");
  });

  it("ignores other keys and every shortcut is documented with a description", () => {
    expect(shortcutFor(key("a"), false)).toBeNull();
    expect(shortcutFor(key("Enter"), false)).toBeNull();
    for (const s of SHORTCUTS) expect(s.does.length).toBeGreaterThan(3);
    expect(new Set(SHORTCUTS.map((s) => s.keys)).size).toBe(SHORTCUTS.length);
  });
});

describe("color contrast (WCAG AA, 4.5:1 for normal text)", () => {
  const AA = 4.5;
  it("computes known ratios", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(ratio("#777777", "#ffffff")).toBeLessThan(AA);
  });

  it("light theme pairs used by the app pass", () => {
    const pairs: [string, string, string][] = [
      ["body text", "#171717", "#ffffff"],
      ["muted text zinc-500", "#71717a", "#ffffff"],
      ["muted text zinc-600", "#52525b", "#ffffff"],
      ["blue-700 headings", "#1d4ed8", "#ffffff"],
      ["red-700 headings", "#b91c1c", "#ffffff"],
      ["emerald-800 text", "#065f46", "#ffffff"],
      ["amber-800 text", "#92400e", "#ffffff"],
      ["ok badge", "#065f46", "#d1fae5"],
      ["thin badge", "#92400e", "#fef3c7"],
      ["critical badge", "#991b1b", "#fee2e2"],
      ["unset badge", "#52525b", "#f4f4f5"],
      ["error alert", "#991b1b", "#fef2f2"],
      ["plan says panel", "#082f49", "#f0f9ff"],
      ["plan says button", "#ffffff", "#0c4a6e"],
      ["focus outline", "#1d4ed8", "#ffffff"],
    ];
    for (const [name, fg, bg] of pairs) expect(ratio(fg, bg), name).toBeGreaterThanOrEqual(AA);
  });

  it("every dark-mode text override in globals.css passes on the dark background", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark) {\n  :focus-visible"));
    const bg = /--background:\s*(#[0-9a-f]{6})/i.exec(css.slice(css.indexOf("@media (prefers-color-scheme: dark)")))![1];
    const colors = [...dark.matchAll(/(?:^|\s)(?:color|outline-color):\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
    expect(colors.length).toBeGreaterThanOrEqual(6);
    for (const c of colors) expect(ratio(c, bg), `${c} on ${bg}`).toBeGreaterThanOrEqual(AA);
  });
});

describe("page structure", () => {
  it("has a skip link that targets the main landmark on every page", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain('href="#main"');
    for (const f of ["src/app/page.tsx", "src/app/board/BoardClient.tsx", "src/app/team/[id]/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toContain('<main id="main"');
    }
  });
});
