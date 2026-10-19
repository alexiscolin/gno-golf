// The Builder's start screen's cards (components/builder/Start.tsx): a
// starter's or a draft's map, drawn as the game draws a hole's
// (components/HoleMap.tsx, from the pieces gg1.ts writes), and where a draft
// stands on its way to the chain: its weathers holed, from its proofs.
import type { MapHole } from "../duel";
import type { Post, Wall, Zone } from "../types";
import type { Draft } from "./draft";
import { draftHole } from "./gg1";
import { unproven } from "./proof";
import { FIELD, required, weatherName } from "./rules";
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

/** Where a draft stands: no weather holed for the hole as it is now, some, or every one (ready to publish). */
export type DraftStage = "new" | "testing" | "ready";

/**
 * A draft's stage and its weathers as its card ticks them ("Clear ✓ · Wind ·
 * Rain"), from its proofs for the hole as it is now (key: proof.ts proofKey;
 * null: not known, or the hole does not fit: none holed) under next, the id
 * it would be published under, as the Editor and Publish count them
 * (unproven; null, not known: the best of its ids). again: every weather
 * sunk under another id but not under next, its version to play for ("v2";
 * "" none).
 */
export function draftState(d: Pick<Draft, "world" | "proofs">, key: string | null, next: string | null = null): { stage: DraftStage; ticks: { kind: string; done: boolean }[]; word: string; again: string } {
  const all = required(d.world), ids = key ? [...new Set(d.proofs.filter((p) => p.key === key).map((p) => p.id))] : [];
  const best = ids.map((id) => unproven(d.proofs, d.world, key!, id)).sort((a, b) => a.length - b.length)[0] ?? all;
  const left = next === null ? best : key ? unproven(d.proofs, d.world, key, next) : all;
  const ticks = all.map((kind) => ({ kind, done: !left.includes(kind) }));
  const again = left.length && !best.length && next ? next.slice(next.lastIndexOf("/") + 1) : "";
  return { stage: !left.length ? "ready" : left.length < all.length ? "testing" : "new", ticks, word: ticks.map((t) => `${weatherName(t.kind)}${t.done ? " ✓" : ""}`).join(" · "), again };
}
