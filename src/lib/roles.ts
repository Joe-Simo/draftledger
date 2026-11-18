import { ROLES, type Role } from "./types.ts";

export interface Lineup {
  /** Unique key, for example `${gameId}|${teamId}`. */
  key: string;
  /** Five champions in roster order. */
  champions: string[];
  /** Five player ids in the same order. */
  playerIds: string[];
}

/**
 * Well known primary roles, used only to anchor the role labels. The data then refines them:
 * GRID rosters list five players per team but not in a fixed role order, so roles are inferred.
 */
export const ROLE_SEEDS: Record<Role, string[]> = {
  top: ["Ornn", "Renekton", "Jax", "Gnar", "Camille", "Gwen", "Malphite", "Sion", "Shen", "Kled"],
  jungle: ["Sejuani", "Lee Sin", "Vi", "Viego", "Elise", "Nidalee", "Xin Zhao", "Jarvan IV", "Maokai", "Nocturne", "Skarner"],
  mid: ["Orianna", "Azir", "Syndra", "Viktor", "Ahri", "Taliyah", "Corki", "Ryze", "Cassiopeia", "Hwei"],
  bot: ["Jinx", "Ezreal", "Jhin", "Caitlyn", "Varus", "Aphelios", "Lucian", "Ashe", "Zeri", "Smolder", "Miss Fortune"],
  support: ["Leona", "Nautilus", "Thresh", "Nami", "Lulu", "Rell", "Alistar", "Braum", "Renata Glasc", "Rakan", "Karma"],
};

const PERMUTATIONS: number[][] = (() => {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (rest.length === 0) return void out.push(cur);
    rest.forEach((r, i) => rec([...cur, r], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], [0, 1, 2, 3, 4]);
  return out;
})();

function table(map: Map<string, number[]>, key: string): number[] {
  let t = map.get(key);
  if (!t) map.set(key, (t = [0, 0, 0, 0, 0]));
  return t;
}

function logProb(counts: number[] | undefined, role: number, alpha: number): number {
  const total = counts ? counts.reduce((a, b) => a + b, 0) : 0;
  return Math.log(((counts?.[role] ?? 0) + alpha) / (total + 5 * alpha));
}

/**
 * Assign the five roles inside every lineup. Hard EM: score each of the 120 role permutations by
 * champion-role and player-role frequencies (add-alpha smoothed), keep the best, recount, repeat.
 * Champion counts start from ROLE_SEEDS, player counts from the seeded champions each player used;
 * roster slot order only gives a weak extra hint.
 * Returns roles per roster index, keyed by lineup key.
 */
export function inferRoles(lineups: Lineup[], iterations = 6, alpha = 0.5): Map<string, Role[]> {
  const champ = new Map<string, number[]>();
  const player = new Map<string, number[]>();
  ROLES.forEach((role, ri) => {
    for (const c of ROLE_SEEDS[role]) table(champ, c)[ri] += 5;
  });
  for (const l of lineups) l.champions.forEach((c, i) => (table(champ, c)[i] += 0.5));

  const valid = lineups.filter((l) => l.champions.length === 5 && l.playerIds.length === 5);
  // Players keep their role, so vote each player's role from the seeded champions they played.
  const seedRole = new Map<string, number>();
  ROLES.forEach((role, ri) => ROLE_SEEDS[role].forEach((c) => seedRole.set(c, ri)));
  for (const l of valid)
    l.champions.forEach((c, i) => {
      const ri = seedRole.get(c);
      if (ri !== undefined) table(player, l.playerIds[i])[ri] += 1;
    });
  let assignment = new Map<string, number[]>();
  for (let it = 0; it < iterations; it++) {
    const next = new Map<string, number[]>();
    for (const l of valid) {
      let best = PERMUTATIONS[0];
      let bestScore = -Infinity;
      for (const perm of PERMUTATIONS) {
        let s = 0;
        for (let i = 0; i < 5; i++) {
          s += logProb(champ.get(l.champions[i]), perm[i], alpha);
          s += 0.7 * logProb(player.get(l.playerIds[i]), perm[i], alpha);
        }
        if (s > bestScore) {
          bestScore = s;
          best = perm;
        }
      }
      next.set(l.key, best);
    }
    assignment = next;
    // Recount from the new assignment, keeping seeds as the anchor.
    champ.clear();
    player.clear();
    ROLES.forEach((role, ri) => {
      for (const c of ROLE_SEEDS[role]) table(champ, c)[ri] += 2;
    });
    for (const l of valid) {
      const perm = assignment.get(l.key)!;
      for (let i = 0; i < 5; i++) {
        table(champ, l.champions[i])[perm[i]] += 1;
        table(player, l.playerIds[i])[perm[i]] += 1;
      }
    }
  }
  const out = new Map<string, Role[]>();
  for (const [key, perm] of assignment) out.set(key, perm.map((r) => ROLES[r]));
  return out;
}
