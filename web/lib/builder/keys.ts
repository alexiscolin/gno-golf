// The editor's keys (the game-design review's quick win 8): what a key press
// asks for, beside the editor's own (arrows, R, Delete, ⌘Z, Enter, Escape),
// and every key in words, one list for the board's key line (short) and the
// glossary (long). "mod" is ⌘ on a Mac, Ctrl elsewhere.

/** What a press asks for: a palette piece armed (the first five, n from 0), the hole framed, Test; null for none of these. */
export type KeyAction = { t: "arm"; n: number } | { t: "frame" } | { t: "test" } | null;

export function keyAction(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">): KeyAction {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (/^[1-5]$/.test(e.key)) return { t: "arm", n: Number(e.key) - 1 };
  const k = e.key.toLowerCase();
  return k === "f" ? { t: "frame" } : k === "t" ? { t: "test" } : null;
}

/** The keys in words: the key line's few, the glossary's sentence. */
export const KEYS: readonly { key: string; short: string; long: string }[] = [
  { key: "1–5", short: "Pieces", long: "pick one of the first five pieces" },
  { key: "R", short: "Turn", long: "turns the selected piece" },
  { key: "⌫", short: "Delete", long: "deletes it" },
  { key: "modZ", short: "Undo", long: "undoes (with ⇧, redoes)" },
  { key: "Space", short: "Pan", long: "held, a drag pans the board" },
  { key: "F", short: "Frame", long: "frames the whole hole" },
  { key: "T", short: "Test", long: "plays it in Test" },
  { key: "Esc", short: "Back", long: "drops the piece in hand, or leaves Test" },
];
