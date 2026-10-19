// The editor's keys (the game-design review's quick win 8): what a key press
// asks for, beside the editor's own (arrows, R, Delete, ⌘Z, Enter, Escape),
// and every key in words, one list for the board's key line (short) and the
// glossary (long). "mod" is ⌘ on a Mac, Ctrl elsewhere.
import { COMMON } from "./palette";

/** The digits that arm a piece: one for each of the palette's first pieces (palette.ts COMMON). */
const PIECE_KEYS = COMMON.length;
const NUMBERS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** What a press asks for: a palette piece armed (the first ones, n from 0), the hole framed, Play, the 3D board tilted or turned a quarter, the player's view large, the green's paint taken up or put down, every key shown (?); null for none of these. */
export type KeyAction = { t: "arm"; n: number } | { t: "frame" } | { t: "paint" } | { t: "play" } | { t: "tilt" } | { t: "turn"; by: 1 | -1 } | { t: "view" } | { t: "help" } | null;

export function keyAction(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey"> & { shiftKey?: boolean }): KeyAction {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (/^[1-9]$/.test(e.key) && Number(e.key) <= PIECE_KEYS) return { t: "arm", n: Number(e.key) - 1 };
  if (e.key === "?") return { t: "help" };
  const k = e.key.toLowerCase();
  return k === "f" ? { t: "frame" } : k === "t" ? { t: "play" } : k === "v" ? { t: "tilt" } : k === "q" ? { t: "turn", by: e.shiftKey ? -1 : 1 } : k === "p" ? { t: "view" } : k === "b" ? { t: "paint" } : null;
}

/** The keys in words: the key line's few (line: the board's one line, the most used and ?), the glossary's sentence (every one). */
export const KEYS: readonly { key: string; short: string; long: string; line?: true }[] = [
  { key: `1–${PIECE_KEYS}`, short: "Pieces", long: `pick one of the first ${NUMBERS[PIECE_KEYS]} pieces`, line: true },
  { key: "B", short: "Green", long: "paints the green (again: the pieces): a drag grows or shrinks it, its walls following (⇧: straight); a side dragged moves it, clicked opens it where water keeps the ball in; Tab to a side: the arrows move it, Enter opens it (painting takes the pointer)", line: true },
  { key: "R", short: "Turn", long: "turns the selected piece", line: true },
  { key: "Enter", short: "Drop", long: "drops the piece in hand between the tee and the cup" },
  { key: "⌫", short: "Delete", long: "deletes it (Delete too)" },
  { key: "modD", short: "Copy", long: "duplicates the selected piece" },
  { key: "←↑→↓", short: "Nudge", long: "move the selected piece, the tee or the cup half a cell (with ⇧, two)" },
  { key: "modZ", short: "Undo", long: "undoes (with ⇧, redoes)", line: true },
  { key: "Space", short: "Pan", long: "held, a drag pans the board" },
  { key: "F", short: "Frame", long: "frames the whole hole" },
  { key: "V", short: "Tilt", long: "tilts the board a little, to see heights and shadows (again: straight down)" },
  { key: "Q", short: "Rotate", long: "turns the board a quarter (with ⇧, the other way)" },
  { key: "P", short: "View", long: "shows the player's view large, the hole from its tee" },
  { key: "T", short: "Play", long: "plays the hole: each round you sink is a try at the next weather, until every one is holed", line: true },
  { key: "⇧ drag", short: "Quick shot", long: "on the board, not painting (or a drag from the ball by the tee), pulls back a quick shot from the tee, or from where the last one stopped (calm weather; just to try)" },
  { key: "Esc", short: "Back", long: "drops the piece in hand, the paint, the selection and the quick shots; in play, back to Build (R or ⌫ plays again, V swaps the view)" },
  { key: "?", short: "All keys", long: "the hints again, the world's pieces and every key", line: true },
];
/** The board's key line: the few keys most used, and ? for every one. Shown for a browser's first visit to the editor only (seen). */
export const KEY_LINE = KEYS.filter((k) => k.line);

/** A one-time help: the board's key line, the Inspector's "drag it". */
export type Once = "keys" | "drag";
const onceKey = (what: Once) => `gnogolf.builder.seen.${what}`;
/** Whether a one-time help was shown on an earlier visit of this browser (a browser that keeps nothing: never, so it shows each time; never throws). */
export function seen(what: Once): boolean {
  try { return !!localStorage.getItem(onceKey(what)); } catch { return false; }
}
/** A one-time help shown: from the next visit on, not again. */
export function markSeen(what: Once) {
  try { localStorage.setItem(onceKey(what), "1"); } catch {}
}
/** The helps shown on this visit (this page's load): they stay until it ends, an editor opened again or not. */
const shownNow = new Set<Once>();
/** Whether a one-time help shows: not seen on an earlier visit, or shown already on this one. */
export const showOnce = (what: Once) => shownNow.has(what) || !seen(what);
/** A one-time help actually shown (not merely its place mounted): seen from the next visit on, kept for this one. */
export function shownOnce(what: Once) {
  shownNow.add(what);
  markSeen(what);
}

/** What a press asks for in play: play again from the tee (R, Backspace), the overview camera and back (V), back to Build (Escape); null for none. */
export type PlayKey = "restart" | "view" | "leave" | null;
export function playKey(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">): PlayKey {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  return k === "r" || e.key === "Backspace" ? "restart" : k === "v" ? "view" : e.key === "Escape" ? "leave" : null;
}
