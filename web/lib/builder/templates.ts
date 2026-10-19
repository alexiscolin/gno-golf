// What a new hole starts from: one of its world's starters (starters.ts,
// written by scripts/starters.ts), its green read from its rails (surface.ts
// surfaceIn) so it is painted bigger or smaller at once; or from scratch:
// the smallest plain green the checks take, the tee and the cup at its ends,
// to draw the hole on (scratch). Each passes every
// check in every world (test/builder-templates.test.ts): a new hole is never
// one the Builder refuses, and every edit after it keeps it so.
import { emptyDraft, type Draft, type Piece, type V } from "./draft";
import { entryParts, frame } from "./gg1";
import { MIN_WIDE, SURFACE_RAIL, surfaceOf } from "./surface";
import { STARTERS } from "./starters";
import { cap, worldName } from "./rules";

/** A new hole's choice: its name in the list ("dogleg"), its card's title (the starter's, not the new hole's name) and one line, and the draft it opens (its par). */
export interface Start {
  name: string;
  title: string;
  line: string;
  draft: Draft;
}

/** From scratch: the smallest plain green the checks take (MIN_WIDE across, the tee and the cup a ball's room from its ends). */
const W = 2 * MIN_WIDE, H = MIN_WIDE;
const rail = (id: string, a: V, b: V): Piece => ({ id, entry: SURFACE_RAIL, geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });

/** A plain green in a world, walled by itself, the tee and the cup at its ends, framed; par the lowest its world's starters have. */
export function scratch(world: string): Draft {
  const own = Object.hasOwn(STARTERS, world) ? Object.values(STARTERS[world]) : [];
  const d = frame({
    ...emptyDraft(world), par: Math.min(...own.map((s) => s.par)), tee: [1.5, H / 2], pin: [W - 1.5, H / 2],
    pieces: [rail("p1", [0, 0], [W, 0]), rail("p2", [W, 0], [W, H]), rail("p3", [W, H], [0, H]), rail("p4", [0, H], [0, 0])],
  });
  return { ...d, surface: surfaceOf(d)! };
}

/** A new hole's choices in a world: its starters (scripts/starters.ts), then from scratch (none for a world with no starters), each a fresh copy, named from its world and starter ("Garden Dogleg", "Island Tidepool"), its address from its name. */
export function startsIn(world: string): Start[] {
  const own = Object.hasOwn(STARTERS, world) ? STARTERS[world] : {};
  const named = (d: Draft, what: string) => retitle({ ...d, slug: "" }, `${worldName(world)} ${what}`);
  const starts = Object.entries(own).map(([name, d]) => ({ name, title: d.title, line: startLine(name, d), draft: named(structuredClone(d), cap(d.title.replace(/^The /, ""))) }));
  return starts.length ? [...starts, { name: "scratch", title: "From scratch", line: "A plain green to draw on", draft: named(scratch(world), "Green") }] : [];
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
