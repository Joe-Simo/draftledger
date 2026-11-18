export type Side = "blue" | "red";

/** Champions already used by a team in earlier games of a Fearless Draft series. */
export function lockedChampions(history: { picks: string[] }[]): Set<string> {
  const out = new Set<string>();
  for (const game of history) for (const c of game.picks) out.add(c);
  return out;
}

export function isPickable(champion: string, history: { picks: string[] }[]): boolean {
  return !lockedChampions(history).has(champion);
}
