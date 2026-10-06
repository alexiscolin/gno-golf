// What a new hole starts from: a blank hole, a plain lane of rails with the
// tee and the cup at its ends, framed. It passes every check in every world
// (test/builder-templates.test.ts): a new hole is never one the Builder
// refuses, and every edit after it keeps it so.
import { emptyDraft, type Draft, type Piece, type V } from "./draft";
import { frame } from "./gg1";

/** The blank lane's size: long enough to play, narrow enough to aim. */
const W = 28, H = 12;
const rail = (id: string, a: V, b: V): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });

/** A blank hole in a world. */
export function blank(world: string): Draft {
  return frame({
    ...emptyDraft(world), tee: [3, H / 2], pin: [W - 3, H / 2],
    pieces: [rail("p1", [0, 0], [W, 0]), rail("p2", [W, 0], [W, H]), rail("p3", [W, H], [0, H]), rail("p4", [0, H], [0, 0])],
  });
}
