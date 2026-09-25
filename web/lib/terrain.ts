// What the client works out from a hole's geometry — for drawing, never for
// play. The chain decides where the ball goes; this only decides what the
// ground under it looks like.
//
// Two things come out of it:
//   - the shape of the green: the part of the board a ball can actually reach,
//     flood-filled from the tee. Whatever the walls fence off is not green, it
//     is rough ground, and it gets drawn as such — so a hole built from walls
//     looks like the shape its author drew, not like a rectangle.
//   - a height field: a Slope zone pushes the ball one way, so it is drawn as
//     a ramp rising the other way. Height is cosmetic; the physics is flat.

import type { HoleState, MutVec2, Timing, Vec2, Wall, Zone } from "./types";

/** A segment a→b on the board. */
type Seg = readonly [Vec2, Vec2];
/** A zone's shape, as inZone reads it. */
type Shape = Pick<Zone, "min" | "max" | "round" | "poly" | "outside">;

export const CELL = 0.5;

// Must match the Field.Radius every hole deploys with: the gnome is drawn this
// big because the chain keeps its centre this far from any wall.
export const BALL_R = 0.5;

// The cup is drawn at the radius the chain holes a ball in.
export const CUP_R = 1.2;

/** A slope that is air, not ground: it pushes the ball but raises no ramp.
 *  The chain's own "air" flag when the zone carries one; else guessed from
 *  the skin (wind, a gust) or a clock, as the realm has no flag yet. */
export const airy = (z: Zone) => z.kind === "slope" && (typeof z.air === "boolean" ? z.air : z.skin === "wind" || z.skin === "gust" || !!z.every);

// ------------------------------------------------------ shared geometry
// The small sums every part of the client needs, in one place.

/** a mod n, never negative (JavaScript's % keeps the sign of a). */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Whether a timed piece is there at substep i: the chain's own test
 *  (field.gno there()). Untimed (every 0 or none): always. */
export const there = (i: number, every = 0, on = 0, phase = 0) => !(every > 0) || mod(i + (phase | 0), every) < on;
/** Whether timed zone or wall q is on at tick. */
export const onAt = (q: Timing, tick: number) => there(tick, q.every, q.on, q.phase);

/** 0 below 0, 1 above 1, and an S between. */
export const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The signed turn from angle b to angle a, in (-π, π]. */
export const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// One result object reused by every call (no allocation in the
// camera's per-frame wall tests); read it before the next call
const nearest = { x: 0, z: 0, u: 0, d: 0 };
/** The point of segment a→b nearest (x, z): { x, z, u (the fraction along
 *  it), d (the distance) }. The same object every call. */
export function closest(x: number, z: number, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const u = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  nearest.x = a[0] + u * dx;
  nearest.z = a[1] + u * dz;
  nearest.u = u;
  nearest.d = Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz);
  return nearest;
}
/** A zone's box: its centre (cx, cz), its half-sizes (hx, hz) and its sizes (w, h). */
export const boxOf = (q: Pick<Zone, "min" | "max">) => {
  const w = q.max[0] - q.min[0], h = q.max[1] - q.min[1];
  return { cx: (q.min[0] + q.max[0]) / 2, cz: (q.min[1] + q.max[1]) / 2, hx: w / 2, hz: h / 2, w, h };
};
/** The point of a polygon's outline nearest (x, z), as a new pair. */
export function nearestOnPoly(x: number, z: number, poly: readonly Vec2[]): MutVec2 {
  let best: MutVec2 = [x, z], bd = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const q = closest(x, z, poly[k], poly[(k + 1) % poly.length]);
    if (q.d < bd) (bd = q.d), (best = [q.x, q.z]);
  }
  return best;
}
/** The distance from (x, z) to segment a→b. */
export const segDist = (x: number, z: number, a: Vec2, b: Vec2) => closest(x, z, a, b).d;
/** The distance from (x, z) to the nearest of these walls ({ a, b }), Infinity for none. */
export function wallDist(x: number, z: number, walls: Iterable<Pick<Wall, "a" | "b">>) {
  let d = Infinity;
  for (const w of walls) d = Math.min(d, segDist(x, z, w.a, w.b));
  return d;
}

