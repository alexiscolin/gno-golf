// What a new hole starts from: one of its world's starters (starters.ts,
// written by scripts/starters.ts), or a blank lane of rails with the tee and
// the cup at its ends, framed. Each passes every check in every world
// (test/builder-templates.test.ts): a new hole is never one the Builder
// refuses, and every edit after it keeps it so.
import { emptyDraft, type Draft, type Piece, type V } from "./draft";
import { frame } from "./gg1";
import { STARTERS } from "./starters";
import { worldName } from "./rules";

/** The blank lane's size: long enough to play, narrow enough to aim. */
const W = 28, H = 12;
const rail = (id: string, a: V, b: V): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });

/** A new hole's choices in a world: its starters (scripts/starters.ts), then a blank lane; each a fresh copy, named from its world and starter ("Garden Dogleg"), its address from its name. */
export function startsIn(world: string): { name: string; title: string; draft: Draft }[] {
  const own = Object.hasOwn(STARTERS, world) ? STARTERS[world] : {};
  const named = (d: Draft, what: string) => retitle({ ...d, slug: "" }, `${worldName(world)} ${what}`);
  return [
    ...Object.entries(own).map(([name, d]) => ({ name, title: `${d.title} · par ${d.par}`, draft: named(structuredClone(d), d.title) })),
    { name: "blank", title: "A blank lane", draft: named(blank(world), "Lane") },
  ];
}

/** An address made from a name: lower case, a dash between words, at most 32 ("hole" if nothing is left). */
export const slugOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 32).replace(/-+$/, "") || "hole";

/**
 * The hole renamed: its address follows its name (slugOf) while it is the
 * name's own or none, until the hole is first proved (the proofs are bound
 * to its address); an address set by hand stays.
 */
export function retitle(d: Draft, title: string): Draft {
  const follows = !d.proofs.length && (!d.slug || d.slug === slugOf(d.title));
  return { ...d, title, slug: follows ? slugOf(title) : d.slug };
}

/** A blank hole in a world. */
export function blank(world: string): Draft {
  return frame({
    ...emptyDraft(world), tee: [3, H / 2], pin: [W - 3, H / 2],
    pieces: [rail("p1", [0, 0], [W, 0]), rail("p2", [W, 0], [W, H]), rail("p3", [W, H], [0, H]), rail("p4", [0, H], [0, 0])],
  });
}
