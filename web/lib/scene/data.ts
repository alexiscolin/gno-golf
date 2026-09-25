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
}

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
/** The curve a tunnel's tube follows; an arc is a throw through the air (a blowhole). */
export type TubePath = THREE.Curve<THREE.Vector3> & { userData?: { arc?: boolean } };
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
  terrain: Terrain;
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

/** The gnome: his body (what turns and hops), his eyes (what blinks), his shadow. */
export interface Gnome extends THREE.Group {
  userData: { body: THREE.Object3D; eyes: THREE.Object3D[]; shade: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> };
}

/** The aim: its dots, one instance each. */
export interface Aim extends THREE.Group {
  userData: { dots?: THREE.InstancedMesh };
}

/** A scene with its two lights (makeScene). */
export interface LitScene extends THREE.Scene {
  userData: { lights: { sky: THREE.HemisphereLight; sun: THREE.DirectionalLight } };
}
