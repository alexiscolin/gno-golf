import * as THREE from "three";
import { CUP_R, CELL, inZone, inset, airy, mod, segDist, smoothstep, boxOf } from "../terrain";
import { C, ink, flat, drawn, drape, clipTo, rbox, hullOf } from "./materials";
import { animate, state } from "./state";
import { stone, warp, badge, windmill } from "./props";
import { MOUTHS, mouthAt } from "./pieces";
import { seeded } from "./common";
import { worldOf, fromWorld, gapWater, DECK, GAP_Y } from "./worlds";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ud, type CourseTerrain as T, type Hole } from "./data";
import type { Rand } from "./common";
import type { Board, MutVec2, Post, Vec2, Zone } from "../types";

/** What every zone drawing gets: its rectangle's size and its own random. */
interface Opts {
  w: number;
  h: number;
  rand: Rand;
}
/** A zone's drawing: fills g (or returns its own) for zone z of hole s. */
type ZoneDraw = (z: Zone, s: Hole, t: T, g: THREE.Group, o: Opts) => THREE.Object3D;
/** A surface's outline: its shape and its points on the board. */
interface Blob {
  shape: THREE.Shape;
  points: readonly Vec2[];
}
/** What a surface's detail gets on top (drawSurface). */
interface Detail extends Opts {
  blob: Blob;
  inSand: (x: number, z: number) => boolean;
  spot: (r: number, lo?: number, span?: number) => MutVec2 | null;
  snow: boolean;
}
type DetailDraw = (z: Zone, s: Hole, t: T, g: THREE.Group, o: Detail) => void;

/** The list kept under key k in m, made empty the first time. */
const listIn = <K, V>(m: Map<K, V[]>, k: K) => {
  let l = m.get(k);
  if (!l) m.set(k, (l = []));
  return l;
};

/**
 * A rounded, slightly wobbly outline inside a zone's rectangle: water and sand
 * look like ponds and bunkers, not tiles. It only ever eats into the
 * rectangle, never past it, so what looks wet always is wet.
 */
/** Clips a polygon to a rectangle (Sutherland–Hodgman): a round pond that
 *  reaches past the lane's walls is drawn only inside them. */
