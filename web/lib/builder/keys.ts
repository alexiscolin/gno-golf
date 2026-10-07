// The editor's keys (the game-design review's quick win 8): what a key press
// asks for, beside the editor's own (arrows, R, Delete, ⌘Z, Enter, Escape),
// and every key in words, one list for the board's key line (short) and the
// glossary (long). "mod" is ⌘ on a Mac, Ctrl elsewhere.

/** What a press asks for: a palette piece armed (the first five, n from 0), the hole framed, a quick test, the 3D board tilted or turned a quarter; null for none of these. */
export type KeyAction = { t: "arm"; n: number } | { t: "frame" } | { t: "test" } | { t: "tilt" } | { t: "turn"; by: 1 | -1 } | null;

export function keyAction(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey"> & { shiftKey?: boolean }): KeyAction {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (/^[1-5]$/.test(e.key)) return { t: "arm", n: Number(e.key) - 1 };
  const k = e.key.toLowerCase();
  return k === "f" ? { t: "frame" } : k === "t" ? { t: "test" } : k === "v" ? { t: "tilt" } : k === "q" ? { t: "turn", by: e.shiftKey ? -1 : 1 } : null;
}

/** The keys in words: the key line's few, the glossary's sentence. */
export const KEYS: readonly { key: string; short: string; long: string }[] = [
  { key: "1–5", short: "Pieces", long: "pick one of the first five pieces" },
  { key: "R", short: "Turn", long: "turns the selected piece" },
  { key: "⌫", short: "Delete", long: "deletes it" },
  { key: "modZ", short: "Undo", long: "undoes (with ⇧, redoes)" },
  { key: "Space", short: "Pan", long: "held, a drag pans the board" },
  { key: "F", short: "Frame", long: "frames the whole hole" },
  { key: "V", short: "Tilt", long: "tilts the board a little, to see heights and shadows (again: straight down)" },
  { key: "Q", short: "Rotate", long: "turns the board a quarter (with ⇧, the other way)" },
  { key: "T", short: "Try it", long: "a quick test: plays it in calm weather, then back here (never a proof)" },
  { key: "⇧ drag", short: "Quick shot", long: "on the board, pulls back a quick shot from the tee, or from where the last one stopped (calm weather; never a proof)" },
  { key: "Esc", short: "Back", long: "drops the piece in hand and the quick shots; in a test, back to Edit (R plays again, V swaps the view)" },
];

/** What a press asks for in a test: play again from the tee (R, Backspace), the overview camera and back (V), back to Edit (Escape); null for none. */
export type PlayKey = "restart" | "view" | "leave" | null;
export function playKey(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">): PlayKey {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  return k === "r" || e.key === "Backspace" ? "restart" : k === "v" ? "view" : e.key === "Escape" ? "leave" : null;
}
