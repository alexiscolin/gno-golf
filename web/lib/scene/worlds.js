// A hole's world — what stands round the board. The state's `world` picks
// one ("garden" when it says nothing); the garden is in the main bundle and
// the others load on demand (loadWorld, once each). Each world module exports:
//
//   base(s, box)      -> Object3D   the island itself: ground slab and sides
//   edging(box, seed) -> Object3D   detail on its rim and sides
//   berms(s)          -> { group, height(x, z) }  the ground round the board
//   decor(s, bank)    -> Object3D   everything planted round it; off the board
//                                   rect, footprints reserved. decor.userData.fade
//                                   = fade(eye, ball) for a canopy (see fadeLoop)
// and may export (all optional):
//   rough   { lo, hi, mound?, plant?(rand, s, x, z) -> Object3D | null }
//           the board's unreachable ground; no mound = flat: not drawn at all,
//           the world's own ground shows
//   green   [a, b] | (s) => [a, b] | "planks" | null   the lane's stripes
//   kerb    { color, post }                  its rails
//   edgeInk false to hide the green's edge line
//   SEA     the world's sea level: "sea" zones are left open over it
//   piece(kind, item, t, s) -> Object3D?     its own drawing of a lane piece
//   extras(ex, s, t) -> { group, skins: Set }?  its own drawing of a stroke's pieces
//
// s is the hole state (board, walls, zones, cup, start, hole id, world). The
// board itself (green, rough, walls, zones, cup) is common to all.
import * as garden from "./garden.js";

const LOADERS = {
  island: () => import("./island.js"),
  town: () => import("./town.js"),
  mountain: () => import("./mountain.js"),
};
export const WORLDS = { garden };
const pending = {};

/** Loads a world's module (once; later calls return at once). */
export function loadWorld(name) {
  if (!name || WORLDS[name] || !LOADERS[name]) return Promise.resolve(WORLDS[name] || garden);
  // a failed load (offline, a deploy mid-flight) is forgotten, so the next
  // call tries again instead of failing forever
  return (pending[name] ||= LOADERS[name]().then((m) => (WORLDS[name] = m)).catch((e) => { delete pending[name]; throw e; }));
}

export const worldOf = (s) => WORLDS[s.world] || garden;
