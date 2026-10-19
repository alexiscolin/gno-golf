// What a new hole starts from: one of its world's starters (starters.ts,
// written by scripts/starters.ts), its green read from its rails (surface.ts
// surfaceOf) so it is painted bigger or smaller at once; a blank lane is
// no start any more (painting the green replaces it). Each passes every
// check in every world (test/builder-templates.test.ts): a new hole is never
// one the Builder refuses, and every edit after it keeps it so.
import type { Draft } from "./draft";
import { entryParts } from "./gg1";
import { STARTERS } from "./starters";
import { surfaceOf } from "./surface";
import { cap, worldName } from "./rules";

/** A new hole's choice: its name in the list ("dogleg"), its card's title and one line, its par, and the draft it opens. */
export interface Start {
  name: string;
  title: string;
  line: string;
  par: number;
  draft: Draft;
}

/** A new hole's choices in a world: its starters (scripts/starters.ts), each a fresh copy, its green painted from its rails, named from its world and starter ("Garden Dogleg", "Island Tidepool"), its address from its name. */
export function startsIn(world: string): Start[] {
  const own = Object.hasOwn(STARTERS, world) ? STARTERS[world] : {};
  const named = (d: Draft, what: string) => retitle({ ...d, slug: "" }, `${worldName(world)} ${what}`);
  const painted = (d: Draft): Draft => {
    const s = surfaceOf(d);
    return s ? { ...d, surface: s } : d;
  };
  return Object.entries(own).map(([name, d]) => ({ name, title: d.title, line: startLine(name, d), par: d.par, draft: named(painted(structuredClone(d)), cap(d.title.replace(/^The /, ""))) }));
}

/** What a starter's card says it is, in a line: the straight and the dogleg by their shape, a signature by its world's own piece (its first that is not a rail) and what it does to the ball. */
export function startLine(name: string, d: Draft): string {
  if (name === "straight") return "A short lane to learn the tools";
  if (name === "dogleg") return "One turn to bank around";
  const sig = d.pieces.find((p) => p.geometry.t !== "rail");
  const { kind, skin } = sig ? entryParts(sig.entry) : { kind: "", skin: "" };
  const what = skin || kind;
  switch (kind) {
    case "post": return `A ${what} in the lane: play round it`;
    case "hazard": return `A ${what} in the lane: keep the ball out of it`;
    case "slope": return `A ${what} in the lane: roll up and over it`;
    case "surface": return `A patch of ${what}: it changes the roll`;
    default: return sig ? `The world's own ${what}, to play round` : "A lane of the world's own";
  }
}

/** Where the browser keeps that the first run's hints were seen. */
export const HINTS_KEY = "gnogolf.builder.hinted";

/** A new player's first hole (the GUI spec's B1): the Garden's dogleg, opened at once; none once hinted or once they have drafts. */
export function firstRun(drafts: readonly Draft[], hinted: boolean): Draft | null {
  return drafts.length || hinted ? null : startsIn("garden").find((s) => s.name === "dogleg")?.draft ?? null;
}

/**
 * An address made from a name: lower case, a dash between words, at most 32.
 * A name with nothing of a-z0-9 in it (another script, emoji) is "hole-" and
 * six of its own hash's letters: every such hole an address of its own, never
 * a new version of another (the author's "hole"); "hole" for no name at all.
 */
export const slugOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 32).replace(/-+$/, "") || (title.trim() ? `hole-${hashOf(title.trim())}` : "hole");
/** Six base-36 letters of a text's FNV-1a hash (a name's own, the same each time). */
function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(36).padStart(6, "0").slice(-6);
}
/** An address typed by hand (Publish's): what the chain takes, a dash for anything else, at most 32. */
export const typedSlug = (typed: string) => typed.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);

/**
 * The hole renamed: its address follows its name (slugOf) while it is the
 * name's own or none, until the hole is first proved (the proofs are bound
 * to its address); an address set by hand stays.
 */
export function retitle(d: Draft, title: string): Draft {
  const follows = !d.proofs.length && (!d.slug || d.slug === slugOf(d.title));
  return { ...d, title, slug: follows ? slugOf(title) : d.slug };
}