function clipRect(pts: Vec2[], x0: number, z0: number, x1: number, z1: number): Vec2[] {
  const edges: [(p: Vec2) => boolean, (a: Vec2, b: Vec2) => MutVec2][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= z0, (a, b) => [a[0] + ((b[0] - a[0]) * (z0 - a[1])) / (b[1] - a[1]), z0]],
    [(p) => p[1] <= z1, (a, b) => [a[0] + ((b[0] - a[0]) * (z1 - a[1])) / (b[1] - a[1]), z1]],
  ];
  let out = pts;
  for (const [inside, cut] of edges) {
    const src = out, next: Vec2[] = [];
    out = next;
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (inside(b)) {
        if (!inside(a)) next.push(cut(a, b));
        next.push(b);
      } else if (inside(a)) next.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

function organic(z: Zone, rand: Rand, board: Board): Blob {
  if (z.poly && z.poly.length > 2) {
    // the chain's own polygon: drawn as it is. Outside: the rectangle (cut at
    // the board) with the polygon as a hole — the sea round a lane
    const poly = z.poly.map(([x, y]): MutVec2 => [x, y]);
    const V = ([x, y]: Vec2) => new THREE.Vector2(x, -y);
    if (!z.outside) {
      const points = clipRect(poly, z.min[0], z.min[1], z.max[0], z.max[1]);
      return { shape: new THREE.Shape(points.map(V)), points };
    }
    const x0 = Math.max(0, z.min[0]), y0 = Math.max(0, z.min[1]), x1 = Math.min(board.w, z.max[0]), y1 = Math.min(board.h, z.max[1]);
    const shape = new THREE.Shape(([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const).map(V));
    shape.holes.push(new THREE.Path(poly.map(V)));
    return { shape, points: poly };
  }
  if (z.round) {
    // the chain's own ellipse, a hair of wobble, cut at the board's edge
    const { cx, cz, hx, hz } = boxOf(z);
    const phase = rand() * 6, raw: Vec2[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, k = 1 + 0.015 * Math.sin(a * 6 + phase);
      raw.push([cx + Math.cos(a) * hx * k, cz + Math.sin(a) * hz * k]);
    }
    const points = clipRect(raw, 0, 0, board.w, board.h);
    const shape = new THREE.Shape(points.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    return { shape, points };
  }
  const w = z.max[0] - z.min[0], h = z.max[1] - z.min[1];
  const cx = z.min[0] + w / 2, cz = z.min[1] + h / 2;
  const hx = w / 2, hz = h / 2;
  const phase = rand() * 6, n = 64;
  const points: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a superellipse is a rectangle with soft corners; the wobble eats inward
    const c = Math.cos(a), s = Math.sin(a);
    // Nearly the zone's own rectangle, corners softened: the chain drowns the
    // ball as soon as its centre is inside, so the drawn water must reach the
    // zone's edge. A shape eaten inward left a strip of "grass" that drowned
    // you. The ball's radius (0.5) covers the small inset that remains.
    const e = 0.16; // closer to 0 is a rectangle
    let x = Math.sign(c) * Math.pow(Math.abs(c), e) * hx;
    let zz = Math.sign(s) * Math.pow(Math.abs(s), e) * hz;
    // a small wobble, so the bank does not look ruled
    const pull = 0.04 + 0.12 * (1 + Math.sin(a * 5 + phase)) / 2;
    const len = Math.hypot(x, zz) || 1;
    x -= (x / len) * pull;
    zz -= (zz / len) * pull;
    points.push([cx + x, cz + zz]);
  }
  const shape = new THREE.Shape(points.map(([x, zz]) => new THREE.Vector2(x, -zz)));
  return { shape, points };
}

/**
 * Where the ball can be, as a texture: one texel per terrain cell, green or
 * not. A zone drawn with it as an alpha map (and alphaTest) shows only inside
 * the walls — sand or water whose rectangle reaches past an angled rim stops
 * at the wall instead of spilling over the rough. Filtered, so the cut follows
 * a diagonal wall instead of stair-stepping.
 */
function greenMask(t: T) {
  if (t.mask) return t.mask;
  const data = new Uint8Array(t.nx * t.nz * 4);
  for (let j = 0; j < t.nz; j++) for (let i = 0; i < t.nx; i++) if (t.green[t.idx(i, j)]) data.fill(255, (j * t.nx + i) * 4, (j * t.nx + i) * 4 + 4);
  const tex = new THREE.DataTexture(data, t.nx, t.nz, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  // a shape's uv is (x, -z) in board units: to the mask's 0..1
  tex.repeat.set(1 / (t.nx * CELL), -1 / (t.nz * CELL));
  tex.needsUpdate = true;
  return (t.mask = tex);
}

/** The water of a hole as a mask (cells of the green inside a hazard zone),
 *  for clipping ripples and splashes to it. */
export function waterMask(t: T) {
  if (t.water) return t.water;
  const data = new Uint8Array(t.nx * t.nz * 4);
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++) {
      const x = (i + 0.5) * CELL, zz = (j + 0.5) * CELL, q = t.zoneAt(x, zz);
      if (t.green[t.idx(i, j)] && q && (q.kind === "hazard" || q.skin === "puddle")) data.fill(255, (j * t.nx + i) * 4, (j * t.nx + i) * 4 + 4);
    }
  const tex = new THREE.DataTexture(data, t.nx, t.nz, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return (t.water = { tex, data, nx: t.nx, nz: t.nz, cell: CELL, w: t.nx * CELL, h: t.nz * CELL });
}

const TUNNEL_COLORS = [C.cap, 0x5b6fb5, C.sun, 0xe98fb0];

/**
 * What a zone adds on top of its colour in the ground. A dispatch table:
 * the first entry whose test matches draws the zone (world pieces first).
 */
const ZONE_DRAW: [(z: Zone) => boolean, ZoneDraw][] = [
  [(z) => z.skin === "seesaw", seesaw],
  [(z) => z.skin === "castle tube", (z, s, t, g) => {
    const castle = (s.posts || []).find((p) => p.skin === "sandcastle");
    const { cx, cz } = boxOf(z);
    return castle ? castleSlide(z, s, t, g, castle, [cx, cz], z.vec) : g;
  }],
  [(z) => z.skin === "crevasse" || z.skin === "ditch", drawGap],
  [(z) => z.kind === "slope" && z.skin === "moon bridge", moonBridge],
  [(z) => z.kind === "slope" && !airy(z) && z.skin !== "mound" && !!(z.vec[0] || z.vec[1]), drawContours],
  [(z) => z.skin === "mill", drawMill],
  [(z) => z.skin === "molehill", drawMolehill],
  [(z) => z.skin === "gap", deckGap],
  [(z) => z.kind === "surface" || z.kind === "hazard", drawSurface],
  [(z) => z.kind === "tunnel", drawTunnel],
];

function zoneDetail(z: Zone, s: Hole, t: T) {
  const own = fromWorld(s, "zone", z, t);
  if (own) return own;
  const g = new THREE.Group();
  const w = z.max[0] - z.min[0], h = z.max[1] - z.min[1];
  const rand = seeded("zone" + s.hole + String(z.min) + String(z.max));
  const hit = ZONE_DRAW.find(([test]) => test(z));
  if (!hit) return g;
  return hit[1](z, s, t, g, { w, h, rand });
}

/**
 * Missing planks in a boardwalk. The ground is open there (course.ts cuts it
 * and gives it the deck's cut face, a joist and piles); this adds the boards
 * broken off round it, splintered, a post at each corner,
 * the deck's shadow on the water and a slow ripple. The water is the world's
 * own (its sea, a lagoon), or a pool as far down where it has none.
 */
function deckGap(z: Zone, s: Hole, t: T, g: THREE.Group) {
  // the hole as the ground is cut: the cells whose centre is in the zone
  const cut = (a: number, b: number): MutVec2 => [Math.ceil(a / CELL - 0.5) * CELL, (Math.floor(b / CELL - 0.5) + 1) * CELL];
  const [xa, xb] = cut(z.min[0], z.max[0]), [za, zb] = cut(z.min[1], z.max[1]);
  const cx = (xa + xb) / 2, cz = (za + zb) / 2, w = xb - xa, d = zb - za;
  const y = t.height(xa - 0.25, cz), W = gapWater(s), rand = seeded("gap" + s.hole + cx + cz);
  if (worldOf(s).SEA === undefined) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(w + 2, d + 2).rotateX(-Math.PI / 2), flat(0x2f6f86));
    pool.position.set(cx, W, cz);
    g.add(pool);
  }
  // the boards run across the lane (as course.ts lays them): they end, broken,
  // on the hole's two sides across their length; each is three slats long
  // and short, a corner of each tip pulled in
  const alongX = s.board.w >= s.board.h, tones = [0xd4a86c, 0xc99a63, 0xbf8f58], slats = new Map<number, THREE.BufferGeometry[]>();
  const [ua, ub] = alongX ? [xa, xb] : [za, zb], [va, vb] = alongX ? [za, zb] : [xa, xb];
  for (let u = Math.floor(ua); u < ub; u++)
    for (const [v0, dir] of [[va, 1], [vb, -1]]) {
      const tone = tones[(u * 7) % 3], list = listIn(slats, tone);
      for (let k = 0; k < 3; k++) {
        const len = 0.04 + rand() * 0.34, sw = 0.3;
        const b = new THREE.BoxGeometry(sw, 0.09, len).translate(0, -0.045, len / 2);
        const P = b.attributes.position;
        for (let i = 0; i < P.count; i++) if (P.getZ(i) > len - 1e-3 && P.getX(i) > 0) P.setZ(i, len * (0.45 + rand() * 0.4));
        b.rotateY((alongX ? 0 : Math.PI / 2) + (dir < 0 ? Math.PI : 0)); // (the boards' length is the lane's width)
        const uu = Math.max(ua, u) + 0.02 + (k + 0.5) * ((Math.min(ub, u + 1) - Math.max(ua, u) - 0.04) / 3);
        list.push(b.translate(alongX ? uu : v0, y, alongX ? v0 : uu));
      }
    }
  for (const [tone, list] of slats) g.add(drawn(mergeGeometries(list), flat(tone)));
  // a post at each corner, just under the deck, down into the water, with a
  // dark wet band and a few barnacles at the waterline
  const posts = [], wet = [], shells = [];
  for (const [px, pz] of [[xa - 0.2, za - 0.2], [xb + 0.2, za - 0.2], [xa - 0.2, zb + 0.2], [xb + 0.2, zb + 0.2]]) {
    const h = y - DECK - (W - 0.7);
    posts.push(new THREE.CylinderGeometry(0.15, 0.18, h, 7).translate(px, y - DECK - h / 2, pz));
    wet.push(new THREE.CylinderGeometry(0.19, 0.19, 0.22, 7).translate(px, W + 0.05, pz));
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI * 2;
      shells.push(new THREE.DodecahedronGeometry(0.045, 0).translate(px + Math.cos(a) * 0.19, W + 0.12 + rand() * 0.18, pz + Math.sin(a) * 0.19));
    }
  }
  g.add(drawn(mergeGeometries(posts), flat(0x6b4a2e)), new THREE.Mesh(mergeGeometries(wet), flat(0x3f4a38)), new THREE.Mesh(mergeGeometries(shells), flat(0xe8e2cf)));
  // the deck's shadow on the water: dark under the boards, fading out
  // towards the middle of the hole (a frame of three rings, alpha per vertex)
  // (only as far out as the deck goes: past its edge it would darken the open sea)
  const deck = (x: number, zz: number) => { const sk = t.zoneAt(x, zz)?.skin; return t.onGreen(x, zz) && !(sk === "sea" || sk === "gap"); };
  const reach = (dx: number, dz: number, x: number, zz: number) => { let m = 0; while (m < 1.2 && deck(x + dx * (m + 0.1), zz + dz * (m + 0.1))) m += 0.1; return m; };
  const [ml, mr, mt, mb] = [reach(-1, 0, xa, cz), reach(1, 0, xb, cz), reach(0, -1, cx, za), reach(0, 1, cx, zb)];
  const ring = (k: number): MutVec2[] => [[xa - ml * k, za - mt * k], [xb + mr * k, za - mt * k], [xb + mr * k, zb + mb * k], [xa - ml * k, zb + mb * k]];
  const inset = Math.min(0.5, w / 3, d / 3);
  const rings: [MutVec2[], number][] = [[ring(1), 0.35], [ring(0), 0.6], [[[xa + inset, za + inset], [xb - inset, za + inset], [xb - inset, zb - inset], [xa + inset, zb - inset]], 0.2]], pos: number[] = [], col: number[] = [];
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 4; k++) {
      const [A, a] = rings[r], [B, b] = rings[r + 1], k2 = (k + 1) % 4;
      for (const [p, al] of [[A[k], a], [B[k], b], [B[k2], b], [A[k], a], [B[k2], b], [A[k2], a]] as const) pos.push(p[0], W + 0.04, p[1]), col.push(0.03, 0.12, 0.15, al);
    }
  const I = rings[2][0]; // and the middle, a shade deeper than the open sea
  for (const p of [I[0], I[1], I[2], I[0], I[2], I[3]]) pos.push(p[0], W + 0.04, p[1]), col.push(0.03, 0.12, 0.15, 0.2);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  const shade = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  shade.renderOrder = 2; // over a lagoon's own see-through water (and kept out of the bake, which drops it)
  ud(shade).live = true;
  g.add(shade);
  // a slow ripple spreading in the open water
  const rip = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdff4fb, transparent: true, depthWrite: false }));
  const [rx, rz] = [cx + (rand() - 0.5) * w * 0.4, cz + (rand() - 0.5) * d * 0.4], R = Math.min(w, d) * 0.4 / 0.26;
  ud(rip).live = true;
  g.add(rip);
  animate((time) => {
    const u = (time * 0.25 + rx) % 1;
    rip.position.set(rx, W + 0.05, rz);
    rip.scale.setScalar(1 + u * (R - 1));
    rip.material.opacity = 0.5 * (1 - u);
  });
  return g;
}

