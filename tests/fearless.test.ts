import { describe, expect, it } from "vitest";
import { isPickable, lockedChampions } from "@/lib/fearless";

describe("fearless pool", () => {
  it("locks every champion picked in earlier games", () => {
    const history = [{ picks: ["Ahri", "Skarner"] }, { picks: ["Ashe"] }];
    expect([...lockedChampions(history)].sort()).toEqual(["Ahri", "Ashe", "Skarner"]);
    expect(isPickable("Ahri", history)).toBe(false);
    expect(isPickable("Orianna", history)).toBe(true);
  });
});
