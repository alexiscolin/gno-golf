// Ghost duels (ADR-004): a normal round raced against another player's best,
// replayed stroke by stroke on a see-through gnome. This is the pure part:
// which best a duel races, how fast a ghost's stroke plays, and how a result
// reads. The result is the client's arithmetic (V1 records no duel), from two
// numbers the chain vouches for: the player's strokes and the rival's best.
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

/** A ghost's shots, one "angle,power,tick" each. */
export const shotsOf = (g: Ghost) => g.shots.split(";");

// a ghost's stroke plays at twice the speed, faster still to fit in 2 s:
// never longer than the wait it replaces
const GHOST_MS = 2000;
/** The speed a ghost's stroke plays at, for a stroke that takes ms at the player's pace. */
export const ghostSpeed = (ms: number) => Math.max(2, ms / GHOST_MS);

/** A number of strokes as said in a title: one is a word. */
const by = (d: number) => (d === 1 ? "one" : String(d));

/** How a finished duel reads: the card's title and its line. */
export function duelResult(mine: number, d: Duel, term: string) {
  const theirs = d.ghost.strokes, gap = Math.abs(mine - theirs);
  const line = mine === theirs ? `${mine} ${mine === 1 ? "stroke" : "strokes"} each · ${term}` : `${mine} to their ${theirs} · ${term}`;
  if (mine === theirs) return { result: "tie" as const, title: mine === 1 ? `You matched ${d.name}'s ace!` : d.self ? "You tied your best" : `Tied with ${d.name}`, line };
  if (mine < theirs) return { result: "win" as const, title: d.self ? "You beat your best!" : `You beat ${d.name}!`, line };
  return { result: "loss" as const, title: d.self ? `Your best still stands, by ${by(gap)}` : `${d.name} wins by ${by(gap)}`, line };
}

/** The share text of a finished duel: once saved (a dare back), or the rival's
 *  own dare passed on by a player who can't save. */
export function duelShare(r: ReturnType<typeof duelResult>["result"], d: Duel, hole: string, mine: number, saved: boolean) {
  const tag = " #gnoland @_gnoland", theirs = d.ghost.strokes;
  if (!saved) return `⚔ Can you beat ${d.name}'s ${theirs} on ${hole}? Free to play, no wallet needed.` + tag;
  if (r === "win") return `⚔ Beat ${d.name} on ${hole}, ${mine} to ${theirs}. My ghost is waiting. Free to play, no wallet needed.` + tag;
  if (r === "loss") return `⚔ ${d.name} beat me by ${by(mine - theirs)} on ${hole}. Race my ghost while I rematch.` + tag;
  return `⚔ ${d.name} and I both holed ${hole} in ${mine}. Settle it.` + tag;
}