/** Where the segment o→c crosses a→b, as a fraction of o→c, or -1. */
export function segHit(ox: number, oz: number, cx: number, cz: number, a: Vec2, b: Vec2) {
  const rx = cx - ox, rz = cz - oz, sx = b[0] - a[0], sz = b[1] - a[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((a[0] - ox) * sz - (a[1] - oz) * sx) / den, u = ((a[0] - ox) * rz - (a[1] - oz) * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : -1;
}
/** Where the segment o→c first enters the circle (c, r), as a fraction of o→c, or -1. */
export function rayCircle(ox: number, oz: number, cx: number, cz: number, c: Vec2, r: number) {
  const dx = cx - ox, dz = cz - oz, fx = ox - c[0], fz = oz - c[1];
  const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - r * r, disc = B * B - 4 * A * C;
  return A > 0 && disc >= 0 ? (-B - Math.sqrt(disc)) / (2 * A) : -1;
}

/** Even-odd point in polygon ([[x, y], ...]). */
export function inPoly(x: number, y: number, poly: readonly Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The edges of a zone's outline, as segments [a, b] (none for a Round one). */
const edgesOf = (q: Shape): Seg[] => {
  const poly = q.poly;
  if (poly && poly.length > 2) return poly.map((p, i): Seg => [poly[(i + poly.length - 1) % poly.length], p]);
  if (q.round) return [];
  const [x0, y0] = q.min, [x1, y1] = q.max;
  return [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
};

/** How far (x, y) is inside zone q: its distance to the zone's edge, 0
 *  outside. edges: the ones to measure from (all of them by default). */
export function inset(q: Shape, x: number, y: number, edges: readonly Seg[] = edgesOf(q)) {
  if (!inZone(q, x, y)) return 0;
  let d = Infinity;
  for (const [a, b] of edges) d = Math.min(d, segDist(x, y, a, b));
  if (q.round) {
    const hx = (q.max[0] - q.min[0]) / 2, hy = (q.max[1] - q.min[1]) / 2;
    d = Math.min(d, (1 - Math.hypot((x - q.min[0] - hx) / hx, (y - q.min[1] - hy) / hy)) * Math.min(hx, hy));
  }
  return Math.max(0, d);
}

// garden water, sunk into the ground: from the zone's own edge (where the
// chain drowns the ball) a bank falls to the water, and on to the bed. Heights
// under the lane's lowest point round the pond; bank: how wide it is
export const POOL = { water: -0.42, bed: -0.8, bank: 0.6 };

/**
 * Whether (x, y) is in a zone, as the chain tests it: its rectangle; a Round
 * zone is the ellipse in it; a zone with `poly` is that polygon (within the
 * rectangle), and with `outside` everything in the rectangle but the polygon.
 */
export function inZone(q: Shape, x: number, y: number) {
  if (x < q.min[0] || x >= q.max[0] || y < q.min[1] || y >= q.max[1]) return false;
  if (q.poly && q.poly.length > 2) return inPoly(x, y, q.poly) !== !!q.outside;
  if (q.round) {
    const ex = (x - (q.min[0] + q.max[0]) / 2) / ((q.max[0] - q.min[0]) / 2), ey = (y - (q.min[1] + q.max[1]) / 2) / ((q.max[1] - q.min[1]) / 2);
    return ex * ex + ey * ey <= 1;
  }
  return true;
}

const N4: readonly Vec2[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_RISE = 1.6;
const BANK = 2.5; // how far a ramp's top edge takes to fall back to the green
const SHOULDER = 1.2; // its sides taper over this much, so it reads as a hill


/** A Slope zone drawn as a ramp: its uphill (ux, uz) and across (vx, vz) axes, where it starts along them and how high it rises. */
interface Ramp {
  z: Zone;
  ux: number; uz: number; vx: number; vz: number;
  lo: number; span: number; rise: number; noLip: boolean;
  a0: number; a1: number;
  plateau?: boolean; run?: boolean; bridge?: { gap: number; to: number };
}
/** A ramp per Slope zone: 0 on its downhill edge, rising against the push. */
function ramps(zones: readonly Zone[]): Ramp[] {
  return zones
    .filter((z) => z.kind === "slope" && !airy(z) && z.skin !== "mound" && (z.vec[0] || z.vec[1]))
    .map((z) => {
      const l = Math.hypot(z.vec[0], z.vec[1]);
      const ux = -z.vec[0] / l, uz = -z.vec[1] / l; // uphill
      const proj = [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]].map((p) => p[0] * ux + p[1] * uz);
      const lo = Math.min(...proj), hi = Math.max(...proj);
      // as high as the slope is strong over its length: what looks steep is steep
      const len = hi - lo;
      // a kicker is a ski jump, not a bump: steep and tall, cut off at its lip
      // a moon bridge is a high arch, whatever its push
      // a skate park's quarter-pipe curls up to its coping, a funbox is a low block
      const rise = z.skin === "kicker" || z.skin === "ramp" ? 2.2 : z.skin === "moon bridge" ? 1.5 : z.skin === "quarter pipe" ? 1.3 : z.skin === "funbox" ? 0.8 : Math.min(MAX_RISE, 0.35 * l * len * 1.6);
      // across the slope, for the shoulders
      const vx = -uz, vz = ux;
      const across = [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]].map((p) => p[0] * vx + p[1] * vz);
      return { z, ux, uz, vx, vz, lo, span: hi - lo || 1, rise, noLip: z.skin === "kicker" || z.skin === "ramp" || z.skin === "moon bridge" || z.skin === "quarter pipe", a0: Math.min(...across), a1: Math.max(...across) };
    });
}

/**
 * A mound: the chain makes one of four slopes pushing out from a centre (skin
 * "mound"). Drawn as one round dome over them, as high as its push is strong,
 * not as four ramps: that read as a flat square with lines on it.
 */
function mounds(zones: readonly Zone[]) {
  const ms = zones.filter((z) => z.kind === "slope" && z.skin === "mound");
  const groups: { x0: number; x1: number; y0: number; y1: number; push: number }[] = [];
  for (const z of ms) {
    const near = groups.find((g) => z.min[0] <= g.x1 + 0.1 && z.max[0] >= g.x0 - 0.1 && z.min[1] <= g.y1 + 0.1 && z.max[1] >= g.y0 - 0.1);
    if (near) Object.assign(near, { x0: Math.min(near.x0, z.min[0]), x1: Math.max(near.x1, z.max[0]), y0: Math.min(near.y0, z.min[1]), y1: Math.max(near.y1, z.max[1]), push: Math.max(near.push, Math.hypot(...z.vec)) });
    else groups.push({ x0: z.min[0], x1: z.max[0], y0: z.min[1], y1: z.max[1], push: Math.hypot(...z.vec) });
  }
  // a zone added late can join two groups: merge until none touch
  const touch = (a: (typeof groups)[number], b: (typeof groups)[number]) => a.x0 <= b.x1 + 0.1 && a.x1 >= b.x0 - 0.1 && a.y0 <= b.y1 + 0.1 && a.y1 >= b.y0 - 0.1;
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i++)
      for (let j = i + 1; j < groups.length && !merged; j++)
        if (touch(groups[i], groups[j])) {
          const a = groups[i], b = groups.splice(j, 1)[0];
          Object.assign(a, { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), push: Math.max(a.push, b.push) });
          merged = true;
        }
  }
  return groups.map((g) => ({ x: (g.x0 + g.x1) / 2, z: (g.y0 + g.y1) / 2, rx: (g.x1 - g.x0) / 2 + 0.6, rz: (g.y1 - g.y0) / 2 + 0.6, h: Math.min(1.1, 0.35 + g.push * 2) }));
}

