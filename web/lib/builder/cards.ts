// The Builder's start screen's cards (components/builder/Start.tsx): a
// starter's or a draft's map, drawn as the game draws a hole's
// (components/HoleMap.tsx, from the pieces gg1.ts writes), and where a draft
// stands on its way to the chain, from its proofs.
import type { MapHole } from "../duel";
import type { Post, Wall, Zone } from "../types";
import type { Draft } from "./draft";
import { draftHole } from "./gg1";
import { unproven } from "./proof";
import { FIELD, required } from "./rules";
import type { PostIn, WallIn, ZoneIn } from "./types";

const wall = (w: WallIn, moving = false): Wall => ({ a: w.a, b: w.b, skin: w.skin ?? "", every: moving ? w.every || 1 : (w.every ?? 0), on: w.on ?? 0, phase: w.phase ?? 0 });
const post = (p: PostIn): Post => ({ c: p.c, r: p.r, skin: p.skin ?? "" });
const zone = (z: ZoneIn): Zone => ({
  kind: z.kind, min: z.min, max: z.max, vec: z.vec ?? [0, 0], scale: z.scale ?? 0, round: !!z.round, skin: z.skin ?? "", air: !!z.air,
  every: z.every ?? 0, on: z.on ?? 0, phase: z.phase ?? 0, ...(z.poly?.length && { poly: z.poly, outside: !!z.outside }),
});

/**
 * A draft as a hole's map draws it: its pieces as gg1.ts writes them (a bar
 * round its four corners), its world's cup. A piece of a pulse comes and
 * goes: drawn as a moving one.
 */
export function draftMap(d: Draft): MapHole {
  const { hole } = draftHole(d, Object.hasOwn(FIELD, d.world) ? FIELD[d.world] : FIELD.garden, true);
  const pulsed = hole.pulses;
  return {
    world: d.world, start: d.tee, cup: d.pin, cupR: hole.cupR,
    walls: [...hole.walls.map((w) => wall(w)), ...pulsed.flatMap((p) => p.walls.map((w) => wall(w, true)))],
    posts: [...hole.posts, ...pulsed.flatMap((p) => p.posts)].map(post),
    zones: [...hole.zones, ...pulsed.flatMap((p) => p.zones)].map(zone),
  };
}

/** Where a draft stands: never tested, changed since its test, holed in some weathers, or in every one (ready to publish). */
export type DraftStage = "new" | "changed" | "testing" | "ready";

/**
 * A draft's stage and its words, from its proofs for the hole as it is now
 * (key: proof.ts proofKey; null: not known, or the hole does not fit): the
 * best of its ids, as the Publish step counts them (unproven).
 */
export function draftState(d: Pick<Draft, "world" | "proofs">, key: string | null): { stage: DraftStage; word: string } {
  if (!d.proofs.length) return { stage: "new", word: "Not tested yet" };
  const ids = [...new Set(d.proofs.filter((p) => p.key === key).map((p) => p.id))];
  if (!key || !ids.length) return { stage: "changed", word: "Changed since its test" };
  const left = Math.min(...ids.map((id) => unproven(d.proofs, d.world, key, id).length)), all = required(d.world).length;
  return left ? { stage: "testing", word: `Holed in ${all - left} of ${all} weathers` } : { stage: "ready", word: "Ready to publish" };
}