/** A real gap in the lane: a crevasse (ice) or a ditch (earth). */
function drawGap(z: Zone, s: Hole, t: T) {
  // a ditch is the garden's crevasse: earth and roots, not ice
  const earth = z.skin === "ditch";
  // the gap itself: ice cliffs down both sides (where the rough and the
  // world's ground meet it; the lane's own sides are the ground's), a dark
  // blue depth at the bottom, and icicles hanging off the lips
  const g = new THREE.Group();
  const D = GAP_Y, x0 = z.min[0], x1 = z.max[0], z0 = z.min[1], z1 = z.max[1];
  const rand = seeded("crevasse" + s.hole + String(z.min));
  const cliff = flat(earth ? 0x7a5236 : 0x8fcde6, { side: THREE.DoubleSide });
  for (const x of [x0, x1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 + 8, -0.6 - D), cliff);
    m.rotation.y = Math.PI / 2;
    m.position.set(x, (-0.6 + D) / 2, (z0 + z1) / 2);
    g.add(m);
  }
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0 + 8), new THREE.MeshBasicMaterial({ color: earth ? 0x2a1d14 : 0x1d3a5c }));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.set((x0 + x1) / 2, D, (z0 + z1) / 2);
  g.add(bottom);
  for (let k = 0; k < Math.round((z1 - z0) * 1.2); k++) {
    const zz = z0 + rand() * (z1 - z0), x = rand() < 0.5 ? x0 : x1, y = t.onGreen(x - 0.3, zz) || t.onGreen(x + 0.3, zz) ? 0 : -0.6;
    // icicles off an ice lip; roots dangling off an earth one
    const ic = new THREE.Mesh(earth ? new THREE.CylinderGeometry(0.03, 0.05, 0.6 + rand() * 0.7, 4) : new THREE.ConeGeometry(0.1, 0.5 + rand() * 0.6, 5), flat(earth ? 0x5a3a24 : 0xe8f6fb));
    ic.rotation.x = Math.PI;
    ic.position.set(x + (x === x0 ? 0.1 : -0.1), y - 0.35, zz);
    g.add(ic);
  }
  return g;
}

/**
 * Half of a moon bridge (one of its two slopes): planks across the deck on
 * the arch the terrain already makes, and a red side each way, down into the
 * stream, with the arch's dark opening under the crest. No rails: the chain
 * has none, and a ball that runs off the side is in the water.
 */
function moonBridge(z: Zone, s: Hole, t: T, g: THREE.Group) {
  const alongX = Math.abs(z.vec[0]) > Math.abs(z.vec[1]); // the slope's own axis
  const [a0, a1] = alongX ? [z.min[0], z.max[0]] : [z.min[1], z.max[1]];
  const [b0, b1] = alongX ? [z.min[1], z.max[1]] : [z.min[0], z.max[0]];
  const P = (a: number, b: number): MutVec2 => (alongX ? [a, b] : [b, a]);
  const H = (a: number) => t.height(...P(a, (b0 + b1) / 2));
  const wood = flat(0xb9804c), red = flat(0xc8452f);
  const n = Math.max(2, Math.round((a1 - a0) / 0.42));
  for (let k = 0; k < n; k++) {
    const a = a0 + ((k + 0.5) / n) * (a1 - a0), d = 0.1, slope = (H(Math.min(a1 - 0.01, a + d)) - H(Math.max(a0, a - d))) / (2 * d);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(alongX ? (a1 - a0) / n - 0.05 : b1 - b0, 0.06, alongX ? b1 - b0 : (a1 - a0) / n - 0.05), k % 2 ? wood : flat(0xa9733f));
    const [x, zz] = P(a, (b0 + b1) / 2);
    plank.position.set(x, H(a) + 0.02, zz);
    if (alongX) plank.rotation.z = Math.atan(slope);
    else plank.rotation.x = -Math.atan(slope);
    g.add(plank);
  }
  // each side: a red face under the deck's edge, down to the bank where the
  // bridge stands on land and a band under the deck over the water, so the
  // stream runs through under its arch
  const gh = t.ground || t.height;
  for (const b of [b0 - 0.02, b1 + 0.02]) {
    const prof = [], foot = [];
    for (let k = 0; k <= 24; k++) {
      const a = a0 + (k / 24) * (a1 - a0), top = H(a) + 0.06, [x, zz] = P(a, b), p = t.pond(x, zz);
      prof.push([a, top]);
      foot.push([a, (gh(x, zz) - 0.05) + (top - 0.32 - (gh(x, zz) - 0.05)) * Math.min(1, (p ? p.k : 0) * 1.6)]);
    }
    const shp = new THREE.Shape([...prof, ...foot.reverse()].map(([a, y]) => new THREE.Vector2(a, y)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shp), flat(0xc8452f, { side: THREE.DoubleSide }));
    // the shape's x is along the bridge, its y is height: stand it up on the side
    if (alongX) m.position.set(0, 0, b);
    else {
      m.rotation.y = -Math.PI / 2;
      m.position.set(b, 0, 0);
    }
    g.add(m);
    // the red beam along the top of the side
    const beam = new THREE.CatmullRomCurve3(prof.map(([a, y]) => { const [x, zz] = P(a, b); return new THREE.Vector3(x, y - 0.04, zz); }));
    g.add(drawn(new THREE.TubeGeometry(beam, 24, 0.09, 6, false), red));
  }
  // the arch's shade on the water under it
  const [cx, cz] = P((a0 + a1) / 2, (b0 + b1) / 2), p = t.pond(cx, cz);
  if (p) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(z.max[0] - z.min[0], z.max[1] - z.min[1]).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b2530, transparent: true, opacity: 0.3, depthWrite: false }));
    sh.position.set(cx, p.level + 0.01, cz);
    sh.renderOrder = 2;
    ud(sh).live = true; // (kept out of the bake)
    g.add(sh);
  }
  return g;
}

function drawContours(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h }: Opts) {
  // Contour lines, like a map: one every half unit of height, across the
  // slope and draped on it. They show where it rises and how steeply —
  // bunched up where it is steep — without an arrow in sight.
  const l = Math.hypot(z.vec[0], z.vec[1]);
  const ux = -z.vec[0] / l, uz = -z.vec[1] / l; // uphill
  const vx = -uz, vz = ux;                        // across
  const contour = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const { cx, cz } = boxOf(z);
  const reach = Math.hypot(w, h) / 2 + 3;
  const segs: THREE.Vector3[] = [];
  let last = t.height(cx - ux * reach, cz - uz * reach);
  for (let a = -reach; a <= reach; a += 0.25) {
    const px = cx + ux * a, pz = cz + uz * a;
    const hh = t.height(px, pz);
    if (Math.floor(hh / 0.5) === Math.floor(last / 0.5) || hh < 0.2) { last = hh; continue; }
    last = hh;
    // walk across the slope at this height, keeping the pieces on the green
    let run: THREE.Vector3[] = [];
    const flush = () => {
      // as pairs, all in one LineSegments per slope (one draw, and one
      // material the replay can light up)
      for (let k = 1; k < run.length; k++) segs.push(run[k - 1], run[k]);
      run = [];
    };
    for (let b = -reach; b <= reach; b += 0.3) {
      const x = px + vx * b, zz = pz + vz * b;
      const nearCup = Math.hypot(x - s.cup[0], zz - s.cup[1]) < CUP_R + 0.5;
      if (!t.onGreen(x, zz) || t.height(x, zz) < 0.15 || nearCup) { flush(); continue; }
      run.push(new THREE.Vector3(x, t.height(x, zz) + 0.04, zz));
    }
    flush();
  }
  if (segs.length) {
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), contour);
    ud(lines).live = true; // lit by the replay: never baked
    g.add(lines);
    // glow(k): 0 at rest, 1 fully lit (a pale gold) while the ball rolls on it
    const rest = new THREE.Color(0xffffff), lit = new THREE.Color(0xffe38a);
    state.slopes.set(z, {
      glow(k) {
        k = Math.max(0, Math.min(1, k));
        contour.color.copy(rest).lerp(lit, k);
        contour.opacity = 0.55 + 0.45 * k;
      },
    });
  }
  return g;
}