/**
 * A ramp whose top edge faces the tee is a hill the player starts on: the
 * ground stays up at the top (a plateau) instead of banking back down, so a
 * "downhill" hole begins high. Only when no other ramp lies between the tee
 * and this one — a row of hills keeps its valleys.
 */
function plateaus(rs: Ramp[], tee: Vec2) {
  for (const r of rs) {
    const along = tee[0] * r.ux + tee[1] * r.uz - r.lo;
    const between = rs.some((o) => {
      if (o === r) return false;
      const a = (o.z.min[0] + o.z.max[0]) / 2 * r.ux + (o.z.min[1] + o.z.max[1]) / 2 * r.uz - r.lo;
      return a > r.span && a < along;
    });
    r.plateau = along > r.span && !between;
  }
  // a run of slopes the same way (a downhill in two pitches, a flight of
  // terraces): the lower one's top holds its height uphill of it, under the
  // flat between and the upper one, so the heights add up to one continuous
  // descent instead of each pitch dropping back to the green and the next
  // starting high again
  for (const r of rs)
    r.run = rs.some((q) => {
      if (q === r || r.ux * q.ux + r.uz * q.uz < 0.99) return false;
      if (Math.min(r.a1, q.a1) - Math.max(r.a0, q.a0) < 1) return false; // side by side, not in line
      const gap = q.lo - (r.lo + r.span); // from r's top to q's foot, along the climb
      return gap >= -0.01 && gap <= 10;
    });
  // two ramps whose tops face each other, a short flat between them, are one
  // hill: the ground stays up across the gap (easing from one top's height to
  // the other's) instead of dropping to the green and rising again like two
  // boxes. The physics there is flat, and so is a hilltop.
  for (const r of rs)
    for (const q of rs) {
      if (q === r || r.bridge || q.bridge || r.ux * q.ux + r.uz * q.uz > -0.99) continue;
      if (Math.min(r.a1, -q.a0) - Math.max(r.a0, -q.a1) < 1) continue; // side by side, not facing
      const gap = -(q.lo + q.span) - (r.lo + r.span);
      if (gap > 0 && gap <= 10) (r.bridge = { gap, to: q.rise }), (q.noLip = true);
    }
  return rs;
}

