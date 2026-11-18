import { unavailableReason, type ActionView, type BoardConfig, type BoardView, type TeamKey } from "./board.ts";

/**
 * Pre-series game plans, ported from the Fearplan prototype and adapted to the DraftLedger reducer:
 * the Fearless lock here is shared by both teams, and plans are written from our team's point of view.
 */

/** "If they ban X we pick Y": a trigger on an opponent action and an ordered response. */
export interface Branch {
  id: string;
  when: { action: "ban" | "pick"; champion: string };
  then: { action: "ban" | "pick"; champions: string[] };
  note?: string;
}

export interface GamePlan {
  /** Ordered ban targets. */
  bans: string[];
  /** Ordered pick priorities, first available wins. */
  picks: string[];
  branches: Branch[];
  notes: string;
}

export const MAX_GAMES = 5;
export const emptyPlan = (): GamePlan => ({ bans: [], picks: [], branches: [], notes: "" });
export const emptyPlans = (): GamePlan[] => Array.from({ length: MAX_GAMES }, emptyPlan);

const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isAction = (x: unknown): x is "ban" | "pick" => x === "ban" || x === "pick";

/** Parse stored plans defensively: anything malformed falls back to an empty plan for that game. */
export function normalizePlans(raw: unknown): GamePlan[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: MAX_GAMES }, (_, i) => {
    const p = list[i] as Partial<GamePlan> | undefined;
    if (!p || typeof p !== "object") return emptyPlan();
    const branches = Array.isArray(p.branches)
      ? p.branches.filter(
          (b): b is Branch =>
            !!b &&
            typeof b.id === "string" &&
            isAction(b.when?.action) &&
            typeof b.when?.champion === "string" &&
            isAction(b.then?.action) &&
            isStrings(b.then?.champions),
        )
      : [];
    return {
      bans: isStrings(p.bans) ? p.bans : [],
      picks: isStrings(p.picks) ? p.picks : [],
      branches,
      notes: typeof p.notes === "string" ? p.notes : "",
    };
  });
}

/** Our team on the board: the one that is not the scouted opponent (team A when nothing is scouted). */
export const ourTeam = (config: BoardConfig): TeamKey => (config.scout?.opponent === "A" ? "B" : "A");

/** Branches whose trigger already happened (by the opponent) in this draft, freshest trigger first. */
export function firedBranches(actions: ActionView[], plan: GamePlan, ours: TeamKey): Branch[] {
  const order = new Map<string, number>();
  actions
    .filter((a) => a.team !== ours && a.champion)
    .forEach((a, i) => order.set(`${a.step.kind}:${a.champion}`, i));
  const at = (b: Branch) => order.get(`${b.when.action}:${b.when.champion}`) ?? -1;
  return plan.branches.filter((b) => at(b) >= 0).sort((a, b) => at(b) - at(a));
}

export interface PlanSuggestion {
  champion: string | null;
  source: "branch" | "priority" | "none";
  reason: string;
  /** Other legal options from the same list, in order. */
  alternatives: string[];
}

/** What the plan says to do at the current draft step, when it is our turn. */
export function planSuggestion(config: BoardConfig, view: BoardView, plan: GamePlan): PlanSuggestion | null {
  const next = view.next;
  const cur = view.current;
  if (!next || !cur || next.team !== ourTeam(config)) return null;
  const legal = (list: string[]) => [...new Set(list)].filter((c) => !unavailableReason(config, view, c));

  for (const b of firedBranches(cur.actions, plan, next.team)) {
    if (b.then.action !== next.kind) continue;
    const opts = legal(b.then.champions);
    if (opts.length) {
      return {
        champion: opts[0],
        source: "branch",
        reason: `They ${b.when.action === "ban" ? "banned" : "picked"} ${b.when.champion}`,
        alternatives: opts.slice(1),
      };
    }
  }
  const opts = legal(next.kind === "ban" ? plan.bans : plan.picks);
  if (opts.length) {
    return { champion: opts[0], source: "priority", reason: `Next ${next.kind} priority`, alternatives: opts.slice(1) };
  }
  return { champion: null, source: "none", reason: "Plan has no legal option left", alternatives: [] };
}

export type IssueLevel = "error" | "warning";
export interface PlanIssue {
  level: IssueLevel;
  code: "UNKNOWN_CHAMPION" | "LOCKED_PICK" | "DUPLICATE" | "BAN_AND_PICK" | "EMPTY_BRANCH" | "LOCKED_BAN_WASTE";
  message: string;
  champion?: string;
}

/**
 * Live checks for one game's plan. `locked` holds champions that earlier games already used (Fearless);
 * under the shared lock neither team can pick them, so a locked pick is an error and a locked ban is wasted.
 * `known` is the champion list; null skips the spelling check (list not loaded yet).
 */
export function validatePlan(plan: GamePlan, known: ReadonlySet<string> | null, locked: ReadonlySet<string>): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (known) {
    const all = [...plan.bans, ...plan.picks, ...plan.branches.flatMap((b) => [b.when.champion, ...b.then.champions])];
    for (const c of new Set(all)) {
      if (!known.has(c)) issues.push({ level: "error", code: "UNKNOWN_CHAMPION", message: `Unknown champion ${c}`, champion: c });
    }
  }
  const dup = (list: string[], where: string) => {
    const seen = new Set<string>();
    for (const c of list) {
      if (seen.has(c)) issues.push({ level: "warning", code: "DUPLICATE", message: `${c} is listed twice in ${where}`, champion: c });
      seen.add(c);
    }
  };
  dup(plan.bans, "bans");
  dup(plan.picks, "picks");
  for (const c of plan.picks) {
    if (locked.has(c)) issues.push({ level: "error", code: "LOCKED_PICK", message: `${c} is Fearless locked`, champion: c });
    if (plan.bans.includes(c)) issues.push({ level: "warning", code: "BAN_AND_PICK", message: `${c} is both a ban target and a pick`, champion: c });
  }
  for (const c of plan.bans) {
    if (locked.has(c)) issues.push({ level: "warning", code: "LOCKED_BAN_WASTE", message: `Banning ${c} is wasted, it is already locked`, champion: c });
  }
  for (const b of plan.branches) {
    if (b.then.action === "pick") {
      for (const c of b.then.champions) {
        if (locked.has(c)) issues.push({ level: "error", code: "LOCKED_PICK", message: `Branch ${b.id}: ${c} is locked`, champion: c });
      }
    }
    const usable = b.then.champions.filter((c) => !(b.then.action === "pick" && locked.has(c)));
    if (usable.length === 0) issues.push({ level: "warning", code: "EMPTY_BRANCH", message: `Branch ${b.id} has no usable response` });
    if (b.when.action === "pick" && locked.has(b.when.champion)) {
      issues.push({ level: "warning", code: "EMPTY_BRANCH", message: `Branch ${b.id} can never fire: ${b.when.champion} is locked` });
    }
  }
  return issues;
}