function drawMill(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h }: Opts) {
  // the mill standing across the lane: a big tower, its sails turning
  const { cx, cz } = boxOf(z);
  const k = Math.min(w, h) / 2.4, y0 = t.height(cx, cz);
  const m = windmill(cx, y0, cz);
  m.group.scale.setScalar(k);
  m.group.rotation.y = -Math.PI / 2; // the sails face the tee
  // long sweeps, so a sail reaches down over whichever door it blocks
  // (the tips pass just clear of the mill's low base kerb)
  for (const arm of m.hub.children.slice(1)) arm.scale.y = 1.1;
  ud(m.hub).live = true;
  // The chain turns the wheel within the stroke: its sails are timed
  // walls over the doors (hole4: a turn in 24 substeps, a sail down over
  // the middle door at every quarter). So the replay drives it — at step u
  // of a shot the wheel is at start + u × a 24th of a turn, sails where the
  // chain has them. Between shots it turns on its own; on a new shot it
  // eases on to the next quarter (four sails: every quarter is the start).
  const STEP = (Math.PI * 2) / 24, QUARTER = Math.PI / 2;
  let ang = Math.PI, start: number | null = null, goal: number | null = null, last: number | null = null;
  state.mill = {
    shoot() {
      // the next quarter at least a little ahead (π, sail down, is a quarter)
      start = Math.ceil((ang + 0.15) / QUARTER) * QUARTER;
      goal = start;
    },
    at(u) { if (start !== null) goal = start + u * STEP; },
    idle() { start = goal = null; },
  };
  animate((time) => {
    const dt = last === null ? 0 : Math.min(0.1, time - last);
    last = time;
    if (goal === null) ang += 1.1 * dt; // idle: turning, the same way as in a shot
    else ang += Math.min(Math.max(0, goal - ang), Math.max(1.5 * dt, (goal - ang) * Math.min(1, dt * 14)));
    m.hub.rotation.z = ang;
  });
  g.add(m.group);
  return g;
}

function drawMolehill(z: Zone, s: Hole, t: T, g: THREE.Group, { rand }: Opts) {
  // where the mole lives: a ring of turned earth, flat enough to roll over
  const { cx, cz } = boxOf(z);
  const y = t.height(cx, cz);
  const ring = drawn(new THREE.TorusGeometry(0.75, 0.2, 8, 20), flat(C.bark));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.z = 0.6;
  ring.position.set(cx, y + 0.05, cz);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), flat(C.burrow));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(cx, y + 0.04, cz);
  for (let k = 0; k < 5; k++) {
    const clod = drawn(new THREE.DodecahedronGeometry(0.14, 0), flat(C.bark));
    const a = (k / 5) * Math.PI * 2 + rand();
    clod.position.set(cx + Math.cos(a) * 1.05, y + 0.08, cz + Math.sin(a) * 1.05);
    g.add(clod);
  }
  g.add(ring, hole);
  return g;
}

// A surface or a hazard: its patch in the ground (a blob, draped), a deck's
// planks, the bank's ink; then the detail its kind draws (SURFACE_DETAIL).
/**
 * The garden's ponds and streams: one flat sheet at each one's level, cell by
 * cell wherever the ground (terrain.ts sinks it) goes down under it, the
 * banks hiding its edge. Pale over the shallows by the banks, darker out in
 * the deep middle. Null when the hole has none.
 */
export function pondWater(s: Hole, t: T) {
  const pos = [], col = [], deep = new THREE.Color(0x2c6479), shallow = new THREE.Color(0x86c3cc), c = new THREE.Color();
  const gh = t.ground || t.height;
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++) {
      if (!t.green[t.idx(i, j)]) continue;
      const cs = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]].map(([a, b]) => [a * CELL, b * CELL]);
      const ws = cs.map(([x, zz]) => t.pond(x, zz)), p = ws.find(Boolean);
      if (!p || cs.every(([x, zz]) => gh(x, zz) > p.level + 0.01)) continue;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [x, zz] = cs[k], d = ws[k] ? ws[k].d : 0;
        c.copy(shallow).lerp(deep, smoothstep((d - 0.3) / 2.2));
        pos.push(x, p.level, zz);
        col.push(c.r, c.g, c.b);
      }
    }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
}

function drawSurface(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h, rand }: Opts) {
  const water = z.kind === "hazard";
  const ice = z.skin === "ice" || (z.kind === "surface" && z.scale > 1);
  // skins the chain names get their own look; an unknown one is the kind's
  const bed = z.skin === "flowerbed", puddle = z.skin === "puddle", deck = z.skin === "bridge", soil = z.skin === "soil";
  const WATER: Record<string, number> = { sea: 0x4ea3cf, wave: 0x8fd0ee, lagoon: 0x5fd0cc, tidepool: 0x6fc3c9, fountain: 0x8fd0ee, canal: 0x4d8fb3, gap: 0x1f3d4a };
  // in the mountains a bunker is a patch of deep snow: same drag, white
  const snow = s.world === "mountain" && !water && !ice && !puddle && !bed && !deck && (z.skin === "sand" || !z.skin);
  const color = snow ? 0xf3f7fa : water ? WATER[z.skin] ?? C.pond : puddle ? 0x9fcde0 : bed ? 0x7b5a3f : soil ? 0x6e4d33 : deck ? C.wood : z.skin === "wetsand" ? 0xc8a46e : ice ? 0xbfe6f0 : 0xecd49c;
  const blob = organic(z, rand, s.board);
  // inside the drawn shape and on the green, with a margin: where detail may go
  const inSand = (x: number, zz: number) => {
    if (x < 0.4 || zz < 0.4 || x > s.board.w - 0.4 || zz > s.board.h - 0.4) return false;
    if (!t.onGreen(x, zz)) return false;
    if (z.poly) return inZone(z, x, zz);
    if (!z.round) return true;
    const ex = (x - (z.min[0] + z.max[0]) / 2) / (w / 2), ez = (zz - (z.min[1] + z.max[1]) / 2) / (h / 2);
    return ex * ex + ez * ez < 0.8;
  };
  // a spot for a detail of radius r, all of it inside the shape; null if none
  const spot = (r: number, lo = 0.25, span = 0.5): MutVec2 | null => {
    for (let tries = 0; tries < 12; tries++) {
      const x = z.min[0] + w * (lo + rand() * span), zz = z.min[1] + h * (lo + rand() * span);
      if ([[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([a, b]) => inSand(x + a, zz + b))) return [x, zz];
    }
    return null;
  };
  // a garden pond is sunk into the ground (terrain.ts, pondWater), with its
  // banks; over one, a causeway is a boardwalk on posts
  const sunk = water && z.skin === "water";
  if (deck && t.pond((z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2)) return boardwalk(z, s, t, g);
  if (sunk) {
    pondDetail(z, s, t, g, { w, h, rand });
    return g;
  }
  const geo = new THREE.ShapeGeometry(blob.shape, 6);
  geo.rotateX(-Math.PI / 2);
  // sunk a touch below the green for water, laid on it for sand
  drape(geo, (x, zz) => t.height(x, zz) + (water ? 0.025 : 0.035));
  g.add(new THREE.Mesh(geo, flat(color, { alphaMap: greenMask(t), alphaTest: 0.5 })));
  if (deck) {
    // planks across the deck, and a rail each side
    const alongX = w >= h, n = Math.floor((alongX ? w : h) / 0.45);
    const line = new THREE.LineBasicMaterial({ color: C.woodDark });
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const a: MutVec2 = alongX ? [z.min[0] + u * w, z.min[1]] : [z.min[0], z.min[1] + u * h], b: MutVec2 = alongX ? [z.min[0] + u * w, z.max[1]] : [z.max[0], z.min[1] + u * h];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], t.height(...a) + 0.05, a[1]), new THREE.Vector3(b[0], t.height(...b) + 0.05, b[1])]), line));
    }
  }
  // the bank's ink line, only where the bank is on the green
  let run: THREE.Vector3[] = [];
  const flushRim = () => { if (run.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), ink)); run = []; };
  for (const [x, zz] of [...blob.points, blob.points[0]]) {
    if (t.onGreen(x, zz)) run.push(new THREE.Vector3(x, t.height(x, zz) + 0.06, zz));
    else flushRim();
  }
  flushRim();

  const f = { water, puddle, soil, bed, ice, deck };
  const detail = SURFACE_DETAIL.find(([test]) => test(f));
  if (detail) detail[1](z, s, t, g, { w, h, rand, blob, inSand, spot, snow });
  return g;
}

// the detail on a surface, by what it is: the first that matches draws
const SURFACE_DETAIL: [(f: Record<"water" | "puddle" | "soil" | "bed" | "ice" | "deck", boolean>) => boolean, DetailDraw][] = [
  [(f) => f.water, waterDetail],
  [(f) => f.puddle, puddleDetail],
  [(f) => f.soil, soilDetail],
  [(f) => f.bed, bedDetail],
  [(f) => f.ice, iceDetail],
  [(f) => !f.deck, sandDetail],
];

/** A causeway over a pond: a boardwalk on posts, planks across it, two
 *  stringers under them, the water running on beneath and shaded by it. The
 *  ball rides its top, at the lane's own height. */
