// The Builder's own piece limits (E16), stricter than the chain's on
// purpose: GG1 takes 160 walls, 32 posts and 32 zones, a hole no one reads
// at a glance; the Builder stops at what the busiest course hole holds and a
// little more (web/test/builder-limits.test.ts counts the course of the four
// classic worlds and holds these to it). The chain's limits stay the hard
// backstop (E8); a course hole past these plays in the game as it is.
import type { Issue } from "./checks";
import type { Draft, Piece } from "./draft";

/**
 * At most this many pieces, and this many of them moving (in a pulse, or
 * timed within a stroke). The course of the four classic worlds holds 50
 * pieces at most (30 its median), 6 of them moving at most: room for a
 * fifth more pieces, and two more moving ones, than the busiest course hole.
 */
export const BUILDER_LIMITS = { pieces: 60, moving: 8 } as const;

/** A piece that comes and goes: in a pulse, or timed within a stroke. */
export const isMoving = (p: Pick<Piece, "clock">) => p.clock.k !== "fixed";

/** What a draft counts against the Builder's limits. */
export const pieceCounts = (d: Pick<Draft, "pieces">) => ({ pieces: d.pieces.length, moving: d.pieces.filter(isMoving).length });

const err = (text: string): Issue => ({ rule: "E16", severity: "error", text });
const over = (n: number, max: number, what: string) => (n > max ? [err(`Too many ${what}: ${n} of ${max}`)] : []);

/** E16: the draft within the Builder's limits. */
export function builderLimits(d: Pick<Draft, "pieces">): Issue[] {
  const c = pieceCounts(d);
  return [...over(c.pieces, BUILDER_LIMITS.pieces, "pieces"), ...over(c.moving, BUILDER_LIMITS.moving, "moving pieces")];
}

/**
 * Why an edit may not go from before to after for the limits: a count it
 * takes past its limit, or further past it (a draft opened past them may
 * still lose pieces, move them, or still them); none, it may.
 */
export function pastLimits(before: Pick<Draft, "pieces">, after: Pick<Draft, "pieces">): Issue[] {
  const a = pieceCounts(before), b = pieceCounts(after);
  return [...(b.pieces > a.pieces ? over(b.pieces, BUILDER_LIMITS.pieces, "pieces") : []), ...(b.moving > a.moving ? over(b.moving, BUILDER_LIMITS.moving, "moving pieces") : [])];
}
