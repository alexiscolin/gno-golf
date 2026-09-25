// The engine's shapes: the game's state (g), the live state its parts read
// (E), and what the interface is told (Snapshot). Type-only, so engine.ts and
// engine/*.ts import it without importing each other.
import type * as THREE from "three";
import type { Chain } from "../chain";
import type { Forecast, HoleRow, Mode, Vec2, Zone, ZoneKind } from "../types";
import type { Aim, Course, Gnome, Height, Hole, LitScene } from "../scene/data";
import type { Rig, View } from "../scene/camera";
import type { WeatherNow } from "../scene/weather";
import type { Band } from "../scene/fx";
import type { Causes } from "../scene/cause";

/** The camera modes: the rig on the gnome, the whole hole, or behind him. */
export type CamMode = "classic" | "far" | "third";
/** The graphics setting, and the tier it gives on this device. */
export type GfxMode = "auto" | "high" | "low";
export type Tier = "high" | "low";
/** What went wrong: the hole's load, its drawing, a shot, the round's stroke limit. */
export type ErrorKind = "load" | "draw" | "shot" | "limit";
/** A word on why the ball speeds up or drifts, and when it was said. */
export interface CauseNote {
  label: string;
  at: number;
}

/** The game's state: the hole, the round, the camera. */
export interface GameState {
  list: HoleRow[];
  /** every hole the chain lists, archived ones too */
  all?: HoleRow[];
  /** everyone else's holes, playable outside the cups */
  community?: HoleRow[];
  world?: string;
  /** the page's link named a hole that exists */
  linked?: boolean;
  id: string | null;
  s: Hole | null;
  course: Course | null;
  ball: { x: number; y: number };
  strokes: number;
  flying: boolean;
  facing: number;
  power: number;
  aiming: boolean;
  holed: boolean;
  /** no more shots this round (holed, even before the banner) */
  done?: boolean;
  error: string | null;
  errorKind?: ErrorKind;
  view: "overview" | "ball";
  cam: CamMode;
  rig: Rig | null;
  over: Rig | null;
  far?: Rig & { orbit: number; tilt: number };
  started: boolean;
  /** an opaque screen is over the course */
  covered?: boolean;
  round?: number;
  roundMode?: Mode | null;
  /** the round's weather period, and the chain's forecast for it */
  period?: number | null;
  forecast?: Forecast | null;
  /** the weather drawn now */
  weather?: WeatherNow | null;
  flash?: number;
  cause?: CauseNote | null;
  note?: string | null;
  /** the round's decisions, each stroke's path length, the ball exactly as the chain left it */
  shots: string[];
  pts: number[];
  rest: Vec2 | null;
  /** the last shot's heading (radians), and the clock tick it was let go at */
  lastAim?: number | null;
  tick0?: number;
  inTube?: boolean;
  /** ?camlog's ballLift: which step of which flags */
  replaying?: { flags: string; at: number };
  /** ?camlog's buildMs(): [build, compile] */
  buildMs?: [number, number];
}

/** The pull as it stands: its heading (radians), its power, and the heading rounded as sent. */
export interface Shot {
  angle: number;
  power: number;
  deg?: number;
}

/** The gnome's small moods: a hop of joy, a head shake. */
export interface Mood {
  joy(now: number): void;
  shake(now: number): void;
  hop(now: number): number;
  tick(now: number): void;
}

/** What the camera, the aim and the replay read of the game, as it changes. */
export interface Live {
  readonly g: GameState;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: LitScene;
  readonly chain: Chain;
  readonly aim: Aim;
  readonly band: Band;
  readonly causes: Causes;
  readonly mood: Mood;
  readonly publish: () => boolean;
  readonly screen: () => View;
  readonly ground: Height;
  readonly lift: (p: Vec2) => THREE.Vector3;
  readonly log: boolean;
  readonly tickNow: () => number | null;
  /** cut every animation */
  readonly stop: () => number;
  /** the timed pieces' clock set to t */
  readonly showAt: (t: number) => void;
  /** the zones that act on the ball now: the hole's, the forecast's, the stroke's */
  readonly zones: () => Zone[];
  /** the kind of jump a step makes (the replay's) */
  landing: (p: Vec2, q: Vec2) => ZoneKind | null;
  readonly ball: Gnome;
  readonly dragging: boolean;
  readonly shot: Shot;
  readonly clock: number;
  readonly cut: number;
  readonly mode: Mode;
  readonly strokeZones: readonly Zone[];
}

/** What the interface is told, each time it changes. */
export interface Snapshot {
  holes: readonly HoleRow[];
  allHoles: readonly HoleRow[];
  world: string | undefined;
  linked: boolean;
  ready: boolean;
  place: number;
  archived: boolean;
  look: string;
  worlds: Readonly<Record<string, number>>;
  id: string | null;
  name: string;
  source: string;
  official: boolean;
  community: readonly HoleRow[];
  strokes: number;
  timed: boolean;
  time: string;
  walls: number;
  pieces: number;
  kind: string;
  pts: readonly number[];
  shots: readonly string[];
  flying: boolean;
  aiming: boolean;
  power: number;
  holed: boolean;
  error: string | null;
  weather: WeatherNow | null;
  flash: number;
  mode: Mode;
  cam: CamMode;
  roundMode: Mode | null;
  period: number | null;
  cause: CauseNote | null;
  note: string | null;
  errorKind: ErrorKind | null | undefined;
  view: "overview" | "ball";
  gfx: GfxMode;
  tier: Tier;
}

/** A hole a link names: its id, or a cup and a place in it. */
export interface Link {
  id?: string;
  cup?: string;
  n?: number;
}