function boardwalk(z: Zone, s: Hole, t: T, g: THREE.Group) {
  const [x0, z0] = z.min, [x1, z1] = z.max, alongX = x1 - x0 >= z1 - z0;
  const L = alongX ? x1 - x0 : z1 - z0, W = alongX ? z1 - z0 : x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const y = t.height(cx, cz), gh = t.ground || t.height, rand = seeded("walk" + cx + cz), p = t.pond(cx, cz);
  const P = (u: number, v: number): MutVec2 => (alongX ? [x0 + u, cz + v] : [cx + v, z0 + u]); // u along it, v across
  const tones = new Map<number, THREE.BufferGeometry[]>(), n = Math.round(L / 0.5);
  for (let k = 0; k < n; k++) {
    const tone = [0xb9804c, 0xa9733f, 0xc38a55][(k * 7) % 3], list = listIn(tones, tone);
    const [x, zz] = P((k + 0.5) * (L / n), (rand() - 0.5) * 0.08);
    const b = new THREE.BoxGeometry(L / n - 0.05, 0.08, W + 0.1).rotateX((rand() - 0.5) * 0.02);
    if (!alongX) b.rotateY(Math.PI / 2);
    list.push(b.translate(x, y - 0.035 + (rand() - 0.5) * 0.012, zz));
  }
  for (const [tone, list] of tones) g.add(drawn(mergeGeometries(list), flat(tone)));
  const beams = [], posts = [], bands = [];
  for (const v of [-W / 2 + 0.2, W / 2 - 0.2]) {
    const [bx, bz] = P(L / 2, v);
    beams.push(new THREE.BoxGeometry(alongX ? L : 0.14, 0.2, alongX ? 0.14 : L).translate(bx, y - 0.18, bz));
    for (let u = 0.4; u < L; u += 1.6) {
      const [x, zz] = P(u, v), foot = gh(x, zz) - 0.1, h = y - 0.28 - foot;
      if (h < 0.1) continue; // on the bank: the stringer rests on it
      posts.push(new THREE.CylinderGeometry(0.1, 0.12, h, 6).translate(x, foot + h / 2, zz));
      if (p) bands.push(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 6).translate(x, p.level + 0.03, zz));
    }
  }
  g.add(drawn(mergeGeometries(beams), flat(0x6b4a2e)));
  if (posts.length) g.add(drawn(mergeGeometries(posts), flat(0x6b4a2e)));
  if (bands.length) g.add(new THREE.Mesh(mergeGeometries(bands), flat(0x3f4a38)));
  // its shadow on the water
  if (p) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? L : W + 0.7, alongX ? W + 0.7 : L).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b2530, transparent: true, opacity: 0.28, depthWrite: false }));
    sh.position.set(cx, p.level + 0.01, cz);
    sh.renderOrder = 2;
    ud(sh).live = true; // (kept out of the bake)
    g.add(sh);
  }
  return g;
}

/** A sunk garden pond (the water itself is pondWater's): lily pads out on
 *  it, a glint of sky, slow rings, reeds in clumps at the banks by the walls
 *  (off the lane, where no ball goes). */
function pondDetail(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h, rand }: Opts) {
  const clear = (x: number, zz: number) => !s.zones.some((q) => ((q.kind === "slope" && (q.skin === "moon bridge" || q.skin === "seesaw")) || q.skin === "bridge") && x > q.min[0] - 0.9 && x < q.max[0] + 0.9 && zz > q.min[1] - 0.9 && zz < q.max[1] + 0.9);
  // somewhere on the water at least d in from its edge, clear of what crosses it
  const out = (d: number) => {
    for (let n = 0; n < 30; n++) {
      const x = z.min[0] + rand() * w, zz = z.min[1] + rand() * h, p = t.pond(x, zz);
      if (p && inZone(z, x, zz) && inset(z, x, zz) > d && clear(x, zz) && t.onGreen(x, zz)) return [x, zz, p.level];
    }
    return null;
  };
  const area = w * h;
  // lily pads, in twos and threes, one with a flower
  const pads = [], flowers = [];
  for (let k = 0; k < Math.min(4, 1 + area / 25); k++) {
    const at = out(1.1);
    if (!at) continue;
    for (let n = 0; n < 2 + (rand() * 2 | 0); n++) {
      const r = 0.28 + rand() * 0.2, a = rand() * 6.3, x = at[0] + (n ? Math.cos(a) * 0.7 : 0), zz = at[1] + (n ? Math.sin(a) * 0.7 : 0);
      if (!t.pond(x, zz) || inset(z, x, zz) < 0.7) continue;
      pads.push(new THREE.CircleGeometry(r, 12, 0.3, Math.PI * 1.82).rotateX(-Math.PI / 2).rotateY(rand() * 6.3).translate(x, at[2] + 0.012, zz));
      if (!k && !n) flowers.push(new THREE.ConeGeometry(0.12, 0.14, 6).translate(x, at[2] + 0.08, zz));
    }
  }
  if (pads.length) g.add(new THREE.Mesh(mergeGeometries(pads), flat(C.leaf)));
  if (flowers.length) g.add(new THREE.Mesh(mergeGeometries(flowers), flat(0xf2a7c3)));
  // a glint: the sky on the water, long and soft
  const glint = out(1.4);
  if (glint) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }));
    m.scale.set(2.2, 1, 0.35);
    m.rotation.y = 0.5;
    m.position.set(glint[0], glint[2] + 0.01, glint[1]);
    g.add(m);
  }
  // two slow rings
  for (let k = 0; k < 2; k++) {
    const at = out(1.2);
    if (!at) continue;
    const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 28).rotateX(-Math.PI / 2), clipTo(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }), waterMask(t)));
    r.position.set(at[0], at[2] + 0.015, at[1]);
    const phase = rand() * 4;
    ud(r).live = true;
    animate((time) => {
      const u = ((time + phase) % 4) / 4;
      r.scale.setScalar(0.6 + u * 2.2);
      r.material.opacity = 0.32 * (1 - u);
    });
    g.add(r);
  }
  // reeds: clumps standing in the shallows at the banks by a wall
  const gh = t.ground || t.height, stems = [], tips = [];
  for (let n = 0, clumps = 0; n < 80 && clumps < 3; n++) {
    const x = z.min[0] + rand() * w, zz = z.min[1] + rand() * h, d = inset(z, x, zz);
    if (d < 0.25 || d > 0.6 || !t.onGreen(x, zz) || !clear(x, zz) || !s.walls.some((q) => segDist(x, zz, q.a, q.b) < 1.2)) continue;
    clumps++;
    for (let k = 0; k < 5; k++) {
      const sx = x + (rand() - 0.5) * 0.5, sz = zz + (rand() - 0.5) * 0.5, l = 0.7 + rand() * 0.6, y = gh(sx, sz);
      const lean = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3));
      stems.push(new THREE.CylinderGeometry(0.025, 0.04, l, 4).translate(0, l / 2, 0).applyMatrix4(lean).translate(sx, y, sz));
      if (k % 2 === 0) tips.push(new THREE.CapsuleGeometry(0.055, 0.2, 2, 5).translate(0, l + 0.05, 0).applyMatrix4(lean).translate(sx, y, sz));
    }
  }
  if (stems.length) g.add(new THREE.Mesh(mergeGeometries(stems), flat(C.leafDark)));
  if (tips.length) g.add(new THREE.Mesh(mergeGeometries(tips), flat(C.bark)));
}