export function terrain(s: Pick<HoleState, "board" | "walls" | "zones" | "start" | "cup">) {
  const W = s.board.w, H = s.board.h;
  const nx = Math.round(W / CELL), nz = Math.round(H / CELL);
  const idx = (i: number, j: number) => j * nx + i;
  const centre = (i: number, j: number): MutVec2 => [(i + 0.5) * CELL, (j + 0.5) * CELL];
  const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz;
  // a 4-neighbour flood from the cells on the stack: enter(k) says whether
  // cell k is taken in (and marks it), visit(i, j) sees each cell as it is reached
  const flood = (stack: MutVec2[], enter: (k: number) => boolean | number, visit?: (i: number, j: number) => void) => {
    while (stack.length) {
      const [i, j] = stack.pop()!;
      if (visit) visit(i, j);
      for (const [di, dj] of N4) {
        const a = i + di, b = j + dj;
        if (inGrid(a, b) && enter(idx(a, b))) stack.push([a, b]);
      }
    }
  };

  // cells a wall runs through
  const blocked = new Uint8Array(nx * nz);
  for (const w of s.walls) {
    if (w.every) continue; // a wall that comes and goes fences nothing off
    const x0 = Math.max(0, Math.floor(Math.min(w.a[0], w.b[0]) / CELL) - 1);
    const x1 = Math.min(nx - 1, Math.ceil(Math.max(w.a[0], w.b[0]) / CELL) + 1);
    const z0 = Math.max(0, Math.floor(Math.min(w.a[1], w.b[1]) / CELL) - 1);
    const z1 = Math.min(nz - 1, Math.ceil(Math.max(w.a[1], w.b[1]) / CELL) + 1);
    for (let j = z0; j <= z1; j++)
      for (let i = x0; i <= x1; i++) {
        const [px, pz] = centre(i, j);
        if (segDist(px, pz, w.a, w.b) < CELL * 0.52) blocked[idx(i, j)] = 1;
      }
  }

  // flood from everywhere a ball can be put: the tee, and wherever a tunnel or
  // a hazard sends it
  const reach = new Uint8Array(nx * nz);
  const stack: MutVec2[] = [];
  const seed = (p: Vec2) => {
    const i = Math.floor(p[0] / CELL), j = Math.floor(p[1] / CELL);
    if (inGrid(i, j) && !blocked[idx(i, j)] && !reach[idx(i, j)]) {
      reach[idx(i, j)] = 1;
      stack.push([i, j]);
    }
  };
  seed(s.start);
  seed(s.cup);
  for (const z of s.zones) if (z.kind === "tunnel" || z.kind === "hazard") seed(z.vec);
  flood(stack, (k) => !blocked[k] && !reach[k] && (reach[k] = 1));

  // green: what the ball reaches, plus the wall cells along its edge (a wall
  // stands on the green, not on a gap next to it)
  const green = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = idx(i, j);
      if (reach[k]) green[k] = 1;
      else if (blocked[k])
        for (const [di, dj] of N4) if (inGrid(i + di, j + dj) && reach[idx(i + di, j + dj)]) green[k] = 1;
    }

  // rough: connected pieces of everything else, for the scenery to fill
  const rough: MutVec2[][] = [];
  const seen = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = idx(i, j);
      if (green[k] || seen[k]) continue;
      const cells: MutVec2[] = [];
      seen[k] = 1;
      flood([[i, j]], (kk) => !green[kk] && !seen[kk] && (seen[kk] = 1), (a, b) => cells.push([a, b]));
      rough.push(cells);
    }

  const rs = plateaus(ramps(s.zones), s.start);
  const domes = mounds(s.zones);
  // flat: without a moon bridge's arch (the ground under it)
  const raw = (x: number, z: number, flat = false) => {
    let h = 0, arch = 0;
    for (const r of rs) {
      const along = x * r.ux + z * r.uz - r.lo, side = x * r.vx + z * r.vz;
      if (along < 0 || side < r.a0 || side > r.a1) continue;
      let k: number;
      if (along <= r.span) k = r.z.skin === "kicker" || r.z.skin === "ramp" || r.z.skin === "quarter pipe" ? (along / r.span) ** 2 : smoothstep(along / r.span); // a jump curls up to its lip
      else if (r.bridge && along - r.span < r.bridge.gap) k = 1 + (r.bridge.to / r.rise - 1) * smoothstep((along - r.span) / r.bridge.gap);
      else if (r.plateau || r.run) k = 1;
      // a quarter-pipe's deck behind its coping: the kerb stands on it, not buried in the ramp
      else if (r.z.skin === "quarter pipe" && along - r.span < 1.2) k = 1;
      else if (r.noLip) continue; // the top of the hill the tee stands on
      else if (along - r.span < BANK * 0.4 && x > 0 && z > 0 && x < W && z < H) k = 1 - smoothstep((along - r.span) / (BANK * 0.4)); // a short lip, not a slope the physics lacks
      else continue;
      // shoulders: a ramp inside the green tapers at its sides; one that runs
      // wall to wall does not (its sides are the walls)
      const edge = Math.min(side - r.a0, r.a1 - side);
      // (nor does a bridge: its deck is full width, over the water)
      const walled = r.a0 <= 0.01 || r.a1 >= Math.max(W, H) - 0.01 || r.z.skin === "moon bridge";
      if (!walled && edge < SHOULDER) k *= smoothstep(edge / SHOULDER);
      // a moon bridge's two halves meet at its crown: the higher, not the sum
      if (r.z.skin === "moon bridge") {
        if (!flat) arch = Math.max(arch, k * r.rise);
        continue;
      }
      h += k * r.rise;
    }
    h += arch;
    for (const d of domes) {
      const q = Math.hypot((x - d.x) / d.rx, (z - d.z) / d.rz);
      if (q < 1) h += d.h * (1 - q * q) * (1 - q * q); // a soft dome, flat at its foot
    }
    return h;
  };
  // the cup sits on a flat landing, never on the slope itself
  const cupH = raw(s.cup[0], s.cup[1]);
  // a cup inside a slope zone sits on the slope: flattening it would show a
  // landing the ball does not have
  const onSlope = s.zones.some((q) => q.kind === "slope" && !airy(q) && s.cup[0] >= q.min[0] && s.cup[0] < q.max[0] && s.cup[1] >= q.min[1] && s.cup[1] < q.max[1]);
  const height = (x: number, z: number) => {
    // on a slope the landing is just the cup itself: the rings lie flat, the
    // slope comes back right after
    if (onSlope) {
      const d = Math.hypot(x - s.cup[0], z - s.cup[1]);
      return d <= CUP_R + 0.15 ? cupH : d < CUP_R + 0.9 ? cupH + (raw(x, z) - cupH) * smoothstep((d - CUP_R - 0.15) / 0.75) : raw(x, z);
    }
    const d = Math.hypot(x - s.cup[0], z - s.cup[1]);
    if (d <= CUP_R + 0.3) return cupH;
    if (d < CUP_R + 1.6) {
      const k = smoothstep((d - CUP_R - 0.3) / 1.3);
      return cupH * (1 - k) + raw(x, z) * k;
    }
    return raw(x, z);
  };

  // the ground mesh's own heights: height(), but sunk under garden water
  // (the ball rides height(): it drops in where the chain drowns it)
  const bridges = s.zones.filter((q) => q.kind === "slope" && q.skin === "moon bridge");
  const inRect = (q: Zone, x: number, z: number) => x >= q.min[0] && x <= q.max[0] && z >= q.min[1] && z <= q.max[1];
  // the ponds and streams, each flat at its own level
  // what crosses the water (a bridge's deck, a causeway, the seesaw): the
  // water runs on under it, its banks from the one side's to the other's.
  // c: the axis the water crosses along
  const spans = s.zones.filter((q) => (q.kind === "slope" && (q.skin === "moon bridge" || q.skin === "seesaw")) || q.skin === "bridge").map((q) => ({
    q, c: (q.skin === "moon bridge" ? (Math.abs(q.vec[0]) > Math.abs(q.vec[1]) ? 1 : 0) : q.max[0] - q.min[0] >= q.max[1] - q.min[1] ? 1 : 0),
  }));
  // (a pond's edge along one of those is no bank: the water goes on under it)
  const along = ([a, b]: Seg, { q, c }: (typeof spans)[number]) => [a, b].every((p) => Math.abs(p[c] - q.min[c]) < 0.05 || Math.abs(p[c] - q.max[c]) < 0.05) && Math.abs(a[c] - b[c]) < 0.05
    && Math.max(a[1 - c], b[1 - c]) > q.min[1 - c] - 0.05 && Math.min(a[1 - c], b[1 - c]) < q.max[1 - c] + 0.05;
  const pools = s.zones.filter((q) => q.kind === "hazard" && q.skin === "water").map((q) => {
    const edges = edgesOf(q).filter((e) => !spans.some((sp) => along(e, sp)));
    let lo = Infinity;
    for (let u = 0; u <= 1; u += 0.25) for (let v = 0; v <= 1; v += 0.25) lo = Math.min(lo, raw(q.min[0] + u * (q.max[0] - q.min[0]), q.min[1] + v * (q.max[1] - q.min[1])));
    return { q, edges, level: lo + POOL.water, bed: lo + POOL.bed };
  });
  const poolAt = (x: number, z: number) => {
    let best: { k: number; d: number; level: number; bed: number } | null = null;
    for (const p of pools) {
      const d = inset(p.q, x, z, p.edges);
      if (d > 0 && (!best || d > best.d)) best = { k: Math.min(1, d / POOL.bank), d, level: p.level, bed: p.bed };
    }
    if (best) best.k = smoothstep(best.k);
    return best;
  };
  const water = (x: number, z: number) => {
    const sp = pools.length ? spans.find((p) => inRect(p.q, x, z)) : null;
    if (!sp) return pools.length ? poolAt(x, z) : null;
    const { q, c } = sp, lo = q.min[c] - 0.05, hi = q.max[c] + 0.05, f = ((c ? z : x) - lo) / (hi - lo);
    const a = poolAt(c ? x : lo, c ? lo : z), b = poolAt(c ? x : hi, c ? hi : z);
    const k = (a ? a.k : 0) * (1 - f) + (b ? b.k : 0) * f, d = (a ? a.d : 0) * (1 - f) + (b ? b.d : 0) * f, p = a || b;
    return p && k > 0 ? { k, d, level: p.level, bed: p.bed } : null;
  };
  // (under a moon bridge the ground is the banks and the stream: its arch is
  // drawn apart, and the ball rides that)
  const ground = (x: number, z: number) => {
    const base = bridges.some((q) => inRect(q, x, z)) ? raw(x, z, true) : height(x, z), w = water(x, z);
    return w ? base + (w.bed - base) * w.k : base;
  };

  const zoneAt = (x: number, z: number) => s.zones.find((q) => inZone(q, x, z)) || null;

  /** Whether the ball can be at (x, z): the board cell there is green. */
  const onGreen = (x: number, z: number) => {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return inGrid(i, j) && !!green[idx(i, j)];
  };
  return { nx, nz, idx, inGrid, green, rough, height, ground, pond: water, zoneAt, centre, onGreen, domes };
}


export type Terrain = ReturnType<typeof terrain>;
