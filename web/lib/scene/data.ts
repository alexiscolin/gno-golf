// What the scene hangs on three's objects. three types every userData as a
// bag of anything; these are the keys this client uses, with their types, and
// ud()/md() are the one place a userData is read as them.
import type * as THREE from "three";
import type { HoleState, MutVec2, Wall, Zone } from "../types";
import type { Terrain } from "../terrain";
import type { WeatherNow } from "./weather";

/** A hole as the scene draws it: the chain's, `hole` keyed for its decor
 *  (engine.ts decorOf), and unbaked for the trailer's hole that builds itself. */
export interface Hole extends HoleState {
  unbaked?: boolean;
  /** the hazards a stroke's pulses lay (fetched ahead for a world that cuts the lane under them: worlds.ts ahead, open) */
  pulseZones?: readonly Zone[];
}

/** A mines hole's place in its cup (1..18), 0 off the mines (a hole dressed as the mines with ?world=). */
export const minesOrder = (s: Pick<Hole, "hole">) => Number(/^mines\/(\d+)/.exec(s.hole || "")?.[1]) || 0;
/** The mines' dark galleries (ADR-005 §6): lit only by the headlamp, the glowworms and the crystals, in any weather. */
export const darkGallery = (s: Pick<Hole, "hole">) => [2, 15].includes(minesOrder(s));
/** How far the aim dots see (0: all the way): 7 units in fog; in a dark gallery
 *  of the mines, the headlamp's 7 in any weather and 4 in fog. (The HUD and
 *  the rules say these numbers from here.) */
export const sight = (fog: boolean, dark: boolean) => (dark ? (fog ? 4 : 7) : fog ? 7 : 0);

/** The ground height at a board point (x, z): cosmetic, the physics is flat. */
export type Height = (x: number, z: number) => number;
/** A function of the scene's time in seconds, run each frame. */
export type Tick = (time: number) => void;
/** A canopy fading what stands between the eye and the ball. */
export type Fade = (eye: THREE.Vector3, ball: THREE.Vector3) => void;
/** A decor dressed for the weather (see weatherLooks). */
export type Dress = (w: WeatherNow | null) => void;

/** A timed piece driven by the engine's clock: at(step) with the substep shown. */
export interface Timed {
  at: (step: number) => void;
  walls?: readonly Wall[];
}
/** The hole's mill, driven by the replay. */
export interface Mill {
  shoot?: () => void;
  at?: (step: number) => void;
  idle?: () => void;
  started?: boolean;
}
/** A slope's contour lines, lit while the ball rolls on it (k: 0..1). */
export interface SlopeGlow {
  glow: (k: number) => void;
}
/** The curve a tunnel's tube follows; an arc is a throw through the air (a blowhole); a ride, a set piece that carries the ball along it. */
export type TubePath = THREE.Curve<THREE.Vector3> & { userData?: { arc?: boolean; ride?: Ride } };
/**
 * A tunnel ridden in a set piece (the mines' cage, cart, geyser...): the ball
 * taken along its curve for ms, at the curve's point ease(k) (k: 0..1 of the
 * time); each frame at(k, ball) moves the piece with it (and may move, hide
 * or turn the ball), and at(-1) when it is over; cam(k, pos, look) the camera's pose then ("cut": put there at once),
 * or false to leave it to the mode. The ball is drawn at size (1 by default).
 */
export interface Ride {
  ms: number;
  ease?: (k: number) => number;
  at?: (k: number, ball: THREE.Object3D) => void;
  cam?: (k: number, pos: THREE.Vector3, look: THREE.Vector3) => boolean | "cut";
  size?: number;
  /** a loop's: how far up its curve (a share of it) a ball too slow for it climbs at most before it rolls back out (0.5 by default) */
  climb?: number;
}
/** The water mask: one texel per terrain cell (green where there is water). */
export interface WaterMask {
  tex: THREE.DataTexture;
  data: Uint8Array;
  nx: number;
  nz: number;
  cell: number;
  w: number;
  h: number;
}

/** A terrain with what the course builds on it once and keeps there: the
 *  green's mask, the water's, and the green's edge (course.ts greenEdge). */
export type CourseTerrain = Terrain & {
  mask?: THREE.DataTexture;
  water?: WaterMask;
  edge?: { cells: Uint8Array; corner: (x: number, z: number) => MutVec2 };
  /** where rain lies: the drawn lane, off its water and gaps and from under its walls */
  dry?: (x: number, z: number) => boolean;
};