/** Water: its shore of pebbles and reeds, ripples, a lily pad (a fountain's basin, a canal's stones). */
function waterDetail(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h, rand, blob, spot }: Detail) {
  // a shore of pebbles, reeds at a corner, a lily pad and ripples — none
  // on a wall: a pond that runs up to one would push them through it
  // (nor on a bridge's deck or a causeway, where a pond runs up to one)
  const onDeck = (x: number, zz: number) => s.zones.some((q) => ((q.kind === "slope" && q.skin === "moon bridge") || q.skin === "bridge" || q.skin === "seesaw") && x > q.min[0] - 0.8 && x < q.max[0] + 0.8 && zz > q.min[1] - 0.8 && zz < q.max[1] + 0.8);
  const byWall = (x: number, zz: number) => onDeck(x, zz) || s.walls.some((w) => segDist(x, zz, w.a, w.b) < 0.8);
  // the sea and a wave have no shore of pebbles and reeds: they are open water
  const shore = !["sea", "wave", "canal", "gap", "fountain"].includes(z.skin);
  if (z.skin === "fountain") fountainBasin(z, t, g, w, h);
  if (z.skin === "canal") canalEdges(z, t, g, w, h);
  for (let k = 0; shore && k < blob.points.length; k += 3) {
    const [x, zz] = blob.points[k];
    if (byWall(x, zz) || !t.onGreen(x, zz)) continue;
    const st = stone(rand);
    st.scale.setScalar(0.35 + rand() * 0.2);
    st.position.set(x, t.height(x, zz) + 0.05, zz);
    g.add(st);
  }
  for (let k = 0; shore && k < 5; k++) {
    const [x, zz] = blob.points[Math.floor(rand() * blob.points.length)];
    if (byWall(x, zz) || !t.onGreen(x, zz)) continue;
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.9 + rand() * 0.5, 5), flat(C.leafDark));
    reed.position.set(x, t.height(x, zz) + 0.5, zz);
    reed.rotation.z = (rand() - 0.5) * 0.4;
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 3, 6), flat(C.bark));
    tip.position.y = 0.45;
    reed.add(tip);
    g.add(reed);
  }
  for (let k = 0; k < Math.min(8, Math.max(2, (w * h) / 8)); k++) {
    const at = spot(1.0);
    if (!at) continue;
    const [x, zz] = at;
    const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 24), clipTo(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), waterMask(t)));
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, t.height(x, zz) + 0.04, zz);
    const phase = rand() * 3;
    ud(r).live = true;
    animate((time) => {
      const k = ((time + phase) % 3) / 3; // one ring every three seconds
      r.scale.setScalar(0.6 + k * 1.8);
      r.material.opacity = 0.55 * (1 - k);
    });
    g.add(r);
  }
  const padAt = shore && spot(0.6, 0.3, 0.4);
  if (padAt) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14, 0.3, Math.PI * 1.8), flat(C.leaf));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(padAt[0], t.height(padAt[0], padAt[1]) + 0.045, padAt[1]);
    g.add(pad);
  }
}

/** A round basin with a rim, and a spout of water in the middle. */
function fountainBasin(z: Zone, t: T, g: THREE.Group, w: number, h: number) {
  const { cx, cz } = boxOf(z), r = Math.min(w, h) / 2, y = t.height(cx, cz);
  const rim = drawn(new THREE.TorusGeometry(r, 0.18, 8, 32), flat(0xb9c2bd));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(cx, y + 0.12, cz);
  const col = drawn(new THREE.CylinderGeometry(0.18, 0.3, 1.2, 10), flat(0xb9c2bd));
  col.position.set(cx, y + 0.6, cz);
  const bowl = drawn(new THREE.SphereGeometry(0.7, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat(0xa5aea9, { side: THREE.DoubleSide }));
  bowl.position.set(cx, y + 1.35, cz);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xdff4fb, transparent: true, opacity: 0.8 }));
  jet.position.set(cx, y + 1.8, cz);
  ud(jet).live = true;
  animate((time) => (jet.scale.y = 0.85 + 0.2 * Math.sin(time * 6)));
  g.add(rim, col, bowl, jet);
}

/** A canal's stone edges along its long sides. */
function canalEdges(z: Zone, t: T, g: THREE.Group, w: number, h: number) {
  const alongX = w >= h, n = Math.ceil((alongX ? w : h) / 1.2);
  for (const sgn of [0, 1])
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = alongX ? z.min[0] + u * w : sgn ? z.max[0] : z.min[0], zz = alongX ? (sgn ? z.max[1] : z.min[1]) : z.min[1] + u * h;
      if (!t.onGreen(x, zz) && !t.onGreen(x + (alongX ? 0 : sgn ? 0.3 : -0.3), zz + (alongX ? (sgn ? 0.3 : -0.3) : 0))) continue;
      const st = drawn(rbox(alongX ? 1.15 : 0.35, 0.18, alongX ? 0.35 : 1.15, 0.05), flat(k % 2 ? 0xb9c2bd : 0xa5aea9));
      st.position.set(x, t.height(x, zz) + 0.06, zz);
      g.add(st);
    }
}

/** A shallow puddle: glints of sky and rings, all inside it. */
function puddleDetail(z: Zone, s: Hole, t: T, g: THREE.Group, { rand, spot }: Detail) {
  const ringMat = () => clipTo(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), waterMask(t));
  for (let k = 0; k < 3; k++) {
    const at = spot(0.8);
    if (!at) continue;
    const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 24), ringMat());
    r.rotation.x = -Math.PI / 2;
    r.position.set(at[0], t.height(at[0], at[1]) + 0.045, at[1]);
    const phase = rand() * 3;
    ud(r).live = true;
    animate((time) => {
      const k = ((time + phase) % 3) / 3;
      r.scale.setScalar(0.5 + k * 1.6);
      r.material.opacity = 0.5 * (1 - k);
    });
    g.add(r);
  }
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  for (let k = 0; k < 5; k++) {
    const at = spot(0.5, 0.2, 0.6);
    if (!at) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + rand() * 0.6, 0.07), glint);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -0.6;
    m.position.set(at[0], t.height(at[0], at[1]) + 0.05, at[1]);
    g.add(m);
  }
}

/** A row of the vegetable patch: furrows, and heads planted on the ridges. */
function soilDetail(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h, rand, inSand }: Detail) {
  // a row of the vegetable patch: furrows along it, and cabbages and
  // lettuces planted in lines on the ridges, low enough to roll through
  const pts = z.poly && z.poly.length > 2 ? z.poly : [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]];
  let ax = 1, az = 0, best = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) (best = l), (ax = (b[0] - a[0]) / l), (az = (b[1] - a[1]) / l);
  }
  const { cx, cz } = boxOf(z), nx = -az, nz = ax, reach = Math.hypot(w, h) / 2 + 1;
  const furrow = new THREE.LineBasicMaterial({ color: 0x4f3524 });
  const heads = [flat(0x8fcb6a), flat(0x6fae55), flat(0xb5d98a)], leaf = new THREE.SphereGeometry(1, 9, 6);
  const inRow = (x: number, zz: number) => inSand(x, zz) && inZone(z, x, zz);
  for (let b = -reach, line = 0; b <= reach; b += 0.55, line++) {
    let run: THREE.Vector3[] = [];
    const flush = () => { if (run.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), furrow)); run = []; };
    for (let a = -reach; a <= reach; a += 0.3) {
      const x = cx + ax * a + nx * b, zz = cz + az * a + nz * b;
      if (!inRow(x, zz)) { flush(); continue; }
      run.push(new THREE.Vector3(x, t.height(x, zz) + 0.05, zz));
    }
    flush();
    if (line % 2) continue;
    // every other ridge is planted, a head every 1.1 or so
    for (let a = -reach + (line % 4 ? 0.55 : 0); a <= reach; a += 1.1) {
      const x = cx + ax * a + nx * (b + 0.27), zz = cz + az * a + nz * (b + 0.27), r = 0.17 + rand() * 0.08;
      if (![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => inRow(x + dx, zz + dz))) continue;
      const m = new THREE.Mesh(leaf, heads[Math.floor(rand() * heads.length)]);
      m.scale.set(r, r * 0.75, r);
      m.position.set(x, t.height(x, zz) + 0.04 + r * 0.5, zz);
      g.add(m);
    }
  }
}

/** A bed of soil full of flowers. */
function bedDetail(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h, rand, inSand }: Detail) {
  // a bed of soil full of flowers, low enough to read as ground you can
  // roll through (slowly), not a wall of stems
  const petals = [C.petal, C.cream, C.sun, 0x9b7fd1, 0xf29a6b].map((c) => flat(c));
  const stemMat = flat(C.leafDark);
  const head = new THREE.SphereGeometry(0.1, 7, 5), stem = new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4);
  const leaf = new THREE.SphereGeometry(0.12, 6, 4);
  for (let k = 0; k < w * h * 3; k++) {
    const x = z.min[0] + rand() * w, zz = z.min[1] + rand() * h;
    if (!inSand(x, zz)) continue;
    const y = t.height(x, zz) + 0.04;
    if (k % 3 === 2) {
      const l = new THREE.Mesh(leaf, flat(C.leaf));
      l.scale.y = 0.4;
      l.position.set(x, y + 0.03, zz);
      g.add(l);
      continue;
    }
    const st = new THREE.Mesh(stem, stemMat);
    st.position.set(x, y + 0.12, zz);
    const hd = new THREE.Mesh(head, petals[k % petals.length]);
    hd.position.set(x, y + 0.26, zz);
    hd.scale.y = 0.7;
    g.add(st, hd);
  }
}

