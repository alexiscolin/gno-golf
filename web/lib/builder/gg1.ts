// A hole as GG1 (gno.land/p/gnogolf/course, data.gno), written in the page
// for builder.wasm's fit: decodable, never canonical. Every stored wall
// length is 0: Decode reads them without trusting them, Fit prepares the
// walls again and Encode writes the chain's own (physics.Lengths). No float
// the chain stores is computed here, and the layout is Encode's, field for
// field: a change to it is a new format (GG2), not an edit of this file.
import type { Vec2, ZoneKind } from "../types";

/** A wall as course.Simple has it (physics.Wall): a segment, its bounce (0: the field's), its skin, its clock. */
export interface GWall {
  a: Vec2;
  b: Vec2;
  bounce?: number;
  skin?: string;
  every?: number;
  on?: number;
  phase?: number;
}
/** A post (physics.Post): a circle. */
export interface GPost {
  c: Vec2;
  r: number;
  bounce?: number;
  skin?: string;
}
/** A zone (physics.Zone): its box, or the ellipse in it (round), or a polygon (or all but one: outside). */
export interface GZone {
  kind: Exclude<ZoneKind, "unknown">;
  min: Vec2;
  max: Vec2;
  /** a slope's push; a tunnel's or a loop's way out */
  vec?: Vec2;
  scale?: number;
  skin?: string;
  round?: boolean;
  poly?: readonly Vec2[];
  outside?: boolean;
  air?: boolean;
  capped?: boolean;
  every?: number;
  on?: number;
  phase?: number;
}
/** Pieces there on the strokes where (stroke+phase) mod every is below on (course.Pulse). */
export interface GPulse {
  every: number;
  on: number;
  phase: number;
  walls: readonly GWall[];
  posts: readonly GPost[];
  zones: readonly GZone[];
}
/** A hole as course.Simple has it, with its field (physics.Field) flattened in. */
export interface GHole {
  w: number;
  h: number;
  /** par (Strokes) */
  par: number;
  substeps: number;
  world: string;
  order: number;
  title: string;
  tee: Vec2;
  pin: Vec2;
  cupR: number;
  shelter: number;
  friction: number;
  bounce: number;
  ballR: number;
  walls: readonly GWall[];
  posts: readonly GPost[];
  zones: readonly GZone[];
  pulses: readonly GPulse[];
}

/** GG1's frozen limits (course/data.gno), a pulse's pieces counted in: the one place the builder has them. */
export const LIMITS = { walls: 160, posts: 32, zones: 32, poly: 64, polyTotal: 512, pulses: 16, skins: 64 } as const;

const KINDS: readonly GZone["kind"][] =["surface", "slope", "tunnel", "hazard", "loop"]; // physics.ZoneKind's order
const ROUND = 1, OUTSIDE = 2, AIR = 4, CAPPED = 8; // data.gno's flags

/** h as draft GG1, in hex: builder.wasm's fit takes it. */
export function draftHex(h: GHole): string {
  const out: number[] = [], f64 = new DataView(new ArrayBuffer(8)), enc = new TextEncoder();
  const u8 = (n: number) => out.push(n & 0xff);
  const u16 = (n: number) => out.push(n & 0xff, (n >> 8) & 0xff);
  const i32 = (n: number) => out.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  const num = (x: number) => {
    f64.setFloat64(0, x, true);
    for (let i = 0; i < 8; i++) out.push(f64.getUint8(i));
  };
  const vec = (v: Vec2) => (num(v[0]), num(v[1]));
  const str = (s: string) => {
    const b = enc.encode(s).slice(0, 255); // (a longer one Decode would read short: kept short here)
    u8(b.length);
    out.push(...b);
  };
  const skins: string[] = [], index = new Map<string, number>();
  const skin = (s = "") => {
    if (!index.has(s)) index.set(s, skins.push(s) - 1);
    return index.get(s)!;
  };
  const pieces = (ws: readonly GWall[], ps: readonly GPost[], zs: readonly GZone[]) => {
    for (const p of [...ws, ...ps, ...zs]) skin(p.skin);
  };
  pieces(h.walls, h.posts, h.zones);
  for (const p of h.pulses) pieces(p.walls, p.posts, p.zones);

  const walls = (ws: readonly GWall[], lengths: boolean) => {
    u16(ws.length);
    for (const w of ws) { // a style run each: decodable, if not Encode's runs
      u16(1);
      num(w.bounce ?? 0);
      i32(0);
      u16(skin(w.skin));
      i32(w.every ?? 0), i32(w.on ?? 0), i32(w.phase ?? 0);
    }
    for (const w of ws) {
      vec(w.a), vec(w.b);
      if (lengths) num(0), num(0), num(0);
    }
  };
  const posts = (ps: readonly GPost[]) => {
    u16(ps.length);
    for (const p of ps) vec(p.c), num(p.r), num(p.bounce ?? 0), i32(0), u16(skin(p.skin));
  };
  const zones = (zs: readonly GZone[]) => {
    u16(zs.length);
    for (const z of zs) {
      u8(KINDS.indexOf(z.kind));
      u8((z.round ? ROUND : 0) | (z.outside ? OUTSIDE : 0) | (z.air ? AIR : 0) | (z.capped ? CAPPED : 0));
      vec(z.min), vec(z.max), vec(z.vec ?? [0, 0]);
      num(z.scale ?? 0);
      i32(0);
      u16(skin(z.skin));
      i32(z.every ?? 0), i32(z.on ?? 0), i32(z.phase ?? 0);
      u16(z.poly?.length ?? 0);
      for (const p of z.poly ?? []) vec(p);
    }
  };

  out.push(...enc.encode("GG1"));
  u16(h.w), u16(h.h), u8(h.par), u16(h.substeps);
  str(h.world), num(h.order), str(h.title);
  vec(h.tee), vec(h.pin);
  num(h.cupR), num(h.shelter), num(h.friction), num(h.bounce), num(h.ballR);
  u16(skins.length);
  for (const s of skins) str(s);
  walls(h.walls, true), posts(h.posts), zones(h.zones);
  u8(h.pulses.length);
  for (const p of h.pulses) {
    i32(p.every), i32(p.on), i32(p.phase);
    walls(p.walls, false), posts(p.posts), zones(p.zones);
  }
  return out.map((b) => b.toString(16).padStart(2, "0")).join("");
}
