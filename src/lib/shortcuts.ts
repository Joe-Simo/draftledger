/** Keyboard shortcuts of the /board page. Pure so the mapping can be tested without a browser. */
export type ShortcutAction = "focus-search" | "clear-search" | "undo" | "redo" | "take-plan" | "skip-ban";

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const SHORTCUTS: { keys: string; does: string; action: ShortcutAction }[] = [
  { keys: "/", does: "Jump to the champion search", action: "focus-search" },
  { keys: "Esc", does: "Clear the search", action: "clear-search" },
  { keys: "Enter (in the search)", does: "Pick or ban the first champion that is still available", action: "focus-search" },
  { keys: "Ctrl+Z", does: "Undo the last draft event", action: "undo" },
  { keys: "Ctrl+Shift+Z", does: "Redo", action: "redo" },
  { keys: "Alt+P", does: "Take the move your game plan suggests", action: "take-plan" },
  { keys: "Alt+B", does: "Skip this ban", action: "skip-ban" },
];

/**
 * Map a key press to an action. While the user types in a field only Esc, Ctrl+Z style shortcuts that
 * do not clash with text editing, and Alt combinations are handled; "/" is ignored so it can be typed.
 */
export function shortcutFor(e: KeyInfo, typing: boolean): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "Escape") return "clear-search";
  if (e.altKey && !mod && e.key.toLowerCase() === "p") return "take-plan";
  if (e.altKey && !mod && e.key.toLowerCase() === "b") return "skip-ban";
  if (typing) return null;
  if (mod && !e.altKey && e.key.toLowerCase() === "z") return e.shiftKey ? "redo" : "undo";
  if (mod && !e.altKey && e.key.toLowerCase() === "y") return "redo";
  if (!mod && !e.altKey && e.key === "/") return "focus-search";
  return null;
}