/** Ice: long white scratches and a few glints, so it reads frozen, not grey. */
function iceDetail(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h, rand, spot }: Detail) {
  const streak = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  for (let k = 0; k < Math.max(6, (w * h) / 6); k++) {
    const at = spot(1.3, 0.2, 0.6);
    if (!at) continue;
    const [x, zz] = at;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + rand() * 1.6, 0.06), streak);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -0.5 + (rand() - 0.5) * 0.3;
    m.position.set(x, t.height(x, zz) + 0.045, zz);
    g.add(m);
  }
  for (let k = 0; k < 6; k++) {
    const at = spot(0.2, 0.2, 0.6);
    if (!at) continue;
    const [x, zz] = at;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.12, 4), streak);
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(x, t.height(x, zz) + 0.05, zz);
    g.add(glint);
  }
}

/** Sand (or deep snow): grains and raked lines. */
function sandDetail(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h, rand, inSand, snow }: Detail) {
  // sand: grains and raked lines, kept inside the shape's inner margin
  const grain = new THREE.CircleGeometry(1, 10);
  const tones = snow ? [flat(0xd6e6ef), flat(0xffffff)] : [flat(0xd9bd82), flat(0xf4e1b2)];
  for (let i = 0; i < w * h * 4; i++) {
    const x = z.min[0] + w * (0.2 + rand() * 0.6), zz = z.min[1] + h * (0.2 + rand() * 0.6);
    if (!inSand(x, zz)) continue;
    const d = new THREE.Mesh(grain, tones[i % 2]);
    d.scale.setScalar(0.025 + rand() * 0.035);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, t.height(x, zz) + 0.045, zz);
    g.add(d);
  }
  for (let k = 1; k < Math.floor(h / 0.9); k++) {
    const zz = z.min[1] + k * 0.9;
    const pts = [];
    for (let x = z.min[0] + w * 0.22; x <= z.max[0] - w * 0.22; x += 0.4) {
      if (!inSand(x, zz)) {
        if (pts.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: snow ? 0xc9dce8 : 0xd9bd82 })));
        pts.length = 0;
        continue;
      }
      pts.push(new THREE.Vector3(x, t.height(x, zz) + 0.05, zz + Math.sin(x * 1.3) * 0.12));
    }
    if (pts.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: snow ? 0xc9dce8 : 0xd9bd82 })));
  }
}

/**
 * The castle gate: an arch in the castle's wall where the ball goes in, and a
 * sand-coloured tube that spirals round the outside of the castle, above the
 * lane (the ball rolls round the castle under it), down to the exit mouth.
 * The replay rides the ball along it (state.tubes).
 */
function castleSlide(z: Zone, s: Hole, t: T, g: THREE.Group, castle: Post, [cx, cz]: Vec2, [ox, oz]: Vec2) {
  const [kx, kz] = castle.c, R0 = castle.r;
  const ang = (x: number, zz: number) => Math.atan2(zz - kz, x - kx);
  // round the castle the way that leaves it heading +x (east, to the cup):
  // clockwise on the board, the angle going down
  const a0 = ang(cx, cz);
  let a1 = ang(ox, oz);
  while (a1 > a0 - Math.PI * 2.2) a1 -= Math.PI * 2; // about a turn and a quarter
  const r0 = Math.hypot(cx - kx, cz - kz), r1 = Math.hypot(ox - kx, oz - kz), rs = R0 + 0.55; // hugs the wall
  const y0 = t.height(cx, cz), y1 = t.height(ox, oz), top = 5.6, clear = 2.1; // clear of a rolling ball and the ramparts
  // in straight from the tee side: the mouth opens at -x, square to the zone,
  // and the tube runs +x a little before it turns round the castle
  const lead = Math.max(0.3, Math.min(0.8, r0 - R0 - 0.6));
  const sit = 0.9; // the mouth's centre: its ring clears the ground
  // the first and last stretches are straight and level, so each end is a
  // clean cut square to the axis (the lip sits on it)
  const pts = [new THREE.Vector3(cx - 0.05, y0 + sit, cz), new THREE.Vector3(cx + lead * 0.5, y0 + sit, cz), new THREE.Vector3(cx + lead, y0 + sit + 0.05, cz)];
  const N = 90;
  for (let k = 3; k < N; k++) {
    const u = k / N, a = a0 + (a1 - a0) * u;
    const edge = Math.min(1, Math.min(u, 1 - u) / 0.1);
    const r = u < 0.5 ? r0 + (rs - r0) * edge : r1 + (rs - r1) * edge;
    const up = Math.min(1, Math.min(u, 1 - u) / 0.07);
    const yy = (u < 0.5 ? y0 : y1) + sit + up * (clear - sit) + Math.sin(Math.PI * u) * (top - clear);
    pts.push(new THREE.Vector3(kx + Math.cos(a) * r, yy, kz + Math.sin(a) * r));
  }
  // and out, straightened: the last stretch runs east onto the exit
  pts.push(new THREE.Vector3(ox - 1.4, y1 + sit + 0.05, oz), new THREE.Vector3(ox - 0.7, y1 + sit, oz), new THREE.Vector3(ox, y1 + sit, oz));
  const path = new THREE.CatmullRomCurve3(pts);
  const tubeR = 0.6; // the zone is 1.6 across: the mouth fills it
  const SAND = 0xe0bd7e, WET = 0xc9a66a;
  // the tube: sand outside, a dark wall inside (seen only into the ends, so
  // the throat is closed and dark all the way in), an ink hull just outside
  const TS = 200, RS = 16;
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, TS, tubeR, RS, false), flat(SAND)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, TS, tubeR * 0.96, RS, false), new THREE.MeshBasicMaterial({ color: C.burrow, side: THREE.BackSide })));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, TS, tubeR + 0.05, RS, false), hullOf(0)));
  const rim = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + tubeR * 0.86)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(rim, TS, 0.07, 6, false), flat(0xb98f55)));
  // each end: a flared lip exactly on the cut, concentric with the tube, a
  // wet band just behind it; all square to the tube's own axis there
  for (const u of [0, 1]) {
    const p = path.getPointAt(u), d = path.getTangentAt(u).normalize();
    const out = u === 0 ? d.clone().negate() : d.clone(); // the way the opening faces
    const end = new THREE.Group();
    end.position.copy(p);
    end.lookAt(p.clone().add(out)); // the group's +z is the opening's outward axis
    const lip = drawn(new THREE.TorusGeometry(tubeR + 0.06, 0.15, 12, 32), flat(SAND));
    lip.position.z = -0.02;
    const band = new THREE.Mesh(new THREE.TorusGeometry(tubeR + 0.01, 0.05, 6, 32), flat(WET));
    band.position.z = -0.32;
    end.add(lip, band); // (the dark inner wall closes the throat all the way)
    g.add(end);
  }
  state.tubes.set(z, path);
  return g;
}

