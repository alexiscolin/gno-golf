// A hole's world — what stands round the board. The state's `world` picks
// one ("garden" when it says nothing); the garden is in the main bundle and
// the others load on demand (loadWorld, once each). Each world module exports:
//
//   base(s, box)      -> Object3D   the island itself: ground slab and sides
//   edging(s, box)    -> Object3D   detail on its rim and sides
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
import type * as THREE from "three";
import * as garden from "./garden";
import { GRASS } from "./common";
import type { Terrain } from "../terrain";
import type { Extras, Post, Wall, Zone } from "../types";
import type { Hole, Height, Fade, Dress } from "./data";

/** What a world's decor is: an Object3D, a canopy fade and a weather dress on it. */
type Decor = THREE.Object3D & { userData: { fade?: Fade | null; weather?: Dress | null } };
/** A bar as a world draws it: its walls, skin, centre, length, thickness and angle. */
export interface Bar {
  walls: readonly Wall[];
  skin: string;
  c: readonly [number, number];
  length: number;
  thick: number;
  ang: number;
}
/** The rough's look: its colours, how high it mounds, what it plants. */
export interface Rough {
  lo: number;
  hi: number;
  mound?: number;
  plant?: (rand: () => number, s: Hole, x: number, z: number) => THREE.Object3D | null;
}
/** A world module (see the list above). */
export interface World {
  base(s: Hole, box: THREE.Box3): THREE.Object3D;
  edging(s: Hole, box: THREE.Box3): THREE.Object3D;
  berms(s: Hole): { group: THREE.Object3D; height: Height };
  decor(s: Hole, bank: Height): Decor;
  rough?: Rough;
  green?: readonly [number, number] | ((s: Hole) => readonly [number, number] | "planks" | null) | "planks" | null;
  kerb?: { color: number; post: number };
  edgeInk?: boolean;
  SEA?: number;
  piece?(kind: "post", item: Post, t: Terrain, s: Hole): THREE.Object3D | null | undefined | void;
  piece?(kind: "wall", item: Bar, t: Terrain, s: Hole): THREE.Object3D | null | undefined | void;
  piece?(kind: "zone", item: Zone, t: Terrain, s: Hole): THREE.Object3D | null | undefined | void;
  extras?(ex: Extras, s: Hole, t: Terrain): { group: THREE.Object3D; skins: Set<string> } | null | undefined;
}

const LOADERS: Record<string, () => Promise<World>> = {
  island: () => import("./island"),
  town: () => import("./town"),
  mountain: () => import("./mountain"),
};
const WORLDS: Record<string, World> = { garden };
const pending: Record<string, Promise<World>> = {};

/** Loads a world's module (once; later calls return at once). */
export function loadWorld(name: string | null | undefined): Promise<World> {
  if (!name || WORLDS[name] || !LOADERS[name]) return Promise.resolve((name && WORLDS[name]) || garden);
  // a failed load (offline, a deploy mid-flight) is forgotten, so the next
  // call tries again instead of failing forever
  return (pending[name] ||= LOADERS[name]().then((m) => (WORLDS[name] = m)).catch((e: unknown) => { delete pending[name]; throw e; }));
}

export const worldOf = (s: Pick<Hole, "world">): World => WORLDS[s.world] || garden;

/**
 * A world's own drawing of an on-lane piece, if it has one: worldOf(s).piece
 * (kind: "post" | "wall" | "zone", item: the post, the bar {walls, skin, c,
 * length, thick, ang} or the zone, t: the terrain, s: the hole) returns an
 * Object3D, or nothing to leave it to the shared drawing.
 */
export function fromWorld(s: Hole, kind: "post", item: Post, t: Terrain): THREE.Object3D | null;
export function fromWorld(s: Hole, kind: "wall", item: Bar, t: Terrain): THREE.Object3D | null;
export function fromWorld(s: Hole, kind: "zone", item: Zone, t: Terrain): THREE.Object3D | null;
export function fromWorld(s: Hole, kind: "post" | "wall" | "zone", item: Post | Bar | Zone, t: Terrain): THREE.Object3D | null {
  // (a world module's function, not a method: no this)
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const w = worldOf(s).piece as ((kind: string, item: unknown, t: Terrain, s: Hole) => unknown) | undefined;
  const m = w && w(kind, item, t, s);
  return m && (m as THREE.Object3D).isObject3D ? (m as THREE.Object3D) : null;
}

export const DECK = 0.3; // a boardwalk's planks and joists: its cut face, over open water
// how deep a gap in the lane goes (a crevasse, a ditch, a cliff): the ground's
// gap sides (course.ts) and the walls drawn down them (zones.ts, mountain.ts) meet there
export const GAP_Y = -7;
// the water under a boardwalk's missing planks: the world's sea, or a pool as
// far down where the world has none (zones.ts deckGap draws it)
export const gapWater = (s: Hole) => worldOf(s).SEA ?? GRASS - 0.9;