/** Keys any Object3D of the scene may carry. */
interface ObjData {
  /** moves or changes after the build: never baked */
  live?: boolean;
  /** a plant's foot (its local y) and how much it bends, for the sway */
  foot?: number;
  flex?: number;
  /** the weather looks a decor part shows in */
  look?: string[];
  /** what an object owns that no mesh holds, freed with it */
  owned?: { dispose(): void }[];
  /** a name for the probes' census */
  kind?: string;
  /** the flag over the cup, and its height at rest */
  isFlag?: boolean;
  baseY?: number;
  /** a world decor's canopy fade, and its weather dress */
  fade?: Fade | null;
  weather?: Dress | null;
  /** a live piece's per-frame function (a stroke's extras) */
  tick?: Tick;
  /** a stroke's extras' own timed pieces, and their dashed outlines while aiming (buildExtras) */
  timed?: Timed[];
  ghosts?: ((aiming: boolean) => void) | null;
  /** a world's timed bar that moves itself (course.ts timedPieces): clock(tick, e) with the clock's
   *  tick and how far in it is (0 away, 1 in place), in place of the pivot's rise and sink */
  clock?: (tick: number, e: number) => void;
  /** a stroke's extras the world animates from the last stroke's itself: swapped at once, not grown */
  steady?: boolean;
  // a prop's own, read by the decor that places it
  /** its radius */
  r?: number;
  /** its outline on the ground, grown by some units: board points */
  outline?: (grow: number) => MutVec2[];
  /** where a chimney's smoke comes out (world) */
  smokeAt?: THREE.Vector3;
  /** a waterfall's pool */
  pool?: { x: number; z: number; r: number };
  /** a palm: the top of its trunk; a lighthouse: its lamp; an arching palm: its crown and its reach */
  top?: THREE.Vector3;
  lamp?: THREE.Vector3;
  crown?: THREE.Object3D;
  reach?: number;
}
/** Keys a Material may carry. */
interface MatData {
  /** the shader hook it compiles with: meshes merge only with the same */
  hook?: string;
  /** an ink outline (the Low tier drops distant ones) */
  hull?: boolean;
  /** a fadeable material's opacity now, and its own opacity when see-through */
  fade?: number;
  base?: number;
  /** the mask it is clipped to */
  maskId?: string;
}

// three types userData as Record<string, any>: read through these, it is typed
/** An object's userData, typed. */
export const ud = (o: THREE.Object3D) => o.userData as ObjData;
/** o with d put on its userData, typed as carrying it: d is built whole, so a key it lacks does not compile. */
export const withData = <O extends THREE.Object3D, D extends object>(o: O, d: D) => (Object.assign(o.userData, d), o as O & { userData: D });
/** A material's userData, typed. */
export const md = (m: THREE.Material) => m.userData as MatData;

/** A built hole: the Group buildHole returns, and what it carries. */
export interface CourseData extends ObjData {
  wear: { mesh: THREE.Object3D };
  flag: THREE.Object3D | null;
  height: Height;
  lifts: boolean;
  terrain: CourseTerrain;
  wind: (v: readonly [number, number] | null) => void;
  fade: Fade | null;
  weather: Dress | null;
  state: Hole;
  owned: { dispose(): void }[];
  time: string;
  world: string;
  tubes: Map<Zone, TubePath>;
  timed: Timed[];
  slopes: Map<Zone, SlopeGlow>;
  surfaceAt: Height;
  ghosts: (aiming: boolean) => void;
  mill: Mill | null;
  ticks: Tick[];
  tick: Tick;
  smokes: THREE.Object3D[] | null;
}
export interface Course extends THREE.Group {
  userData: CourseData;
}

/** The gnome: his body (what turns and hops), his eyes (what blinks), his shadow, how far he reaches out from his centre (standing),
 *  and the height of his middle, beard to hat (what a roll turns about). */
export interface Gnome extends THREE.Group {
  userData: {
    body: THREE.Object3D; eyes: THREE.Object3D[]; shade: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; reach: number; mid: number;
    /** where a headlamp clips on (the body's space), its glow once lit, and whether it is a clip-on (gnome.ts headlamp) */
    lampAt: THREE.Vector3; lamp?: THREE.Object3D; clip?: boolean;
  };
}

/** The aim: its dots, one instance each. */
export interface Aim extends THREE.Group {
  userData: { dots?: THREE.InstancedMesh };
}

/** A scene with its two lights (makeScene). */
export interface LitScene extends THREE.Scene {
  userData: { lights: { sky: THREE.HemisphereLight; sun: THREE.DirectionalLight }; time?: string };
}