function drawTunnel(z: Zone, s: Hole, t: T, g: THREE.Group, { w, h }: Opts) {
  // A tunnel is a hole in the ground with a coloured rim, and a badge over
  // it pointing down; its way out is a pipe of the same colour with a badge
  // pointing up. Nothing else on a hole looks like that — the cup has its
  // target and the yellow arrow — so there is no guessing which is which.
  const pair = TUNNEL_COLORS[s.zones.filter((q) => q.kind === "tunnel").indexOf(z) % TUNNEL_COLORS.length];
  const [cx, cz] = [z.min[0] + w / 2, z.min[1] + h / 2];
  const y = t.height(cx, cz);
  const [ox, oz] = z.vec;
  const oy = t.height(ox, oz);
  // The tube is the tunnel: its open mouth lies on the green facing the
  // tee and swallows the ball, the other end lies by the exit and spits it
  // out facing the cup. The mouth's opening is the zone the chain tests.
  const flat2 = (x: number, zz: number) => new THREE.Vector3(x, 0, zz);
  const dirIn = flat2(s.start[0] - cx, s.start[1] - cz).normalize();
  const dirOut = flat2(s.cup[0] - ox, s.cup[1] - oz).normalize();
  if (MOUTHS[z.skin]) {
    // an entrance that is a thing (a cave, a well, a door, a wreck), and
    // the same thing where the ball comes out; no pipe between
    const R = Math.max(0.6, Math.min(w, h) * 0.4);
    g.add(mouthAt(z.skin, cx, y, cz, R, dirIn), mouthAt(z.skin, ox, oy, oz, R * 0.8, dirOut));
    return g;
  }
  if (z.skin === "castle gate") {
    const castle = (s.posts || []).find((p) => p.skin === "sandcastle");
    if (castle) return castleSlide(z, s, t, g, castle, [cx, cz], [ox, oz]);
  }
  if (z.skin === "warp") {
    // a magic hole: a spinning, glowing swirl at each end, and nothing in
    // between — the ball drops into one and pops out of the other
    g.add(warp(cx, y, cz, Math.min(w, h) / 2, pair), warp(ox, oy, oz, 1.1, pair));
    return g;
  }
  // the mouth lies on the ground, its opening right where the chain swallows
  // the ball: you roll into the pipe, you do not drop into a hole next to it
  const R = Math.max(0.6, Math.min(w, h) * 0.32), lift = R * 1.4 + 0.15; // the bell's lip clears the grass
  const mouth = new THREE.Vector3(cx, y + lift, cz).addScaledVector(dirIn, 0.25);
  const out = new THREE.Vector3(ox, oy + lift, oz).addScaledVector(dirOut, 0.25);
  const span = mouth.distanceTo(out), top = Math.max(y, oy) + Math.min(4.5, 1.6 + span * 0.12);
  // a pipe that would cross a mill goes under it instead: over the top it
  // would pass through the turning sails. It dives into the ground right
  // behind its mouth and comes up again at its exit, like a garden pipe.
  const underMill = s.zones.some((q) => q.skin === "mill" && Math.min(cx, ox) < q.min[0] && Math.max(cx, ox) > q.max[0]);
  const path = underMill
    ? new THREE.CatmullRomCurve3([
        mouth,
        new THREE.Vector3(cx, y + lift * 0.55, cz).addScaledVector(dirIn, -0.7),
        new THREE.Vector3(cx, y - 1.4, cz).addScaledVector(dirIn, -1.3),
        mouth.clone().lerp(out, 0.5).setY(Math.min(y, oy) - 2.2),
        new THREE.Vector3(ox, oy - 1.4, oz).addScaledVector(dirOut, -1.3),
        new THREE.Vector3(ox, oy + lift * 0.55, oz).addScaledVector(dirOut, -0.7),
        out,
      ])
    : new THREE.CatmullRomCurve3([
        mouth,
        new THREE.Vector3(cx, y + lift + 0.2, cz).addScaledVector(dirIn, -1.2),
        mouth.clone().lerp(out, 0.5).setY(top),
        new THREE.Vector3(ox, oy + lift + 0.2, oz).addScaledVector(dirOut, -1.2),
        out,
      ]);
  const tube = drawn(new THREE.TubeGeometry(path, 70, R, 12, false), flat(pair));
  g.add(tube);
  // a flared bell at each end, dark inside: the openings read at a glance
  for (const [at, dir] of [[mouth, dirIn], [out, dirOut]]) {
    // a real mouth: the flared bell seen from both sides, a thick lip,
    // a dark throat going into the tube, and the bottom set well back
    const ends = new THREE.Group();
    ends.position.copy(at);
    ends.lookAt(at.clone().add(dir));
    const bell = drawn(new THREE.CylinderGeometry(R * 1.4, R * 1.02, 0.6, 20, 1, true), flat(pair, { side: THREE.DoubleSide }));
    bell.rotation.x = Math.PI / 2;
    bell.position.z = 0.2;
    const lip = drawn(new THREE.TorusGeometry(R * 1.4, 0.13, 8, 24), flat(pair));
    lip.position.z = 0.5;
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 1.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: C.burrow, side: THREE.BackSide }));
    throat.rotation.x = Math.PI / 2;
    throat.position.z = -0.5;
    const back = new THREE.Mesh(new THREE.CircleGeometry(R, 20), new THREE.MeshBasicMaterial({ color: 0x0b1f19 }));
    back.position.z = -1.15;
    ends.add(bell, lip, throat, back);
    g.add(ends);
  }
  // one badge, over the way in, clear of the tube's arch
  g.add(badge(pair, "down", mouth.x, mouth.y + R * 1.4 + 1.2, mouth.z));
  const ringMat = flat(C.ink);
  for (let k = 1; k < 6; k++) {
    const pt = path.getPoint(k / 6), tan = path.getTangent(k / 6);
    const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.06, 6, 16), ringMat);
    band.position.copy(pt);
    band.lookAt(pt.clone().add(tan));
    g.add(band);
  }
  state.tubes.set(z, path);
  return g;
}

/**
 * A seesaw (two timed slopes over one plank, pushing opposite ways in turn):
 * a long plank on a stone over the pond, rocking on the timed pieces' clock
 * (state.timed) to the chain's tilt: low at the end its push rolls a ball
 * toward. The ball rides it (state.lifts). Drawn once, by the first half.
 */
const SEESAW_TILT = 0.045; // radians either way: its low end just clears the bank
function seesaw(z: Zone, s: Hole, t: T, g: THREE.Group) {
  const pair = s.zones.filter((q) => q.skin === "seesaw" && q.min[0] === z.min[0] && q.min[1] === z.min[1]);
  if (pair[0] !== z) return g; // the other half: already drawn
  const alongX = Math.abs(z.vec[0]) >= Math.abs(z.vec[1]), k = alongX ? 0 : 1;
  const u0 = z.min[k], u1 = z.max[k], uc = (u0 + u1) / 2, w0 = z.min[1 - k], w1 = z.max[1 - k], wc = (w0 + w1) / 2;
  const L = u1 - u0 + 0.4, W = w1 - w0, TOP = 0.34, TH = 0.24;
  const P = (u: number, w: number): MutVec2 => (alongX ? [u, w] : [w, u]);
  const [cx, cz] = P(uc, wc), y0 = t.height(cx, cz);
  // (the pond carries on under the plank: terrain.ts sinks the ground there)
  // the stone it rocks on, standing in the water, up from the bed
  const bed = (t.ground || t.height)(cx, cz) - 0.1, sh = y0 + TOP - TH - bed;
  const block = drawn(rbox(1.1, sh, W * 0.9, 0.08), flat(0x9aa39e));
  block.position.set(cx, bed + sh / 2, cz);
  if (!alongX) block.rotation.y = Math.PI / 2;
  // the plank: boards across it, a rim each side, on a pivot at the stone
  const pivot = new THREE.Group();
  pivot.position.set(cx, y0 + TOP - TH / 2, cz);
  if (!alongX) pivot.rotation.y = -Math.PI / 2;
  const board = drawn(rbox(L, TH, W, 0.06), flat(C.wood));
  pivot.add(board);
  const seam = new THREE.LineBasicMaterial({ color: C.woodDark });
  const pts = [];
  for (let a = -L / 2 + 0.6; a < L / 2; a += 0.6) pts.push(new THREE.Vector3(a, TH / 2 + 0.005, -W / 2 + 0.05), new THREE.Vector3(a, TH / 2 + 0.005, W / 2 - 0.05));
  pivot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), seam));
  // painted ends, so the tilt reads from afar
  for (const sgn of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, W - 0.1), flat(sgn < 0 ? C.cap : C.sun));
    cap.position.set(sgn * (L / 2 - 0.35), TH / 2 + 0.01, 0);
    pivot.add(cap);
  }
  ud(pivot).live = true;
  g.add(block, pivot);
  // the clock: tipped down toward where the first half pushes, then the other way
  const every = (z.every ?? 0) | 0, onFor = (z.on ?? 0) | 0, phase = (z.phase ?? 0) | 0, down = Math.sign(z.vec[k]) || -1;
  let step = 0, ang = 0, last: number | null = null;
  state.timed.push({ at: (st) => (step = st) });
  animate((tt) => {
    const dt = last === null ? 0 : Math.min(0.1, tt - last);
    last = tt;
    const p = every ? mod(step + phase, every) : 0, first = !every || p < onFor;
    // +x end up when the first half pushes toward -x
    const want = (first ? -down : down) * SEESAW_TILT;
    ang += (want - ang) * Math.min(1, dt * 9);
    pivot.rotation.z = ang;
  });
  // the ball rides the plank's top, as it stands
  state.lifts.push((x, zz) => {
    const [u, w] = alongX ? [x, zz] : [zz, x];
    return u >= u0 && u < u1 && w >= w0 && w < w1 ? TOP + (u - uc) * Math.tan(alongX ? ang : -ang) : 0;
  });
  return g;
}

export { zoneDetail };
