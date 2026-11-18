import { describe, expect, it } from "vitest";
import { inferRoles, type Lineup } from "@/lib/roles";

// Synthetic: 12 lineups, slot order scrambled per team, unknown champions mixed with seeded ones.
const roleChamps = {
  top: ["Zzz-top-a", "Zzz-top-b", "Ornn", "Zzz-top-c"],
  jungle: ["Sejuani", "Zzz-jg-a", "Zzz-jg-b", "Vi"],
  mid: ["Orianna", "Zzz-mid-a", "Zzz-mid-b", "Azir"],
  bot: ["Jinx", "Zzz-bot-a", "Zzz-bot-b", "Zzz-bot-c"],
  support: ["Leona", "Zzz-sup-a", "Nautilus", "Zzz-sup-b"],
} as const;
const order = ["top", "jungle", "mid", "bot", "support"] as const;

function lineup(i: number): { l: Lineup; truth: string[] } {
  const slots = [0, 1, 2, 3, 4].sort((a, b) => ((a * 7 + i * 3) % 11) - ((b * 7 + i * 3) % 11));
  const roles = slots.map((s) => order[s]);
  return {
    l: {
      key: `g${i}`,
      champions: roles.map((r) => roleChamps[r][i % 4]),
      playerIds: roles.map((r) => `${r}-player`),
    },
    truth: roles,
  };
}

describe("inferRoles", () => {
  it("recovers roles when roster order is scrambled", () => {
    const items = Array.from({ length: 12 }, (_, i) => lineup(i));
    const out = inferRoles(items.map((x) => x.l));
    let right = 0;
    for (const x of items) right += (out.get(x.l.key) ?? []).filter((r, i) => r === x.truth[i]).length;
    expect(right).toBe(60);
  });

  it("skips lineups that do not have five players", () => {
    const out = inferRoles([{ key: "short", champions: ["Ahri"], playerIds: ["p"] }]);
    expect(out.has("short")).toBe(false);
  });
});
