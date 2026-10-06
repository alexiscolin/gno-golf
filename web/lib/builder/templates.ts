// What a new hole starts from: one of its world's starters (starters.ts,
// written by scripts/starters.ts), or a blank lane of rails with the tee and
// the cup at its ends, framed. Each passes every check in every world
// (test/builder-templates.test.ts): a new hole is never one the Builder
// refuses, and every edit after it keeps it so.
import { emptyDraft, type Draft, type Piece, type V } from "./draft";
import { frame } from "./gg1";
import { STARTERS } from "./starters";

/** The blank lane's size: long enough to play, narrow enough to aim. */
const W = 28, H = 12;
const rail = (id: string, a: V, b: V): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });

/** A new hole's choices in a world: its starters (scripts/starters.ts), then a blank lane; each a fresh copy. */
export function startsIn(world: string): { name: string; title: string; draft: Draft }[] {
  const own = Object.hasOwn(STARTERS, world) ? STARTERS[world] : {};
  return [
    ...Object.entries(own).map(([name, d]) => ({ name, title: `${d.title} · par ${d.par}`, draft: structuredClone(d) })),
    { name: "blank", title: "A blank lane", draft: blank(world) },
  ];
}

/** A blank hole in a world. */
export function blank(world: string): Draft {
  return frame({
    ...emptyDraft(world), tee: [3, H / 2], pin: [W - 3, H / 2],
    pieces: [rail("p1", [0, 0], [W, 0]), rail("p2", [W, 0], [W, H]), rail("p3", [W, H], [0, H]), rail("p4", [0, H], [0, 0])],
  });
}
