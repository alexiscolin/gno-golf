// Ghost duels (ADR-004): a normal round raced against another player's best,
// replayed stroke by stroke on a see-through gnome. This is the pure part:
// which best a duel races, how fast a ghost's stroke plays, and how a result
// reads. The result is the client's arithmetic (V1 records no duel), from two
// numbers the chain vouches for: the player's strokes and the rival's best.
import { SHARE_TAGS } from "./site";
import type { Ghost, Mode } from "./types";

/** A duel under way: the ghost raced and who it is, as said on screen. */
export interface Duel {
  ghost: Ghost;
  /** the rival's gno.land name, or their short address */
  name: string;
  /** racing their own best */
  self: boolean;
}

/** The best a duel races: the rival's in the player's aim mode if they have
 *  one, else their other one (the race then marked mixed). */
export const pickGhost = (mode: Mode, ghosts: Readonly<Record<Mode, Ghost | null>>) =>
  ghosts[mode] || ghosts[mode === "pro" ? "assisted" : "pro"];

const SKIES: Readonly<Record<string, string>> = { wind: "wind", fog: "fog", rain: "rain", storm: "a storm", snow: "snow" };
/** A weather's kind (Weather() "kind"), as a duel says it; anything else is clear. */
export const skyWord = (kind: string) => (Object.hasOwn(SKIES, kind) ? SKIES[kind] : "clear skies");

/** A ghost's shots, one "angle,power,tick" each. */
export const shotsOf = (g: Ghost) => g.shots.split(";");

// a ghost's stroke plays at twice the speed, faster still to fit its steps in
// about 2 s (a splash or a tube keeps its own time): never much longer than the wait it replaces
const GHOST_MS = 2000;
/** The speed a ghost's stroke plays at, for a stroke that takes ms at the player's pace. */
export const ghostSpeed = (ms: number) => Math.max(2, ms / GHOST_MS);

/** What the score card says is left, before the next stroke n of a race against a best of r:
 *  the last stroke that wins, the one that ties, else the target. */
export const toBeat = (n: number, r: number) => (n > r ? "out of reach" : n === r ? "hole it to tie" : n === r - 1 ? "hole it to win" : `${r} to beat`);

/** A number of strokes as said in a title: one is a word. */
const inWords = (d: number) => (d === 1 ? "one" : String(d));

/** How a finished duel reads: the card's title and its line. */
export function duelResult(mine: number, d: Duel, term: string) {
  const theirs = d.ghost.strokes, by = inWords(Math.abs(mine - theirs));
  // the title from the player's side, short and big; who and by how much in the line under it
  const line = (who: string) => `${who}${mine === theirs ? `${mine} ${mine === 1 ? "stroke" : "strokes"} each` : `${mine} to ${d.self ? "your" : "their"} ${theirs}`} · ${term}`;
  if (mine === theirs) return { result: "tie" as const, title: d.self ? (mine === 1 ? "You matched your ace!" : "You tied your best") : mine === 1 ? "Ace for ace!" : "Tie!", line: line(d.self ? "" : `Tied with ${d.name} · `) };
  if (mine < theirs) return { result: "win" as const, title: d.self ? "You beat your best!" : "You win!", line: line(d.self ? "" : `You beat ${d.name} by ${by} · `) };
  return { result: "loss" as const, title: d.self ? `Your best still stands, by ${by}` : "You lose", line: line(d.self ? "" : `${d.name} wins by ${by} · `) };
}

/** The share text of a finished duel: once saved (a dare back), or the rival's
 *  own dare passed on by a player who can't save. */
export function duelShare(r: ReturnType<typeof duelResult>["result"], d: Duel, hole: string, mine: number, saved: boolean, mixed = false) {
  const tag = (mixed ? " (mixed aim, not a record)" : "") + SHARE_TAGS, theirs = d.ghost.strokes;
  if (!saved && r === "win" && !d.self) return `⚔ Beat ${d.name}'s ${theirs} with ${mine} on ${hole}. Can you? Free to play, no wallet needed.` + tag;
  if (!saved) return `⚔ Can you beat ${d.self ? "my" : `${d.name}'s`} ${theirs} on ${hole}? Free to play, no wallet needed.` + tag;
  if (d.self) return `⚔ ${hole} in ${mine}, raced against my own ghost. Race it too: free to play, no wallet needed.` + tag;
  if (r === "win") return `⚔ Beat ${d.name} on ${hole}, ${mine} to ${theirs}. My ghost is waiting. Free to play, no wallet needed.` + tag;
  if (r === "loss") return `⚔ ${d.name} beat me by ${inWords(mine - theirs)} on ${hole}. Race my ghost while I rematch.` + tag;
  return `⚔ ${d.name} and I both holed ${hole} in ${mine}. Settle it.` + tag;
}
