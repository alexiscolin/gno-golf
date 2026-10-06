// A hole as builder.wasm's decode gives it: course.Simple field for field,
// every float as Go prints it shortest (so exactly), skins as stored. What
// the builder's checks read and a published hole is opened from.

export type V = [number, number];
/** physics' timing: on at substep i when (i+phase) mod every is below on; every 0 is always there. */
export interface Timing {
  every: number;
  on: number;
  phase: number;
}
export interface GWall extends Timing {
  a: V;
  b: V;
  /** 0: the field's */
  bounce: number;
  mark: number;
  skin: string;
}
export interface GPost {
  c: V;
  r: number;
  bounce: number;
  mark: number;
  skin: string;
}
export type ZoneKind = "surface" | "slope" | "tunnel" | "hazard" | "loop";
export interface GZone extends Timing {
  kind: ZoneKind;
  min: V;
  max: V;
  /** a slope's push; a tunnel's, a loop's (and, unread, a hazard's) point on the board */
  vec: V;
  scale: number;
  mark: number;
  skin: string;
  round: boolean;
  /** a polygon's points ([] for none), and whether the zone is all its box but it */
  poly: V[];
  outside: boolean;
  air: boolean;
  capped: boolean;
}
/** Pieces there on strokes where (stroke+phase) mod every is below on. */
export interface GPulse extends Timing {
  walls: GWall[];
  posts: GPost[];
  zones: GZone[];
}
export interface GHole {
  w: number;
  h: number;
  title: string;
  /** Strokes */
  par: number;
  tee: V;
  pin: V;
  substeps: number;
  cupR: number;
  world: string;
  order: number;
  shelter: number;
  friction: number;
  bounce: number;
  ballR: number;
  walls: GWall[];
  posts: GPost[];
  zones: GZone[];
  pulses: GPulse[];
}
