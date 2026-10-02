// The Crystal Mines' zones (mines-pieces.ts asks here for every zone): the
// hazards sunk into the lane (lava in its basalt banks, the open shaft in its
// timber collar, the black sump, the boiling hot spring, the ore bin), the
// surfaces laid on it (rubble, ballast and its track, ore piles, drip pools,
// crystal ice, a floor of coins, the causeway's basalt columns), the hills
// (the conveyor belt, the man-way, the banked ledge, a kicker), the air (the
// steam vents and boosters on their clock, the magnetic vein), the set
// pieces told by a decor surface (the Heart, the frozen fall), the lava falls,
// and the ball's fall into each hazard.
//
// Organic, as the other worlds' ponds and bunkers: a zone's outline is
// zones.ts organic() (a round zone its ellipse, a plain rectangle rounded, a
// polygon as the chain has it), and every sheet laid on it is pulled onto
// that outline at its edge, never a staircase of cells.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flat, relief, share } from "./materials";
import { animate, state } from "./state";
import { seeded, type Rand } from "./common";
import { md, ud, type Hole } from "./data";
import { organic } from "./zones";
import { GAP_Y } from "./worlds";
import { bakeLocal } from "./bake";
import { MINES, crystalCluster, planks, drawnGround } from "./mines-kit";
import { waterMaterial } from "./mines-water";
import { lavaMaterial, FALLING, crustBy, bubbles } from "./mines-lava";
import { once, GOLD, GOLD_DARK, goldMat, gem, form, shared, plate, INK_THIN, inked, facets, knobbly, paint, strata, boulder, lumps, vnoise, halo, TIMBER, TIMBER_DARK, TIMBER_LIGHT, IRON, IRON_DARK, RUST, solid, tinted, deck, sightFade } from "./mines-toon";
import { inZone, inPoly, nearestOnPoly, segDist, smoothstep, mod, there, onAt, untilOn, boxOf } from "../terrain";
import { sound } from "../feel";
import type { Terrain } from "../terrain";
import type { MutVec2, Vec2, Zone } from "../types";
import type { FallIn } from "./worlds";

// ------------------------------------------------------------ outlines and sheets

/** A zone's outline as drawn: organic (rounded, a hair of wobble), its points on the board. */
export function outline(z: Zone, s: Hole): MutVec2[] {
  // (a surface's plain rectangle is a patch, rounded as a round zone is: the
  // physics' corners are no hazard, and a square reads as a decal)
  const round = z.kind === "surface" && !z.poly;
  // (a round hazard: its ellipse exactly, a hair inside — what looks like floor is floor)
  if (z.round && z.kind === "hazard") {
    const { cx, cz, hx, hz } = boxOf(z), n = Math.min(96, Math.max(28, Math.round((hx + hz) * 1.6)));
    return Array.from({ length: n }, (_, k): MutVec2 => [cx + Math.cos((k / n) * Math.PI * 2) * (hx - 0.03), cz + Math.sin((k / n) * Math.PI * 2) * (hz - 0.03)]);
  }
  const pts = organic({ ...z, outside: false, round: round || z.round }, seeded("mz" + s.hole + z.min.join() + z.skin), s.board).points;
  return pts.map(([x, y]): MutVec2 => [x, y]);
}
/** The distance from (x, z) to a closed outline. */
function edgeDist(x: number, z: number, pts: readonly Vec2[]) {
  let d = Infinity;
  for (let k = 0; k < pts.length; k++) d = Math.min(d, segDist(x, z, pts[k], pts[(k + 1) % pts.length]));
  return d;
}
/** The void round the lane (the world's): nothing of a zone is laid out over it. */
const voids = (s: Hole) => s.zones.filter((q) => q.skin === "void");
export const overVoid = (s: Hole, x: number, z: number) => voids(s).some((v) => inZone(v, x, z));
/** A point over the void, onto the lane's edge there (the void's outline); null if not over it. */
const offVoid = (s: Hole) => (x: number, z: number): MutVec2 | null => {
  const v = voids(s).find((q) => inZone(q, x, z));
  return v && v.poly && v.poly.length > 2 ? nearestOnPoly(x, z, v.poly) : null;
};
/** Whether (x, z) is in an untimed hazard of the hole (but `not`): a drop, a pool. */
export const inHazard = (s: Hole, x: number, z: number, not?: Zone) => s.zones.some((q) => q !== not && q.kind === "hazard" && !q.every && q.skin !== "void" && inZone(q, x, z));

/**
 * A sheet over a closed outline: a grid of `step` cells, those whose middle is
 * inside (and keep(x, z)) kept, their corners outside pulled onto the
 * outline — an edge that follows it, not the cells. y(x, z, d) gives each
 * vertex's height (d: how far in from the edge); col its colour. Returns
 * the geometry and each vertex's d (geo.userData.d).
 */
export function sheet(pts: readonly Vec2[], step: number, y: (x: number, z: number, d: number) => number, col?: (x: number, z: number, d: number, c: THREE.Color) => void, keep?: (x: number, z: number) => boolean, cells = 2500, snap?: (x: number, z: number) => MutVec2 | null) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
  // (a big zone in coarser cells: never many more than `cells` of them)
  step = Math.max(step, Math.sqrt(((x1 - x0) * (z1 - z0)) / cells));
  const nx = Math.max(2, Math.ceil((x1 - x0) / step)), nz = Math.max(2, Math.ceil((z1 - z0) / step));
  const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz, N = (nx + 1) * (nz + 1);
  const pos = new Float32Array(N * 3), cols = col ? new Float32Array(N * 3) : null, d = new Float32Array(N), c = new THREE.Color();
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      let x = x0 + i * sx, z = z0 + j * sz;
      if (!inPoly(x, z, pts)) [x, z] = nearestOnPoly(x, z, pts), (d[k] = 0);
      else d[k] = edgeDist(x, z, pts);
      // (a corner out where the sheet stops, the lane's edge over the void: onto that edge, not a cell's step)
      const sn = snap && snap(x, z);
      if (sn) ([x, z] = sn), (d[k] = 0);
      pos.set([x, y(x, z, d[k]), z], k * 3);
      if (col && cols) (col(x, z, d[k], c), cols.set([c.r, c.g, c.b], k * 3));
    }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const mx = x0 + (i + 0.5) * sx, mz = z0 + (j + 0.5) * sz;
      if (!inPoly(mx, mz, pts) || (keep && !keep(mx, mz))) continue;
      const a = j * (nx + 1) + i, b = a + 1, e = a + nx + 1, f = e + 1;
      idx.push(a, e, b, b, e, f);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (cols) geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.d = d;
  return geo;
}

/** Each outline point's outward normal (away from the inside). */
function normals(pts: readonly Vec2[]) {
  return pts.map((p, k) => {
    const a = pts[(k + pts.length - 1) % pts.length], b = pts[(k + 1) % pts.length];
    let nx = -(b[1] - a[1]), nz = b[0] - a[0];
    const l = Math.hypot(nx, nz) || 1;
    (nx /= l), (nz /= l);
    if (inPoly(p[0] + nx * 0.05, p[1] + nz * 0.05, pts)) (nx = -nx), (nz = -nz);
    return [nx, nz] as const;
  });
}

/**
 * A band along a closed outline: rows of points at offsets (along the
 * outward normal) and heights, [offset, y(x, z)] from the outside in, with a
 * colour per row. What a bank, a rim, a collar is made of. skip(x, z) drops
 * the pieces whose outer point is there (over the void).
 */
function band(pts: readonly Vec2[], rows: readonly (readonly [number, (x: number, z: number) => number, THREE.ColorRepresentation])[], skip?: (x: number, z: number) => boolean, jitter = 0, rand?: Rand) {
  const ns = normals(pts), n = pts.length, R = rows.length;
  const pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const [x, z] = pts[k], [nx, nz] = ns[k], wob = jitter && rand ? (rand() - 0.5) * jitter : 0;
    for (const [off, y, cc] of rows) {
      const px = x + nx * (off + (off > 0 ? wob : 0)), pz = z + nz * (off + (off > 0 ? wob : 0));
      pos.push(px, y(px, pz), pz);
      c.set(cc);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let k = 0; k < n; k++) {
    const q = (k + 1) % n, [x, z] = pts[k], [nx, nz] = ns[k];
    if (skip && skip(x + nx * rows[0][0], z + nz * rows[0][0])) continue;
    for (let r = 0; r + 1 < R; r++) {
      const a = k * R + r, b = q * R + r, e = a + 1, f = b + 1;
      idx.push(a, b, e, b, f, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Adds o to g when there is one (a shared system comes with its first piece only). */
const add = (g: THREE.Object3D, o: THREE.Object3D | null) => void (o && g.add(o));

/** Random spots inside an outline, at least `m` in from its edge, and keep(x, z). */
function spotsIn(pts: readonly Vec2[], n: number, m: number, rand: Rand, keep?: (x: number, z: number) => boolean) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
  const out: MutVec2[] = [];
  for (let k = 0; k < n * 12 && out.length < n; k++) {
    const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
    if (inPoly(x, z, pts) && edgeDist(x, z, pts) >= m && (!keep || keep(x, z))) out.push([x, z]);
  }
  return out;
}

// ------------------------------------------------------------ the sunk hazards
//
// The lane is cut open over them (worlds.ts open: its cells left out, rock
// down to their level); here, what is inside: a bank or a lining from the
// lane's edge down to it, its rim over the cut cells' steps, and the stuff
// itself.

/**
 * A sunk hazard's basins: its outline split by the lane's untimed walls that
 * cross it (a pool round a terrace's rock rib is a pool each side of it,
 * each ending against the rib with its own lip), each basin at its own
 * ground's height (base).
 */
function basins(z: Zone, t: Terrain, s: Hole) {
  let parts: MutVec2[][] = [outline(z, s)];
  const crossing = s.walls.filter((w) => !w.every && [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95].some((u) => inZone(z, w.a[0] + (w.b[0] - w.a[0]) * u, w.a[1] + (w.b[1] - w.a[1]) * u)));
  for (const w of crossing.slice(0, 6)) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, c = w.a[0] * nx + w.a[1] * nz;
    const next: MutVec2[][] = [];
    for (const p of parts) {
      // (only a part the wall runs right across is split: both its ends out of the part, its middle in it — a rib between two pools)
      const hits = !inPoly(w.a[0], w.a[1], p) && !inPoly(w.b[0], w.b[1], p) && inPoly((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2, p) && p.some(([x, zz]) => x * nx + zz * nz > c + 0.4) && p.some(([x, zz]) => x * nx + zz * nz < c - 0.4);
      if (!hits) { next.push(p); continue; }
      for (const sg of [1, -1]) {
        const q = halfPlane(p, nx * sg, nz * sg, c * sg + 0.3);
        if (q.length > 2 && Math.abs(areaOf(q)) > 0.4) next.push(q);
      }
    }
    parts = next;
  }
  // (a part out in the void or behind the lane's walls, where no ball goes, is not drawn: the world's ground is there)
  return parts.flatMap((pts) => {
    const inside = spotsIn(pts, 6, 0.2, seeded("b" + pts[0].join()));
    const lane = inside.filter(([x, zz]) => !overVoid(s, x, zz) && reachable(t, x, zz));
    if (inside.length && !lane.length) return [];
    const at = lane[0] || inside[0] || pts[0];
    return [{ pts, base: t.height(at[0], at[1]) }];
  });
}
/** Whether a ball can be at (x, z): the lane's cells (terrain.ts green), or a cell cut open over a hazard next to them. */
function reachable(t: Terrain, x: number, zz: number) {
  const i = Math.floor(x / 0.5), j = Math.floor(zz / 0.5);
  for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (t.inGrid(i + a, j + b) && t.green[t.idx(i + a, j + b)]) return true;
  return false;
}
/** A polygon clipped to the half-plane x·nx + z·nz ≥ c (Sutherland–Hodgman), its new edge densified so a rim follows it. */
function halfPlane(p: readonly Vec2[], nx: number, nz: number, c: number): MutVec2[] {
  const out: MutVec2[] = [], f = (q: Vec2) => q[0] * nx + q[1] * nz - c;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push([a[0], a[1]]);
    if (fa >= 0 !== fb >= 0) {
      const u = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
  }
  // the cut: points every 0.4 along it (a rim of rock needs them)
  const dense: MutVec2[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    dense.push(a);
    if (Math.abs(f(a)) < 1e-6 && Math.abs(f(b)) < 1e-6) {
      const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4);
      for (let k = 1; k < n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return dense;
}

/** The level a falling ball meets in each sunk hazard (relative to the lane at 0). */
const LEVEL: Record<string, number> = { lava: -0.38, shaft: GAP_Y + 0.3, sump: -1.05, "hot spring": -0.6, "ore bin": -0.75 };
// (and a rope bridge's span: the lane open under its deck, the deck the only surface there)
export const open = (z: Zone) => (z.kind === "hazard" && !z.every && !z.outside ? LEVEL[z.skin] : z.skin === "rope bridge" ? GAP_Y + 0.3 : undefined);

/** An outline with its long edges split every half unit or less (a band then stops where its skip starts, not a whole edge past it). */
const split = (pts: readonly Vec2[], step = 0.5) => pts.flatMap(([x, zz], k) => { const [x1, z1] = pts[(k + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(x1 - x, z1 - zz) / step)); return Array.from({ length: n }, (_, i): MutVec2 => [x + ((x1 - x) * i) / n, zz + ((z1 - zz) * i) / n]); });

/** A pit's lining: from the outline at the lane down to depth, in strata darkening to the bottom. */
function lining(pts: readonly Vec2[], t: Terrain, depth: number, skip?: (x: number, z: number) => boolean, dark = 0.35) {
  const geo = band(pts, [[0.06, (x, z) => drawnGround(t, x, z) + 0.035, 0xffffff], [-0.12, () => depth, 0xffffff]], skip); // (its top edge clear of the lane, under the rim that covers it)
  const p = geo.attributes.position, colr = geo.attributes.color, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    strata(y + 2, p.getX(i), p.getZ(i), 2, c).multiplyScalar(1 - (1 - dark) * Math.min(1, -y / 3));
    colr.setXYZ(i, c.r, c.g, c.b);
  }
  // seen from inside the pit: its faces turned in
  const idx = geo.index!.array as Uint32Array | Uint16Array, flip: number[] = [];
  for (let k = 0; k < idx.length; k += 3) flip.push(idx[k], idx[k + 2], idx[k + 1]);
  geo.setIndex(flip);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, relief(THREE.DoubleSide));
}

/** A rim of rock round a pit: over the lane's cut edge, rounded, lit on top; a hot one scorched, glowing down its inner face. */
function rim(pts: readonly Vec2[], t: Terrain, _rand: Rand, skip?: (x: number, z: number) => boolean, hot = false) {
  const foot = hot ? 0x6a5a66 : 0x5f5878, top = hot ? 0x5e4c58 : 0x736a8c, face = hot ? 0x7a3a2a : 0x4f4866, lip = hot ? 0xe0651e : 0x3a3450;
  const bump = (x: number, z: number) => 0.02 * (vnoise(x * 1.7, z * 1.7) - 0.5);
  const geo = band(pts, [
    [0.45, (x, z) => drawnGround(t, x, z) + 0.085, foot], // (its foot a hair over the lane's laid surfaces, up to 0.08: never through them)
    [0.26, (x, z) => drawnGround(t, x, z) + 0.1 + bump(x, z), top],
    [0.04, (x, z) => drawnGround(t, x, z) + 0.11 + bump(x, z), top],
    // (and straight down at the outline: nothing drawn as floor inside it)
    [-0.02, (x, z) => t.height(x, z) - 0.12, face],
    [-0.08, (x, z) => t.height(x, z) - 0.45, lip],
  ], skip);
  return new THREE.Mesh(geo, relief(THREE.DoubleSide));
}

/** Lava, sunk in its basalt banks: the crust thick along the shore, bubbles, rafts of crust drifting. */
function lava(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const g = new THREE.Group();
  for (const { pts, base } of basins(z, t, s)) g.add(lavaPool(pts, base + LEVEL.lava, t, s, rand, z));
  return g;
}
function lavaPool(pts: MutVec2[], level: number, t: Terrain, s: Hole, rand: Rand, z: Zone) {
  const g = new THREE.Group();
  // (the walls that cross it split it into basins: nothing hot drawn past them)
  const off = (x: number, zz: number) => overVoid(s, x, zz);
  // the lake: swelling a little as it flows (not a plate), crusting toward its shore
  // (where two lakes overlap, the one first in the hole's zones is the lake there: one sheet, not two)
  // (the other lakes as drawn: their outlines)
  const lakes = s.zones.filter((q) => q !== z && q.skin === "lava" && !q.every).map((q) => ({ first: s.zones.indexOf(q) < s.zones.indexOf(z), pts: outline(q, s) }));
  // (flat under its shore, swelling only past it: the shore's crust always over the melt, never through it)
  const bw = Math.min(1.3, 0.45 * Math.sqrt(Math.abs(areaOf(pts))) / 2);
  const geo = sheet(pts, 0.6, (x, zz, d) => level + 0.07 * vnoise(x * 0.6, zz * 0.6) * smoothstep((d - bw) / 1.2), undefined, (x, zz) => !off(x, zz) && !lakes.some((l) => l.first && inPoly(x, zz, l.pts)), 800, offVoid(s));
  const d = geo.userData.d as Float32Array;
  crustBy(geo, () => 0);
  const crust = geo.attributes.lavaCrust as THREE.BufferAttribute;
  for (let i = 0; i < crust.count; i++) crust.setX(i, 1 - smoothstep(d[i] / 1.4));
  g.add(new THREE.Mesh(geo, lavaMaterial()));
  // its shore: a raised crust along the bank, lumpy, all cooled plates and
  // glowing cracks, standing proud of the lake with its edge aglow
  const lump = (x: number, zz: number, k: number) => level + k * (0.5 + 0.8 * vnoise(x * 1.9, zz * 1.9));
  // (its long edges split, so the bank stops where it meets the pit and not a whole edge past it)
  const fine = split(pts, 1); // (a unit: its bands' triangles stay few)
  // (as wide as the basin allows, bw: a thin one's shore would cross itself)
  // (no shore where it runs into another lava's lake: lava there, one sheet of it)
  const shore = band(fine, [[-0.3 * bw, (x, zz) => lump(x, zz, 0.3), 0], [-0.58 * bw, (x, zz) => lump(x, zz, 0.26), 0], [-0.8 * bw, (x, zz) => lump(x, zz, 0.12), 0], [-bw, () => level + 0.02, 0]], (x, zz) => off(x, zz) || lakes.some((l) => inPoly(x, zz, l.pts) || edgeDist(x, zz, l.pts) < bw + 0.3));
  crustBy(shore, () => 1);
  const sc = shore.attributes.lavaCrust as THREE.BufferAttribute;
  for (let i = 0; i < sc.count; i++) if (i % 4 === 3) sc.setX(i, 0.45); // its lake edge: crust breaking up
  g.add(new THREE.Mesh(shore, lavaMaterial()));
  // the banks: basalt from the lane's edge down into the lava, scorched, the
  // last of it glowing where the lava licks it (none through another pit it runs into: a hot spring's water)
  // (no bank through another pit, nor under a causeway's stones laid across it)
  const pits = s.zones.filter((q) => (q.skin !== "lava" && open(q) != null) || q.skin === "causeway").map((q) => ({ q, o: outline(q, s) }));
  const bank = (x: number, zz: number) => off(x, zz) || pits.some(({ q, o }) => inZone(q, x, zz) || edgeDist(x, zz, o) < 0.6); // (and none within a rim's width of it: one rim there, the other pit's)
  g.add(lining(fine, t, level - 0.05, bank, 0.5));
  g.add(rim(fine, t, rand, bank, true));
  // a line of ember light where the lava meets its bank
  const glow = band(pts, [[-0.02, () => level + 0.03, 0xff7a2a], [-0.5, () => level + 0.01, 0x000000]], off);
  g.add(new THREE.Mesh(glow, once("lava lip glow", () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))));
  // bubbles, and rafts of cooler crust on the flow
  const inner = spotsIn(pts, Math.min(9, 2 + Math.round(Math.abs(areaOf(pts)) / 8)), 0.9, rand, (x, zz) => !off(x, zz));
  add(g, bubbles(t, inner.map(([x, zz]) => new THREE.Vector3(x, level + 0.01, zz)), rand));
  // cooled lumps: rafts of crust afloat, and boulders half sunk by the shore
  const rafts = spotsIn(pts, Math.min(14, 3 + Math.round(Math.abs(areaOf(pts)) / 7)), 1.1, rand, (x, zz) => !off(x, zz));
  for (const [x, zz] of rafts) {
    const r = boulder(rand, 0.4 + rand() * 0.5, 0.18 + rand() * 0.14, 0.35 + rand() * 0.4, 0);
    paint((r.children[0] as THREE.Mesh).geometry, (_x, y, _z, c) => c.set(y > 0.06 ? 0x3b2a2a : y > -0.02 ? 0x5a2a1c : 0xc2461a)); // cooled on top, glowing where it sits in the melt
    // (still: the flow under them moves; they are merged with the hole)
    r.position.set(x, level + 0.02, zz);
    r.rotation.y = rand() * 6;
    g.add(r);
  }
  const ns = normals(pts);
  for (let k = 0; k < pts.length; k += 5) {
    const [x, zz] = pts[k], [nx, nz] = ns[k];
    if (off(x, zz) || rand() < 0.4) continue;
    const r = boulder(rand, 0.3 + rand() * 0.3, 0.25, 0.3 + rand() * 0.25, 0);
    paint((r.children[0] as THREE.Mesh).geometry, (_x, y, _z, c) => c.set(y > 0.05 ? 0x3b2a2a : 0x9a3414));
    r.position.set(x - nx * 0.5, level + 0.05, zz - nz * 0.5);
    r.rotation.y = rand() * 6;
    g.add(r);
  }
  return g;
}
const areaOf = (pts: readonly Vec2[]) => pts.reduce((a, p, k) => { const q = pts[(k + 1) % pts.length]; return a + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);

/** The open shaft: a timber collar round its mouth, cribbing down its sides into the dark, a ladder, nothing at the bottom. */
function shaft(z: Zone, t: Terrain, s: Hole, _rand: Rand) {
  // (nothing of it laid where another hazard is: a bite out of the ledge, a pit beside it)
  const g = new THREE.Group(), pts = outline(z, s), off = (x: number, zz: number) => overVoid(s, x, zz) || inHazard(s, x, zz, z);
  const depth = GAP_Y - 1;
  g.add(lining(pts, t, depth, off, 0.05));
  // the dark at the bottom: the shaft goes on
  const floor = sheet(pts, 2, () => depth + 0.2);
  g.add(tinted(floor, MINES.void));
  // cribbing: timber rings round the sides every metre and a half, going
  // into the dark (darker as they go down)
  const ns = normals(pts), rings: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const y = -0.55 - k * 1.5, dark = 1 - k * 0.22;
    for (let i = 0; i < pts.length; i += 2) {
      const a = pts[i], b = pts[(i + 2) % pts.length], [nx, nz] = ns[i];
      if (off(a[0], a[1])) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      const geo = new THREE.BoxGeometry(len + 0.1, 0.22, 0.2).rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])).translate((a[0] + b[0]) / 2 - nx * 0.08, y, (a[1] + b[1]) / 2 - nz * 0.08);
      paint(geo, (_x, _y, _z, c) => c.set(TIMBER_DARK).multiplyScalar(dark));
      rings.push(geo);
    }
  }
  if (rings.length) g.add(new THREE.Mesh(mergeGeometries(rings), relief()));
  // the collar: planks laid flush round the mouth, a timber sill at its edge
  // (flat where the ball rolls: it is the lane's own level)
  // (0.055 over the ground as drawn: over the paving laid round it (0.04); an incline's boards stop short of it)
  // (the kit's boards, one way across the ring round the mouth: every deck of the mines one way)
  const ring = pts.map(([x, zz], k): MutVec2 => [x + ns[k][0] * 0.42, zz + ns[k][1] * 0.42]);
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const [x, zz] of ring) (bx0 = Math.min(bx0, x)), (bz0 = Math.min(bz0, zz)), (bx1 = Math.max(bx1, x)), (bz1 = Math.max(bz1, zz));
  g.add(planks([{ inside: (x, zz) => inPoly(x, zz, ring) && !inPoly(x, zz, pts) && edgeDist(x, zz, pts) > 0.03 && !off(x, zz), top: (x, zz) => drawnGround(t, x, zz) + 0.055, box: [bx0, bz0, bx1, bz1], angle: 0 }], seeded("collar" + z.min.join() + z.max.join()), { width: 0.34 }));
  // its lip: a dark timber edge down into the mouth (round a finely split outline: no slivers across it)
  const lip = band(split(pts, 0.3), [[0.06, (x, zz) => drawnGround(t, x, zz) + 0.05, TIMBER_DARK], [0.0, (x, zz) => t.height(x, zz) - 0.1, TIMBER_DARK], [-0.05, (x, zz) => t.height(x, zz) - 0.75, TIMBER_DARK]], off);
  g.add(new THREE.Mesh(lip, relief(THREE.DoubleSide)));
  // a ladder down one side, into the dark
  const [lx, lz] = pts[Math.floor(pts.length * 0.3)], [nx, nz] = ns[Math.floor(pts.length * 0.3)];
  if (!off(lx, lz)) {
    const parts: THREE.BufferGeometry[] = [];
    for (const sd of [-0.28, 0.28]) parts.push(new THREE.BoxGeometry(0.08, 6, 0.08).translate(sd, -3, 0));
    for (let k = 0; k < 14; k++) parts.push(new THREE.BoxGeometry(0.6, 0.05, 0.06).translate(0, -0.05 - k * 0.42, 0));
    const ladder = solid(mergeGeometries(parts), TIMBER_DARK);
    ladder.position.set(lx - nx * 0.25, t.height(lx, lz) - 0.65, lz - nz * 0.25); // (its top down in the mouth, well under the collar's lip: nothing of it near the lane's level over the drop)
    ladder.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
    ladder.rotation.x = 0.08;
    g.add(ladder);
  }
  return g;
}

/** Cave water in a pit: black and still, a cold sheen, drips falling into it from the vault and their rings. */
/** Cave water over an outline (the world's one water, mines-water.ts): its depth, from 0 at the rim, given to the shader per vertex. */
// (all the hole's pools one mesh, one material: each pool's sheet added to it as it is built)
function pitWater(t: Terrain, pts: readonly Vec2[], level: number, off: (x: number, z: number) => boolean, deep = 1.2, mud: boolean | "milk" = false): THREE.Object3D | null {
  const geo = sheet(pts, 0.9, () => level, undefined, (x, z) => !off(x, z), 600);
  const d = geo.userData.d as Float32Array;
  geo.setAttribute("wDepth", new THREE.BufferAttribute(d.map((v) => Math.min(deep, v)), 1));
  geo.setAttribute("wMud", new THREE.BufferAttribute(new Float32Array(d.length).fill(mud === "milk" ? -1 : mud ? 1 : 0), 1)); // (a puddle over mud, 1; a hot spring's milky water, -1: mines-water)
  const { sys, first } = shared(t, "water", () => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), waterMaterial(null).material);
    ud(m).live = true;
    return { root: m, parts: [] as THREE.BufferGeometry[] };
  });
  sys.parts.push(geo.index ? geo.toNonIndexed() : geo);
  const old = sys.root.geometry;
  sys.root.geometry = mergeGeometries(sys.parts.map((q) => { q.deleteAttribute("normal"); return q; }));
  sys.root.geometry.computeVertexNormals();
  old.dispose();
  return first ? sys.root : null;
}
/**
 * Drips falling from the vault at the spots, each landing in a ring (gate:
 * whether they fall now): one system for the hole's drips (shared), the
 * first caller gets its group, the others null.
 */
function drips(build: object, spots: readonly THREE.Vector3[], rand: Rand, color = 0xbfeaff, gate?: () => boolean): THREE.Object3D | null {
  const { sys, first } = shared(build, "drips", dripSystem);
  const c = new THREE.Color(color);
  for (const at of spots) sys.list.push({ at, T: 2.5 + rand() * 3, ph: rand() * 5, c, gate });
  return first ? sys.root : null;
}
const CAP = 96;
function dripSystem() {
  const root = new THREE.Group();
  ud(root).live = true;
  const drop = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4).scale(1, 1.8, 1), once("drip", () => flat(0xffffff, { emissive: 0x3f7fa0, emissiveIntensity: 0.5 })), CAP);
  const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.025, 3, 14).rotateX(Math.PI / 2), once("drip ring", () => new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.6, depthWrite: false })), CAP);
  drop.frustumCulled = ring.frustumCulled = false;
  root.add(drop, ring);
  const list: { at: THREE.Vector3; T: number; ph: number; c: THREE.Color; gate?: () => boolean }[] = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  let coloured = 0;
  animate((tt) => {
    const n = Math.min(CAP, list.length);
    drop.count = ring.count = n;
    for (; coloured < n; coloured++) drop.setColorAt(coloured, list[coloured].c);
    if (drop.instanceColor) drop.instanceColor.needsUpdate = true;
    for (let i = 0; i < n; i++) {
      const L = list[i], at = L.at, k = ((tt + L.ph) % L.T) / L.T, on = !L.gate || L.gate();
      // falls over the first third, then its ring spreads and fades
      drop.setMatrixAt(i, on && k < 0.3 ? M.compose(P.copy(at).setY(at.y + 7 * (1 - (k / 0.3) ** 2)), Q, S.set(1, 1, 1)) : hide);
      const r = (k - 0.3) / 0.5;
      ring.setMatrixAt(i, on && r > 0 && r < 1 ? M.compose(P.copy(at).setY(at.y + 0.01), Q, S.set(0.1 + r * 0.8, 1, 0.1 + r * 0.8)) : hide);
    }
    drop.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = true;
  });
  return { root, list };
}

/** The sump: a flooded winze, black water in its rock, drips ringing it. */
function sump(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const g = new THREE.Group();
  for (const { pts, base } of basins(z, t, s)) g.add(sumpPool(pts, base + LEVEL.sump, t, s, rand));
  return g;
}
function sumpPool(pts: MutVec2[], level: number, t: Terrain, s: Hole, rand: Rand) {
  const g = new THREE.Group(), off = (x: number, zz: number) => overVoid(s, x, zz) || !reachable(t, x, zz);
  g.add(lining(pts, t, level - 0.8, off, 0.3), rim(pts, t, rand, off));
  add(g, pitWater(t, pts, level, off, 1.6));
  add(g, drips(t, spotsIn(pts, 3, 0.5, rand).map(([x, zz]) => new THREE.Vector3(x, level, zz)), rand));
  return g;
}

/** Steam rising from spots: soft puffs swelling and thinning as they climb (gate: how much now, 0..1), one system a hole (shared: the first caller gets its group). */
export function steam(build: object, spots: readonly THREE.Vector3[], rand: Rand, { rise = 2.2, size = 0.5, period = 3, gate }: { rise?: number; size?: number; period?: number; gate?: () => number } = {}): THREE.Object3D | null {
  const { sys, first } = shared(build, "steam", steamSystem);
  for (const at of spots) for (let k = 0; k < 4; k++) sys.list.push({ at, ph: rand(), rise, size, period, gate });
  return first ? sys.root : null;
}
/** A puff that moves its own way: sets where it is at time tt, returns its size. */
type Place = (tt: number, at: THREE.Vector3) => number;
/** Puffs that move their own way in the hole's one steam system (the vents' blowing along their push). */
function puffs(build: object, places: readonly Place[]): THREE.Object3D | null {
  const { sys, first } = shared(build, "steam", steamSystem);
  for (const place of places) sys.list.push({ at: new THREE.Vector3(), ph: 0, rise: 0, size: 0, period: 1, place });
  return first ? sys.root : null;
}
function steamSystem() {
  const root = new THREE.Group();
  ud(root).live = true;
  // (toon steam: pale billows in the flat bands, see-through a little, behind what stands in front of them — not
  // a glow smeared on the floor; a puff thins out by shrinking away, one draw)
  const mat = once("steam", () => new THREE.MeshToonMaterial({ color: 0xe4eaf0, transparent: true, opacity: 0.82, depthWrite: false }));
  const CAPS = 256, puff = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, CAPS);
  puff.frustumCulled = false;
  root.add(puff);
  const list: { at: THREE.Vector3; ph: number; rise: number; size: number; period: number; gate?: () => number; place?: Place }[] = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  animate((tt) => {
    const n = Math.min(CAPS, list.length);
    puff.count = n;
    for (let i = 0; i < n; i++) {
      const L = list[i];
      if (L.place) { puff.setMatrixAt(i, M.compose(P, Q, S.setScalar(Math.max(0, L.place(tt, P))))); continue; }
      const at = L.at, k = (tt / L.period + L.ph) % 1, on = L.gate ? L.gate() : 1;
      const r = L.size * (0.3 + k * 0.9) * (1 - k) ** 0.6 * 1.6 * on;
      M.compose(P.set(at.x + Math.sin(L.ph * 9 + k * 3) * 0.3 * k, at.y + k * L.rise, at.z + Math.cos(L.ph * 7 + k * 2) * 0.3 * k), Q, S.setScalar(Math.max(0, r)));
      puff.setMatrixAt(i, M);
    }
    puff.instanceMatrix.needsUpdate = true;
    puff.boundingSphere = null; // (where they are now, for a ray: the probes' whatAt)
  });
  return { root, list };
}

/** A hot spring: milky turquoise water boiling in its sinter rim round a geyser pad, steam off it. */
function hotSpring(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const g = new THREE.Group();
  for (const { pts, base } of basins(z, t, s)) g.add(springPool(pts, base + LEVEL["hot spring"], t, s, rand));
  return g;
}
function springPool(pts: MutVec2[], pit: number, t: Terrain, s: Hole, rand: Rand) {
  // (its water up to near the lip, over the pit the ball falls into)
  const g = new THREE.Group(), off = (x: number, zz: number) => overVoid(s, x, zz) || !reachable(t, x, zz), level = pit + 0.38;
  g.add(lining(pts, t, level - 0.6, off, 0.6));
  // a sinter rim: pale mineral crust, rust-orange where the water runs over it
  // (its rows inward no wider than the pool allows: a small one's rim would fold over itself)
  const inw = Math.min(0.42, 0.3 * Math.sqrt(Math.abs(areaOf(pts))) / 2);
  const geo = band(pts, [
    [0.4, (x, zz) => drawnGround(t, x, zz) + 0.012, 0xd9c9a6],
    [0.15, (x, zz) => t.height(x, zz) + 0.1, 0xefe3c6],
    [-0.35 * inw, (x, zz) => t.height(x, zz) + 0.04, 0xc98a4a],
    [-inw, () => level + 0.02, 0x8a5a3a],
  ], off, 0.1, rand);
  g.add(new THREE.Mesh(geo, relief(THREE.DoubleSide)));
  add(g, pitWater(t, pts, level, off, 0.6, "milk"));
  // the boil: bubbles breaking white, and steam
  const inner = spotsIn(pts, 6, 0.4, rand);
  add(g, bubbles(t, inner.map(([x, zz]) => new THREE.Vector3(x, level, zz)), rand, true));
  add(g, steam(t, inner.slice(0, 2).map(([x, zz]) => new THREE.Vector3(x, level, zz)), rand, { rise: 2.6, size: 0.45, period: 3.5 }));
  return g;
}

/** An ore bin under a stamp: a tub of staves bound in iron, sunk in the floor, full of crushed ore. */
function oreBin(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const g = new THREE.Group(), pts = outline(z, s), level = LEVEL["ore bin"], ns = normals(pts);
  // staves round its sides, from the floor's edge down into it
  const staves: THREE.BufferGeometry[] = [];
  for (let k = 0; k < pts.length; k += 3) {
    const [x, zz] = pts[k], [nx, nz] = ns[k], b = pts[(k + 3) % pts.length], w = Math.hypot(b[0] - x, b[1] - zz) + 0.04;
    const geo = new THREE.BoxGeometry(w, 1.1, 0.1).rotateY(-Math.atan2(b[1] - zz, b[0] - x)).translate((x + b[0]) / 2 - nx * 0.05, t.height(x, zz) - 0.45, (zz + b[1]) / 2 - nz * 0.05);
    const tone = [TIMBER, TIMBER_DARK, TIMBER_LIGHT][k % 3];
    paint(geo, (_x, y, _z, c) => c.set(tone).multiplyScalar(0.6 + 0.4 * Math.max(0, y + 1)));
    staves.push(geo);
  }
  g.add(inked(mergeGeometries(staves), relief(THREE.DoubleSide), INK_THIN));
  // its rim: a timber sill with an iron hoop
  // (a low sill: the lane runs to the bin's edge, nothing raised on it the ball would roll over)
  const sill = band(pts, [[0.3, (x, zz) => drawnGround(t, x, zz) + 0.075, TIMBER_DARK], [0.12, (x, zz) => drawnGround(t, x, zz) + 0.095, TIMBER], [-0.08, (x, zz) => drawnGround(t, x, zz) + 0.085, TIMBER_LIGHT], [-0.14, (x, zz) => t.height(x, zz) - 0.05, TIMBER_DARK]]);
  g.add(new THREE.Mesh(sill, relief(THREE.DoubleSide)));
  const hoop = band(pts, [[0.31, (x, zz) => drawnGround(t, x, zz) + 0.02, IRON_DARK], [0.31, (x, zz) => drawnGround(t, x, zz) + 0.05, IRON_DARK]]);
  g.add(new THREE.Mesh(hoop, relief(THREE.DoubleSide)));
  // the ore heaped in it: lumps, a glint of crystal in the rock
  const ore = sheet(pts, 0.5, (x, zz, d) => level + 0.25 * smoothstep(d / 0.8) + 0.06 * lumps(x * 3, 0, zz * 3), (x, zz, _d, c) => c.set(lumps(x * 5, 1, zz * 5) > 0.2 ? 0x6b5f78 : 0x4a4058));
  g.add(new THREE.Mesh(ore, relief()));
  const chunks: THREE.BufferGeometry[] = [];
  for (const [x, zz] of spotsIn(pts, 10, 0.25, rand)) {
    const r = 0.1 + rand() * 0.12;
    chunks.push(new THREE.DodecahedronGeometry(r, 0).translate(x, level + 0.22 + r * 0.3, zz));
  }
  if (chunks.length) g.add(solid(mergeGeometries(chunks), 0x7a6e8c));
  for (const [x, zz] of spotsIn(pts, 3, 0.4, rand)) {
    const c = crystalCluster(rand, 0.35, undefined, 3);
    c.position.set(x, level + 0.2, zz);
    g.add(c);
  }
  return g;
}

// ------------------------------------------------------------ surfaces
//
// Laid on the lane over their outline, a hair over it (the shared polygon
// offset keeps them from shimmering), each with its own 3D stuff on top.
// the worlds' toon over the patch's own colours, crisp (its edge inked, not faded into the lane)
// what a patch is laid in: the worlds' toon over its colour, and over that,
// drawn in the fragment (crisp at any distance, anti-aliased, no texture): a
// ground of clumps and grains — cells of the floor each a shade of their own
// with a dark seam between them, and fine grit — so ore dirt, scree, ballast
// read as stuff, not as a smear
let laidMat: THREE.MeshToonMaterial | null = null;
const laid = () => {
  if (laidMat) return laidMat;
  const m = share(flat(0xffffff, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = "varying vec3 vLaidW;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vLaidW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = `varying vec3 vLaidW;
float ldH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
` + sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    // clumps: the nearest two cell points (their gap a seam), the clump's own shade
    vec2 p = vLaidW.xz * 3.2, i = floor(p), f = fract(p);
    float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = vec2(ldH(i + g), ldH(i + g + 7.3));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = ldH(i + g + 3.1); } else if (d < d2) d2 = d;
    }
    float seam = d2 - d1, w = fwidth(seam) + 1e-4;
    float shade = 0.84 + 0.26 * id;
    shade *= mix(0.62, 1.0, smoothstep(0.06 - w, 0.06 + w, seam));
    // grit: fine specks, lighter
    float gr = ldH(floor(vLaidW.xz * 18.0));
    shade *= gr > 0.93 ? 1.18 : 1.0;
    diffuseColor.rgb *= shade;
  }`,
    );
  };
  m.customProgramCacheKey = () => "mines-laid";
  md(m).hook = "mines-laid";
  return (laidMat = m);
};

/** The ink along an outline where it is on the lane, a hair over it. */
function edgeInk(pts: readonly Vec2[], t: Terrain, s: Hole, lift = 0.05) {
  const segs: THREE.Vector3[] = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    if (!t.onGreen(a[0], a[1]) || !t.onGreen(b[0], b[1]) || overVoid(s, a[0], a[1]) || overVoid(s, b[0], b[1])) continue;
    segs.push(new THREE.Vector3(a[0], t.height(a[0], a[1]) + lift, a[1]), new THREE.Vector3(b[0], t.height(b[0], b[1]) + lift, b[1]));
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), inkLine);
}
const inkLine = share(new THREE.LineBasicMaterial({ color: MINES.ink }));

/** The patches laid in a hole, each its height over the ground as drawn. */
const patched = new WeakMap<Hole, Map<Zone, number>>();

/** A patch over the outline, on the lane (not over the void), coloured by col, lifted by lift at its middle. */
function patch(z: Zone, t: Terrain, s: Hole, col: (x: number, z: number, d: number, c: THREE.Color) => void, lift: (x: number, z: number, d: number) => number = () => 0, cells = 2500) {
  // (a hair past its outline: two patches that meet overlap, each at its own height, no ground showing between them in teeth)
  const edge = outline(z, s), ns = normals(edge), pts = edge.map(([x, zz], k): MutVec2 => [x + ns[k][0] * 0.15, zz + ns[k][1] * 0.15]);
  // (nor over a sunk hazard, a shaft, lava: where the ball falls nothing is laid)
  const sunk = s.zones.filter((q) => q !== z && open(q) != null);
  // (each patch at its own height, its lift with it, 0.025 apart from any other laid before it that it overlaps — and
  // so 0.01 from that one's edge ink, 0.015 over it; 0.04 up at least: clear of the lane's own coarser triangles on its
  // slopes, and 0.02 over the world's edging laid at 0.02)
  const bases = patched.get(s) ?? patched.set(s, new Map()).get(s)!, up = lift(boxOf(z).cx, boxOf(z).cz, 0);
  if (!bases.has(z)) {
    const near = [...bases].filter(([q]) => q.min[0] < z.max[0] + 0.3 && z.min[0] < q.max[0] + 0.3 && q.min[1] < z.max[1] + 0.3 && z.min[1] < q.max[1] + 0.3).map(([, b]) => b);
    const b = [0, 1, 2].map((k) => 0.04 + up + 0.025 * k).find((b) => near.every((q) => Math.abs(b - q) >= 0.025 - 1e-6));
    bases.set(z, b ?? 0.04 + up);
  }
  const own = bases.get(z)! - up;
  // (its corners that fall in the void or a sunk hazard pulled onto its edge: the patch ends along the drop, not in steps)
  // (a shaft's collar ring, 0.42 round its mouth, left to the collar's planks: the paving ends at its outer edge)
  const grow = (o: MutVec2[], d: number) => { const n = normals(o); return o.map(([x, zz], k): MutVec2 => [x + n[k][0] * d, zz + n[k][1] * d]); };
  const sunkOut = sunk.map((q) => ({ q, o: q.skin === "shaft" ? grow(outline(q, s), 0.42) : outline(q, s) })), void0 = offVoid(s);
  const snap = (x: number, zz: number): MutVec2 | null => { const v = void0(x, zz); if (v) return v; const k = sunkOut.find(({ o }) => inPoly(x, zz, o)); return k ? nearestOnPoly(x, zz, k.o) : null; };
  const geo = sheet(pts, 0.35, (x, zz, d) => drawnGround(t, x, zz) + own + lift(x, zz, d), col, (x, zz) => !overVoid(s, x, zz) && t.onGreen(x, zz) && Math.hypot(x - s.cup[0], zz - s.cup[1]) > 1.6 && !sunkOut.some(({ o }) => inPoly(x, zz, o) && edgeDist(x, zz, o) > 0.5), cells, snap); // (nothing laid over the cup's rings; a cell across a sunk hazard's edge kept, its corners in it pulled onto the edge: the paving ends exactly on the lip)
  const mesh = new THREE.Group();
  mesh.add(new THREE.Mesh(geo, laid()), edgeInk(pts, t, s, own + 0.015 + lift(pts[0][0], pts[0][1], 0)));
  return { mesh, pts };
}

/** Stones scattered over spots: lumpy, in strata, merged. */
function stones(spots: readonly Vec2[], t: Terrain, rand: Rand, r0: number, r1: number, color?: number) {
  const geos: THREE.BufferGeometry[] = [];
  for (const [x, zz] of spots) {
    const r = r0 + rand() * (r1 - r0), geo = knobbly(new THREE.IcosahedronGeometry(1, 0), rand, 0.18);
    // (sat on the paving laid under them, 0.04 up: a hair more of each over it)
    geo.scale(r, r * (0.5 + rand() * 0.3), r * (0.8 + rand() * 0.4)).rotateY(rand() * 6).translate(x, t.height(x, zz) + 0.01 + r * 0.25, zz);
    // (each stone a tone and a hint of hue of its own: not one grey, not all in one band)
    const seed = rand() * 9, tone = 0.85 + rand() * 0.3, hue = (rand() - 0.5) * 0.04, lift = rand() * 1.6;
    paint(geo, (px, y, pz, c) => ((color ? c.set(color).multiplyScalar(0.8 + 0.3 * (y - t.height(x, zz)) / r) : strata(y + 1 + lift, px, pz, 2, c, seed)), c.multiplyScalar(tone).offsetHSL(hue, 0, 0)));
    geos.push(geo.toNonIndexed());
  }
  if (!geos.length) return new THREE.Group();
  const m = mergeGeometries(geos);
  m.computeVertexNormals();
  return inked(m, relief(), INK_THIN);
}

/** Rubble: scree over the floor, grey-violet grit thinning at its edge, stones of every size in strata on it. */
function rubble(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const grit = [0x837a98, 0x71688a, 0x8c7c6c].map((c) => new THREE.Color(c));
  const { mesh, pts } = patch(z, t, s, (_x, _zz, d, c) => c.copy(grit[0]).lerp(grit[1], 0.5 * (1 - smoothstep(d / 0.5))), () => 0);
  const g = new THREE.Group();
  g.add(mesh);
  const ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz);
  const a = Math.abs(areaOf(pts));
  // (flat where the ball rolls: grit over it, the bigger stones heaped at its rim)
  g.add(stones(spotsIn(pts, Math.min(90, Math.round(a * 0.45)), 0.1, rand, ok), t, rand, 0.05, 0.09));
  const rimAt = pts.filter((_, k) => k % 3 === 0).filter(([x, zz]) => ok(x, zz));
  g.add(stones(rimAt, t, rand, 0.08, 0.13));
  return g;
}

/** An ore pile: a low heap of crushed ore, dark and glinting, lumps and nuggets of copper and gold on it. */
function orePile(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const ores = [0x9a7a5a, 0x8a6a4c, 0xa88a62].map((c) => new THREE.Color(c));
  const { mesh, pts } = patch(z, t, s, (_x, _zz, d, c) => c.copy(ores[0]).lerp(ores[1], 0.6 * (1 - smoothstep(d / 0.5))), () => 0);
  const g = new THREE.Group();
  g.add(mesh);
  const ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz);
  // lumps of ore heaped at its rim (a pile's edge), fewer on the flat where the ball rolls
  const lumpsAt = pts.filter((_, k) => k % 2 === 0).filter(([x, zz]) => ok(x, zz));
  const geos: THREE.BufferGeometry[] = [], gold: THREE.BufferGeometry[] = [];
  for (const [x, zz] of lumpsAt) {
    // (low and half sunk: the ball rolls over its rim too, their tops under 0.1 over the lane)
    const r = 0.07 + rand() * 0.06, y = drawnGround(t, x, zz) + 0.01;
    const geo = new THREE.DodecahedronGeometry(r, 0).scale(1, 0.55, 1).rotateY(rand() * 6).translate(x, y, zz);
    (rand() < 0.22 ? gold : geos).push(geo);
  }
  if (geos.length) g.add(solid(mergeGeometries(geos), 0x8a6e52));
  if (gold.length) g.add(new THREE.Mesh(paint(mergeGeometries(gold), (_x, y, _z, c) => c.set(y > 0.05 ? GOLD : GOLD_DARK)), goldMat()));
  return g;
}

/** Ballast: a bed of grey stone chips; where it lies along a track, sleepers across it and the rails on them. */
function ballast(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const { mesh, pts } = patch(z, t, s, (_x, _zz, _d, c) => c.set(0x6e6978));
  const g = new THREE.Group();
  g.add(mesh);
  const ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz);
  g.add(stones(spotsIn(pts, Math.round(Math.abs(areaOf(pts)) * 0.8), 0.1, rand, ok), t, rand, 0.04, 0.07, 0x7d7888));
  // a bed longer than wide is a track's: sleepers across, two rails along
  const { w, h, cx, cz } = boxOf(z);
  if (!z.poly && Math.max(w, h) > 2.5 * Math.min(w, h)) {
    const along = w >= h, L = Math.max(w, h), gauge = Math.min(1.1, Math.min(w, h) * 0.32);
    const sleepers: THREE.BufferGeometry[] = [];
    for (let u = -L / 2 + 0.5; u <= L / 2 - 0.4; u += 0.75) {
      const x = along ? cx + u : cx, zz = along ? cz : cz + u;
      if (!ok(x, zz)) continue;
      // (flush with the bed: the ball rolls over them)
      const geo = new THREE.BoxGeometry(along ? 0.28 : gauge * 2 + 0.6, 0.06, along ? gauge * 2 + 0.6 : 0.28).translate(x, t.height(x, zz) + 0.03, zz);
      paint(geo, (_x, y, _z, c) => c.set(TIMBER_DARK).multiplyScalar(0.8 + 1.5 * (y - t.height(x, zz))));
      sleepers.push(geo);
    }
    if (sleepers.length) g.add(inked(mergeGeometries(sleepers), relief(), INK_THIN));
    for (const sd of [-gauge, gauge]) {
      // (let into the bed, their heads flush, as a crossing's rails: a rail's own I, foot, web and head, not a bar)
      const sh = new THREE.Shape([[-0.06, 0], [0.06, 0], [0.06, 0.02], [0.015, 0.035], [0.015, 0.065], [0.035, 0.07], [0.035, 0.095], [-0.035, 0.095], [-0.035, 0.07], [-0.015, 0.065], [-0.015, 0.035], [-0.06, 0.02]].map(([a, b]) => new THREE.Vector2(a, b)));
      const len = L - 0.6, geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2);
      if (along) geo.rotateY(Math.PI / 2);
      paint(geo, (_x, y, _z, c) => c.set(y > 0.07 ? 0xb8bec9 : 0x7a808e));
      const r = inked(geo, relief(), INK_THIN);
      r.position.set(along ? cx : cx + sd, t.height(cx, cz) - 0.005, along ? cz + sd : cz);
      g.add(r);
    }
  }
  return g;
}

/** A drip pool: a shallow pool on the floor, pale at its rim of flowstone, drips ringing it. */
function dripPool(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const pts = outline(z, s), g = new THREE.Group(), ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz);
  // (it brakes the ball: a puddle over mud, dark and wet, its sheen and rings over it, a darker wet patch round it)
  add(g, pitWater(t, pts, t.height(boxOf(z).cx, boxOf(z).cz) + 0.035, (x, zz) => !ok(x, zz), 0.35, true));
  g.add(new THREE.Mesh(band(pts, [[0.3, (x, zz) => t.height(x, zz) + 0.02, 0x8a7258], [0.05, (x, zz) => t.height(x, zz) + 0.045, 0x735e48], [-0.1, (x, zz) => t.height(x, zz) + 0.03, 0x5e4c3a]], (x, zz) => !ok(x, zz)), relief(THREE.DoubleSide)));
  add(g, drips(t, spotsIn(pts, 2, 0.3, rand, ok).map(([x, zz]) => new THREE.Vector3(x, t.height(x, zz) + 0.04, zz)), rand));
  return g;
}

/** Crystal ice: a floor of pale glass, deep cyan in its middle, crystals caught in it, frost at its rim, a glint. */
let iceMat: THREE.MeshPhongMaterial | null = null;
function ice(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  // (not over the cup's rings: the cup is set in the rock, the ice round it)
  const [cx0, cz0] = s.cup, CUP = 1.6, pts = outline(z, s), g = new THREE.Group(), ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz) && Math.hypot(x - cx0, zz - cz0) > CUP;
  // (its edge round the cup a clean circle: the corners inside it pulled onto it, not a ring of stepped cells)
  const round = (x: number, zz: number): MutVec2 | null => { const d = Math.hypot(x - cx0, zz - cz0); return d < CUP ? [cx0 + ((x - cx0) / (d || 1)) * CUP, cz0 + ((zz - cz0) / (d || 1)) * CUP] : null; };
  const rimC = new THREE.Color(0xeafaff), mid = new THREE.Color(0x9fdcf0), deep = new THREE.Color(0x5fb4d8), lit = new THREE.Color(0xb8f6ff);
  // crystals frozen in it, just under the surface: seen through as a glow in the ice itself (its colours: no glow
  // laid over the lane)
  const frozen = spotsIn(pts, Math.min(6, Math.round(Math.abs(areaOf(pts)) / 10)), 1, rand, ok);
  const glowAt = (x: number, zz: number) => frozen.reduce((m, [fx, fz]) => Math.max(m, Math.exp(-((x - fx) ** 2 + (zz - fz) ** 2) / 0.35)), 0);
  // (over every patch laid round it: they are 0.02 to 0.045 up)
  // (its face uneven a hair, in flat facets: glints across it where the light catches a facet, not a sheet of glass)
  // the ice in plates: a crackle of cells, each its own depth of blue, a white crack between them
  // (as big as its sheet's cells allow its cracks to read: a big floor is drawn in coarser cells)
  const step = Math.max(0.5, Math.sqrt(Math.abs(areaOf(pts)) / 8000)), G = 1.3 * Math.max(1, step / 0.3), CW = 0.6 * step;
  const plate = (x: number, zz: number) => {
    let d1 = 9, d2 = 9, id = 0;
    const gi = Math.floor(x / G), gj = Math.floor(zz / G);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const i = gi + a, j = gj + b, hx = Math.sin(i * 127.1 + j * 311.7) * 43758.5, hz = Math.sin(i * 269.5 + j * 183.3) * 43758.5;
      const px = (i + hx - Math.floor(hx)) * G, pz = (j + hz - Math.floor(hz)) * G, d = Math.hypot(x - px, zz - pz);
      if (d < d1) (d2 = d1), (d1 = d), (id = hx - Math.floor(hx)); else if (d < d2) d2 = d;
    }
    return { id, edge: d2 - d1 };
  };
  const crack = new THREE.Color(0xf2fdff), frost = new THREE.Color(0xf6fdff);
  // (each plate at its own height, the cracks between them sunk to the floor's plane: the top at the physics plane)
  const geo = sheet(pts, step, (x, zz) => { const p = plate(x, zz); return drawnGround(t, x, zz) + 0.05 + (0.01 + 0.025 * p.id) * smoothstep(p.edge / CW); }, (x, zz, d, c) => {
    const p = plate(x, zz);
    c.copy(rimC).lerp(mid, smoothstep(d / 0.8)).lerp(deep, (0.1 + 0.8 * p.id) * smoothstep((d - 0.4) / 1.2)).lerp(lit, 0.8 * glowAt(x, zz));
    if (p.edge < CW) c.lerp(crack, 0.35 * (1 - p.edge / CW)); // (a pale seam, not a white shard: the cells' colours are blended across their triangles)
    // frost: white creeping in from its edge, speckled
    const f = (1 - smoothstep(d / 0.9)) * (0.55 + 0.45 * vnoise(x * 4.1, zz * 4.1));
    c.lerp(frost, 0.8 * f);
  }, (x, zz) => t.onGreen(x, zz) && !overVoid(s, x, zz) && Math.hypot(x - cx0, zz - cz0) > CUP * 0.55, 8000, round); // (fine on a big floor: it follows the ground under it)
  iceMat ||= share(new THREE.MeshPhongMaterial({ vertexColors: true, emissive: 0x3f8fb8, emissiveIntensity: 0.3, shininess: 110, specular: 0xffffff, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  g.add(new THREE.Mesh(geo, iceMat));
  // facet lines: the crystal's cleavage, straight cracks at three angles
  const lines: THREE.Vector3[] = [];
  for (let k = 0; k < Math.round(Math.abs(areaOf(pts)) / 3); k++) {
    const [x, zz] = spotsIn(pts, 1, 0.5, rand, ok)[0] || [0, 0];
    if (!x) continue;
    const a = (Math.floor(rand() * 3) / 3) * Math.PI + 0.3, l = 0.5 + rand() * 1.2;
    const p = [x - Math.cos(a) * l, zz - Math.sin(a) * l], q = [x + Math.cos(a) * l, zz + Math.sin(a) * l];
    if (!inPoly(p[0], p[1], pts) || !inPoly(q[0], q[1], pts)) continue;
    lines.push(new THREE.Vector3(p[0], t.height(p[0], p[1]) + 0.05, p[1]), new THREE.Vector3(q[0], t.height(q[0], q[1]) + 0.05, q[1]));
  }
  if (lines.length) g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })));
  // and a few crystals breaking out at its rim
  const edge = pts.filter((_p, k) => k % Math.max(1, Math.round(pts.length / 5)) === 0);
  for (const [x, zz] of edge) {
    if (!ok(x, zz) || rand() < 0.4) continue;
    const c = crystalCluster(rand, 0.45, MINES.cyan, 3);
    c.position.set(x, t.height(x, zz), zz);
    g.add(c);
  }
  return g;
}

/** The strongroom's floor of coins: a drift of gold coins, heaped and slipping, glinting. */
function gold(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const { mesh, pts } = patch(z, t, s, (x, zz, _d, c) => c.set(GOLD_DARK).lerp(new THREE.Color(GOLD), 0.35 * vnoise(x * 2, zz * 2)));
  const g = new THREE.Group();
  g.add(mesh);
  // (no coin over a drop, the void or a sunk hazard, nor within a coin's width of one)
  const ok = (x: number, zz: number) => t.onGreen(x, zz) && Math.hypot(x - s.cup[0], zz - s.cup[1]) > 1.6 && [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]].every(([a, b]) => !overVoid(s, x + a, zz + b) && !inHazard(s, x + a, zz + b));
  const coinM = goldMat();
  // coins: a scatter over the floor, lying every which way, and in low drifts along its rim
  // (all of it a hair over the floor: the ball rolls over the gold, nothing on it stands in its way)
  const scatter = spotsIn(pts, Math.min(90, Math.round(Math.abs(areaOf(pts)) * 0.7)), 0.3, rand, ok);
  const heaps = pts.filter((_, k) => k % 9 === 0).filter(([x, zz]) => ok(x, zz));
  const perHeap = 14, n = scatter.length + heaps.length * perHeap;
  // (a coin: its face gold, its milled rim darker; each its own tone as it lies, now and then one catching the light)
  const coinGeo = paint(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 8), (x, _y, zz, c) => c.set(Math.hypot(x, zz) > 0.13 ? GOLD_DARK : GOLD));
  const coins = new THREE.InstancedMesh(coinGeo, coinM, n);
  for (let k = 0; k < n; k++) coins.setColorAt(k, new THREE.Color(1, 1, 1).multiplyScalar(rand() < 0.08 ? 1.35 : 0.85 + rand() * 0.3));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (const [x, zz] of scatter) {
    E.set((rand() - 0.5) * 0.3, rand() * 6, (rand() - 0.5) * 0.3);
    coins.setMatrixAt(i++, M.compose(P.set(x, t.height(x, zz) + 0.055, zz), Q.setFromEuler(E), one)); // (clear of the floor at their tilt, under the ball's float tolerance)
  }
  // (each drift a little in from the rim, and no coin of it out over the void or off the lane)
  const { cx: zcx, cz: zcz } = boxOf(z), zc = [zcx, zcz];
  for (const [ex, ez] of heaps) {
    const l = Math.hypot(zc[0] - ex, zc[1] - ez) || 1, hx = ex + ((zc[0] - ex) / l) * 0.9, hz = ez + ((zc[1] - ez) / l) * 0.9;
    for (let q = 0; q < perHeap; q++) {
      // a dome of coins: a spiral up it, each tilted to its slope
      const u = q / perHeap, a = q * 2.4, rr = 0.75 * Math.sqrt(1 - u), y = 0.05 * u, cx = hx + Math.cos(a) * rr, cz = hz + Math.sin(a) * rr;
      E.set(Math.sin(a) * 0.1 * (1 - u) + (rand() - 0.5) * 0.1, rand() * 6, Math.cos(a) * 0.1 * (1 - u));
      coins.setMatrixAt(i++, ok(cx, cz) ? M.compose(P.set(cx, t.height(hx, hz) + 0.05 + y, cz), Q.setFromEuler(E), one) : M.makeScale(0, 0, 0));
    }
  }
  g.add(coins);
  // (no stacks nor ingots standing on it: the floor where the ball rolls is coins lying flat)
  return g;
}

/** A stepping stone of the causeway: a cluster of basalt columns up out of the lava, their tops a hexagonal paving at the lane's height. */
function causeway(z: Zone, t: Terrain, s: Hole, _rand: Rand) {
  const g = new THREE.Group(), pts = outline(z, s);
  const cols: THREE.BufferGeometry[] = [];
  const R = 0.42, dx = R * 1.5, dz = R * Math.sqrt(3);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, zz] of pts) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, zz)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, zz));
  for (let i = 0; x0 + i * dx <= x1 + R; i++)
    for (let j = 0; z0 + j * dz <= z1 + R; j++) {
      const x = x0 + i * dx, zz = z0 + j * dz + (i % 2 ? dz / 2 : 0);
      // (the columns cover the stone, and a little over its edge: the ball's centre is on it to its edge)
      if (!inPoly(x, zz, pts) && edgeDist(x, zz, pts) > R * 0.6) continue;
      const top = t.height(x, zz) + 0.065 + (inPoly(x, zz, pts) ? 0.015 * lumps(x * 3, 0, zz * 3) : -0.08), foot = LEVEL.lava - 0.4; // (over the lane's laid surfaces)
      const geo = new THREE.CylinderGeometry(R * 1.0, R * 1.04, top - foot, 6).rotateY(Math.PI / 6).translate(x, (top + foot) / 2, zz);
      const edgy = edgeDist(x, zz, pts);
      paint(geo, (_x, y, _z, c) => {
        c.set(y > top - 0.03 ? (lumps(x * 5, 1, zz * 5) > 0 ? 0x5a5270 : 0x4f4865) : 0x3a3450);
        if (y < 0) c.lerp(new THREE.Color(0x9c3a18), Math.min(1, (0 - y) / 0.4) * (edgy < 0.6 ? 0.9 : 0.4)); // scorched and glowing at the lava
      });
      cols.push(geo.toNonIndexed());
    }
  if (cols.length) {
    const m = mergeGeometries(cols);
    m.computeVertexNormals();
    g.add(inked(m, relief(), INK_THIN));
  }
  return g;
}

// ------------------------------------------------------------ the lava falls
//
// A curtain of lava pouring from a spout in the vault across the gallery,
// on the tick clock: when its window opens the head of the flow falls from
// the spout to the floor, it pours through the window, then its tail falls
// away and leaves the pool on the floor crusting over, dripping. A few ticks
// before it pours the spout glows and drips: the look-ahead.
const FALL_TOP = 8.5;
function lavaFall(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  // (only what moves is live: the streams and the pool; the arch, the crust and the glow at its lip merge with the hole)
  const g = new THREE.Group();
  const { w, h, cx, cz } = boxOf(z), L = Math.max(w, h), T = Math.min(w, h);
  const floor = t.height(cx, cz), ang = w >= h ? 0 : Math.PI / 2;
  // the fall: braided streams of lava side by side across the zone, each a
  // round stream (a tube whose section swells and thins as it falls, wider
  // along the fall than across it), flaring where it lands into the pool;
  const curtain = new THREE.Mesh(streams(rand, L, T, Math.max(2, Math.round(L / 0.8)), 0.42), lavaMaterial());
  const pour = new THREE.Group();
  pour.add(curtain);
  pour.position.set(cx, floor, cz);
  pour.rotation.y = -ang;
  ud(pour).live = true;
  g.add(pour);
  // the source: a crag of rock across the gallery hanging from the roof, the
  // lava breaking out of its underside — scorched black, glowing at the lip
  // it pours from
  const span = L + 3.2, ember = new THREE.Color(0xff6a1a), hotC = new THREE.Color(0xffb23b), crustC = new THREE.Color(0x2b1a17), seed = rand() * 9;
  // (no piers standing in the camera's way from the tee: it hangs)
  const lintel = knobbly(new THREE.IcosahedronGeometry(1, 2), rand, 0.12, 1.6);
  lintel.scale(span / 2, 1.3, T / 2 + 0.9);
  paint(lintel, (x, y, zz, c) => {
    strata(y + 2, x, zz, 3, c, seed);
    if (y < -0.3) c.lerp(crustC, Math.min(1, (-0.3 - y) / 0.6));
    if (y < -1.0 && Math.abs(x) < L / 2) c.copy(y < -1.15 ? hotC : ember); // the glowing lip, over the fall only
  });
  // its root: rock rising from it into the dark of the roof, narrowing
  const root = knobbly(new THREE.CylinderGeometry(0.45, 1, 1, 8, 4), rand, 0.14, 1.4);
  root.scale(span * 0.32, 9, T / 2 + 0.7).translate(0, 5, 0);
  paint(root, (x, y, zz, c) => strata(y + 2, x, zz, 3, c, seed));
  const arch = new THREE.Group();
  arch.add(facets(mergeGeometries([lintel.toNonIndexed(), root.toNonIndexed()].map((q) => (q.deleteAttribute("uv"), q.deleteAttribute("normal"), q))), relief()));
  arch.position.set(cx, floor + FALL_TOP + 1.2, cz);
  arch.rotation.y = -ang;
  // (fading out of a high camera's way, merged with any other crag near it)
  const fa = sightFade(t, arch, new THREE.Vector3(cx, floor + FALL_TOP + 3, cz), Math.max(2.5, L / 2));
  add(g, fa.bucket);
  add(g, fa.root);
  const mouth = halo(Math.max(1.2, T), 0xff7a2a, 0.35);
  mouth.position.set(cx, floor + FALL_TOP - 0.2, cz);
  g.add(mouth);
  // where it lands: a pool on the floor, hot while it pours, crusting over after
  const pts = outline(z, s), ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz);
  const hot = sheet(pts, 0.6, (x, zz) => t.height(x, zz) + 0.04, undefined, ok, 600);
  const hd = hot.userData.d as Float32Array;
  crustBy(hot, () => 0);
  const hc = hot.attributes.lavaCrust as THREE.BufferAttribute;
  for (let i = 0; i < hc.count; i++) hc.setX(i, 1 - smoothstep(hd[i] / 0.8));
  const hot0 = Float32Array.from(hc.array as Float32Array);
  let crusted = -1; // (how far it has crusted over, as last drawn)
  const pool = new THREE.Mesh(hot, lavaMaterial());
  ud(pool).live = true;
  g.add(pool);
  // (off, nothing of it on the floor: the lane is the lane again, no strip of crust left where it poured)
  const foot = [0.2, 0.5, 0.8].map((u) => new THREE.Vector3(cx + Math.cos(ang) * (u - 0.5) * L * 0.8, floor + 0.05, cz + Math.sin(ang) * (u - 0.5) * L * 0.8));
  let pouring = 0; // 0..1: how much it pours now
  add(g, drips(t, foot.map((f) => f.clone().setY(floor + 0.05)), rand, 0xff8a3a, () => !on && warn > 0));
  let on = false, warn = 0, t0 = -99, t1 = -99, now = 0;
  state.timed.push({
    at: (step) => {
      const tk = Math.floor(step), was = on;
      on = onAt(z, tk);
      const until = untilOn(z, tk); // ticks to go before it pours
      warn = on ? 0 : until <= 3 ? 1 - (until - 1) / 3 : 0;
      if (on && !was) t0 = now;
      if (!on && was) t1 = now;
    },
  });
  const DROP = FALL_TOP - 0.2;
  // blobs of lava falling beside the curtain, and a crown of drops thrown up where it lands
  // (one instanced mesh for the blobs of every fall of the hole: shared, each fall its slots)
  const NB = 12, { sys: bs, first } = shared(t, "fall blobs", () => {
    const m = new THREE.InstancedMesh(crustBy(new THREE.IcosahedronGeometry(0.34, 1), () => 0), lavaMaterial(), NB * 2 * 4);
    m.frustumCulled = false;
    m.count = 0;
    ud(m).live = true;
    return { root: m, used: 0 };
  });
  if (first) g.add(bs.root);
  const blobs = bs.root, base = bs.used;
  bs.used = Math.min(NB * 2 * 4, base + NB * 2);
  blobs.count = bs.used;
  const bl = Array.from({ length: NB * 2 }, (_, i) => ({ u: rand() - 0.5, side: rand() < 0.5 ? -1 : 1, ph: rand(), s: 0.6 + rand() * 0.8, crown: i >= NB, a: rand() * 6 }));
  const BM = new THREE.Matrix4(), BQ = new THREE.Quaternion(), BS = new THREE.Vector3(), BP = new THREE.Vector3(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  animate((tt) => {
    now = tt;
    // the head falling from the spout, or the tail falling after it
    const head = Math.min(1, Math.max(0, (tt - t0) / 0.45)), tail = Math.min(1, Math.max(0, (tt - t1) / 0.45));
    let lo = 0, hi = DROP;
    if (on) lo = DROP * (1 - head * head);
    else hi = DROP * (1 - tail * tail);
    curtain.visible = hi - lo > 0.02 && (on || tail < 1);
    curtain.position.y = lo;
    curtain.scale.y = Math.max(0.01, hi - lo);
    pouring = on ? head : 1 - tail;
    // (stopped: crusting over from its rim in as the last of it falls, then gone: the lane the lane again)
    const crust = on ? 0 : Math.min(1, tail * 1.2);
    pool.visible = on || tail < 0.95;
    if (pool.visible && Math.abs(crust - crusted) > 0.02) {
      crusted = crust;
      for (let i = 0; i < hc.count; i++) hc.setX(i, Math.min(0.98, hot0[i] + (1 - hot0[i]) * crust));
      hc.needsUpdate = true;
    }
    bl.forEach((b, j) => {
      const i = base + j;
      if (i >= NB * 2 * 4) return;
      if (pouring < 0.2) return void blobs.setMatrixAt(i, hide);
      const k = (tt * (b.crown ? 1.4 : 0.55) + b.ph) % 1, ax = Math.cos(ang) * b.u * L * 0.9, az = Math.sin(ang) * b.u * L * 0.9;
      if (!b.crown) {
        // falling down the face of the curtain, faster and faster
        // (beside the curtain, inside its zone: where the chain has the fall)
        const y = floor + DROP * (1 - k * k), px = -Math.sin(ang) * b.side * (T * 0.5 - 0.3), pz = Math.cos(ang) * b.side * (T * 0.5 - 0.3);
        blobs.setMatrixAt(i, BM.compose(BP.set(cx + ax + px, y, cz + az + pz), BQ, BS.set(b.s * 0.8, b.s * 1.4, b.s * 0.8)));
      } else {
        // thrown out of the splash and falling back
        // (thrown along the fall and a little across it, never out of its zone)
        const r = 0.4 + k * 1.6, y = floor + 0.15 + Math.sin(Math.PI * k) * 1.3, along = Math.cos(b.a) * r * 0.6, over = Math.sin(b.a) * Math.min(r, T * 0.4);
        blobs.setMatrixAt(i, BM.compose(BP.set(cx + ax + Math.cos(ang) * along - Math.sin(ang) * over, y, cz + az + Math.sin(ang) * along + Math.cos(ang) * over), BQ, BS.setScalar(b.s * 0.6 * (1 - k * 0.5))));
      }
    });
    blobs.instanceMatrix.needsUpdate = true;
  });
  return g;
}

// ------------------------------------------------------------ hills
//
// The terrain raises a hill's ground itself (terrain.ts): here what it is
// made of, laid on that ground.

/** A zone's axis: the push's way (unit) and across it, its box's middle and its extents along and across. */
function axes(z: Zone) {
  const l = Math.hypot(z.vec[0], z.vec[1]) || 1, ux = z.vec[0] / l, uz = z.vec[1] / l, nx = -uz, nz = ux;
  const { cx, cz } = boxOf(z);
  const corners: Vec2[] = [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]];
  const along = corners.map((p) => (p[0] - cx) * ux + (p[1] - cz) * uz), across = corners.map((p) => (p[0] - cx) * nx + (p[1] - cz) * nz);
  return { ux, uz, nx, nz, cx, cz, a0: Math.min(...along), a1: Math.max(...along), b0: Math.min(...across), b1: Math.max(...across) };
}

/** The conveyor: a rubber belt running over its rollers in the push's way, cleats riding on it, its iron side frames and the drums at its ends. */
function conveyor(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), A = axes(z), ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz);
  const { mesh } = patch(z, t, s, (_x, _zz, _d, c) => c.set(0x34303e));
  g.add(mesh);
  const at = (a: number, b: number): THREE.Vector3 => { const x = A.cx + A.ux * a + A.nx * b, zz = A.cz + A.uz * a + A.nz * b; return new THREE.Vector3(x, t.height(x, zz), zz); };
  // (all of it flush with the belt, its ribs a hair over it: the ball rolls over the whole of it)
  // the side frames: iron channel along each edge
  const frame: THREE.BufferGeometry[] = [];
  const L = A.a1 - A.a0, n = Math.max(2, Math.round(L / 1.6));
  for (const b of [A.b0 + 0.08, A.b1 - 0.08])
    for (let k = 0; k < n; k++) {
      const p = at(A.a0 + (L * k) / n, b), q = at(A.a0 + (L * (k + 1)) / n, b), len = p.distanceTo(q);
      const geo = new THREE.BoxGeometry(len, 0.08, 0.16).translate(len / 2, 0, 0);
      geo.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), q.clone().sub(p), new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
      geo.translate(p.x, p.y + 0.04, p.z);
      paint(geo, (_x, _y, _z, c) => c.set(k % 2 ? IRON : 0x6a707e));
      frame.push(geo);
    }
  if (frame.length) g.add(inked(mergeGeometries(frame), relief(), INK_THIN));

  // the drums at the ends, turning under the belt: only their crowns over the floor (sunk in their pits, nothing
  // of them through the ground), their ribs coming up over the top and going down again about their own axles
  const DR = 0.35, SINK = 0.28, half = Math.acos(SINK / DR), across = A.b1 - A.b0 + 0.2, speed = 0.9 + Math.hypot(z.vec[0], z.vec[1]);
  const RIBS = 8, ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.05, across - 0.1), flat(0x3a3f4c), RIBS * 2);
  ribs.frustumCulled = false;
  ud(ribs).live = true;
  g.add(ribs);
  const drums = [A.a0, A.a1].map((a) => {
    const p = at(a, 0), yaw = -Math.atan2(A.uz, A.ux);
    const crown = solid(new THREE.CylinderGeometry(DR, DR, across, 14, 1, true, Math.PI - half, 2 * half).rotateX(Math.PI / 2).rotateY(yaw).translate(p.x, p.y - SINK, p.z), 0x5a6070);
    g.add(crown);
    return { c: new THREE.Vector3(p.x, p.y - SINK, p.z), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw) };
  });
  const RM = new THREE.Matrix4(), RQ = new THREE.Quaternion(), RS = new THREE.Vector3(1, 1, 1), RP = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), NONE = new THREE.Vector3();
  animate((tt) => {
    drums.forEach((d, i) => {
      for (let k = 0; k < RIBS; k++) {
        // (turning the belt's way: its top going the push's way)
        const f = (k / RIBS) * Math.PI * 2 - (tt * speed) / DR, y = Math.sin(f) * DR, up = y > SINK + 0.02;
        RP.set(Math.cos(f) * DR, y, 0).applyQuaternion(d.q).add(d.c);
        RQ.setFromAxisAngle(Z, f).premultiply(d.q);
        ribs.setMatrixAt(i * RIBS + k, RM.compose(RP, RQ, up ? RS : NONE));
      }
    });
    ribs.instanceMatrix.needsUpdate = true;
  });
  // what drives it: a motor off the belt by its head drum, a chain from it to the drum's axle end
  for (const b of [A.b1 + 0.7, A.b0 - 0.7]) {
    const p = at(A.a1, b);
    if (t.onGreen(p.x, p.z) || overVoid(s, p.x, p.z)) continue;
    const yaw = -Math.atan2(A.uz, A.ux), q = at(A.a1, b > 0 ? A.b1 + 0.1 : A.b0 - 0.1);
    const motor = plate(0.6, 0.5, 0.5, 0x4a4f5c);
    motor.position.set(p.x, p.y + 0.25, p.z);
    motor.rotation.y = yaw;
    g.add(motor);
    g.add(solid(new THREE.CylinderGeometry(0.03, 0.03, p.distanceTo(q), 4).rotateZ(Math.PI / 2).rotateY(-Math.atan2(q.z - p.z, q.x - p.x)).translate((p.x + q.x) / 2, (p.y + q.y) / 2 + 0.2, (p.z + q.z) / 2), 0x3a3d48));
    break;
  }
  // the cleats: rubber ribs across the belt, riding it the push's way
  const N = Math.max(4, Math.round(L / 0.8)), w = A.b1 - A.b0 - 0.35;
  const cleats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.04, w), flat(0x4a4458), N);
  cleats.frustumCulled = false;
  ud(cleats).live = true;
  g.add(cleats);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(A.uz, A.ux)), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  animate((tt) => {
    for (let k = 0; k < N; k++) {
      const a = A.a0 + mod((k * L) / N + tt * speed, L), p = at(a, 0);
      const vis = ok(p.x, p.z);
      cleats.setMatrixAt(k, M.compose(P.set(p.x, p.y + 0.045, p.z), Q, vis ? S : P.clone().set(0, 0, 0)));
    }
    cleats.instanceMatrix.needsUpdate = true;
  });
  return g;
}

/** The man-way: an incline laid with planks across, battens nailed over them for the feet, worn in the middle. */
function incline(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), A = axes(z);
  // (the kit's boards, across the incline: every deck of the mines one way; none on a shaft's collar, 0.5 round its
  // mouth: the collar's planks are the floor there)
  const collars = s.zones.filter((q) => q.skin === "shaft").map((q) => { const o = outline(q, s), n = normals(o); return o.map(([x, zz], k): MutVec2 => [x + n[k][0] * 0.5, zz + n[k][1] * 0.5]); });
  const on = (x: number, zz: number) => inZone(z, x, zz) && t.onGreen(x, zz) && !overVoid(s, x, zz) && !inHazard(s, x, zz) && !collars.some((o) => inPoly(x, zz, o));
  // (their tops taken at their own edges, 0.05 over the slope: laid across it, a board's edges sampled further out
  // put its lower edge down in the lane; and a flat board over a hump dips at its middle)
  g.add(planks([{ inside: on, top: (x, zz) => drawnGround(t, x, zz) + 0.05, box: [z.min[0], z.min[1], z.max[0], z.max[1]], angle: Math.atan2(A.nz, A.nx), reach: 0.25 }], seeded("incline" + s.hole + z.min.join())));
  // battens for the feet: each the incline's whole width, only where it climbs,
  // none cut short (a row with an end off the planks is left out whole)
  const battens: THREE.BufferGeometry[] = [], W = A.b1 - A.b0 - 0.3;
  for (let a = A.a0 + 0.4; a < A.a1; a += 0.9) {
    const x = A.cx + A.ux * a + A.nx * (A.b0 + A.b1) / 2, zz = A.cz + A.uz * a + A.nz * (A.b0 + A.b1) / 2;
    if (Math.abs(t.height(x + A.ux * 0.45, zz + A.uz * 0.45) - t.height(x - A.ux * 0.45, zz - A.uz * 0.45)) < 0.05) continue;
    let off = false;
    for (let e = -W / 2; e <= W / 2 + 1e-3 && !off; e += 0.3) {
      const px = x + A.nx * e, pz = zz + A.nz * e;
      off = !inZone(z, px, pz) || !t.onGreen(px, pz) || overVoid(s, px, pz) || inHazard(s, px, pz);
    }
    if (off) continue;
    // (sunk into the planks, top at +0.05: their undersides not on the planks' faces; their tops 0.055 over them,
    // under the ball's float tolerance over the lane, and under a cart's track at +0.13)
    const geo = new THREE.BoxGeometry(0.16, 0.09, W).rotateY(-Math.atan2(A.uz, A.ux)).translate(x, drawnGround(t, x, zz) + 0.06, zz);
    paint(geo, (_x, _y, _z, c) => c.set(TIMBER_DARK));
    battens.push(geo);
  }
  if (battens.length) g.add(inked(mergeGeometries(battens), relief(), INK_THIN));
  return g;
}

/** The great shaft's banked ledge: paving of dressed stone, its joints, leaning toward the drop. */
function ledgeBank(z: Zone, t: Terrain, s: Hole) {
  // (the push's way, as the chain has it: the way the bank leans)
  const A = axes(z), pl = Math.hypot(z.vec[0], z.vec[1]) || 1, pu = [z.vec[0] / pl, z.vec[1] / pl], span = Math.max(0.5, Math.max(A.a1 - A.a0, A.b1 - A.b0) / 2);
  const tones = [0x736a8c, 0x685f80, 0x7d7496].map((c) => new THREE.Color(c)), joint = new THREE.Color(0x3a3450);
  const { mesh } = patch(z, t, s, (x, zz, _d, c) => {
    const i = Math.floor(x / 1.1), j = Math.floor(zz / 0.9 + (i % 2) * 0.5), fx = x / 1.1 - i, fz = zz / 0.9 + (i % 2) * 0.5 - j;
    c.copy(tones[mod(i * 7 + j * 3, 3)]);
    if (fx < 0.07 || fz < 0.09) c.lerp(joint, 0.6);
    // (its lean read, where the paving lies flat for the ball: darker down the push's way, the low edge in shade, and
    // streaks of grit washed down its fall line)
    const along = ((x - A.cx) * pu[0] + (zz - A.cz) * pu[1]) / span, across = (x - A.cx) * -pu[1] + (zz - A.cz) * pu[0];
    c.multiplyScalar(1.1 - 0.3 * smoothstep(along * 0.5 + 0.5));
    if (Math.abs(fract(across * 1.7 + 0.35 * vnoise(along * 3, across)) - 0.5) < 0.06) c.lerp(joint, 0.35);
  }, () => 0, 5000); // (its own height over the ground as drawn is enough: it never shows through the paving)
  return mesh;
}
const fract = (v: number) => v - Math.floor(v);

/** A kicker: a timber ramp, its boards across the slope. */
function kicker(z: Zone, t: Terrain, s: Hole) {
  const A = axes(z), on = (x: number, zz: number) => inZone(z, x, zz) && t.onGreen(x, zz) && !overVoid(s, x, zz);
  // (the kit's boards across the slope, each at its own height up the ramp: a board laid up it would run straight
  // from its foot to its lip, off the ramp's curve; a hair more over it: the ground under a ramp is drawn in coarser
  // triangles than its height)
  return planks([{ inside: on, top: (x, zz) => drawnGround(t, x, zz) + 0.03, box: [z.min[0], z.min[1], z.max[0], z.max[1]], angle: Math.atan2(A.nz, A.nx), reach: 0.25 }], seeded("kicker" + s.hole + z.min.join()));
}

/** The rope bridge's deck: planks across it lashed to two ropes, swaying with its timed hills (their push one way, then the other). */
function ropeBridge(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const g = new THREE.Group();
  // the deck's own way: the lane inside the zone (a bridge may cross it on the slant), its principal axis
  const onLane = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz) && !inHazard(s, x, zz) && inZone(z, x, zz);
  const pts: Vec2[] = [];
  for (let x = z.min[0]; x <= z.max[0]; x += 0.25) for (let zz = z.min[1]; zz <= z.max[1]; zz += 0.25) if (onLane(x, zz)) pts.push([x, zz]);
  if (pts.length < 4) return g;
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, zz] of pts) (sxx += (x - cx) ** 2), (szz += (zz - cz) ** 2), (sxz += (x - cx) * (zz - cz));
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(th), uz = Math.sin(th), nx = -uz, nz = ux;
  const proj = pts.map(([x, zz]) => (x - cx) * ux + (zz - cz) * uz), u0 = Math.min(...proj), u1 = Math.max(...proj), y0 = t.height(cx, cz);
  // its width: the lane's across it at its middle
  let lo = Infinity, hi = -Infinity;
  for (let v = -6; v <= 6; v += 0.1) if (onLane(cx + nx * v, cz + nz * v)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  if (!(hi - lo > 0.4)) return g;
  const mid = (lo + hi) / 2, at = (u: number) => new THREE.Vector3(cx + ux * u + nx * mid, 0, cz + uz * u + nz * mid);
  // (no rails of its own: a rail-less bridge has none, and the chain's rope walls draw theirs)
  // (no wider or longer than the lane it carries: its boards' ragged ends, up to 0.15 past its sides, still over the
  // lane's edge, not out over the drop)
  const a = at(u0).setY(0), b = at(u1).setY(0);
  const d = deck({ a: a.clone().sub(at(0)), b: b.clone().sub(at(0)), width: hi - lo - 0.1, rail: "none", rand });
  bakeLocal(d);
  const piv = new THREE.Group();
  piv.add(d);
  // (a hair over the lane where its ends lie on it: its planks' tops are at its foot)
  const c0 = at(0), lift = 0.04;
  piv.position.set(c0.x, y0 + lift, c0.z);
  g.add(piv);
  // its sway: the timed hills over it, pushing across it one way or the other
  const hills = s.zones.filter((q) => q.skin === "rope bridge" && q.every && q.min.join() === z.min.join() && q.max.join() === z.max.join());
  if (hills.length) {
    ud(piv).live = true;
    // (on the clock itself, not eased frame by frame: where it leans at a tick is where the push has it, turning
    // over in the half tick after the push turns)
    const axis = new THREE.Vector3(ux, 0, uz);
    const push = (k: number) => { const on = hills.find((q) => there(k, q.every, q.on, q.phase)); return on ? Math.sign(on.vec[0] * nx + on.vec[1] * nz) : 0; };
    state.timed.push({
      at: (step) => {
        const k = Math.floor(step), f = step - k, now = push(k), was = push(k - 1);
        const lean = was + (now - was) * smoothstep(Math.min(1, f / 0.5));
        // (about its own length, as far as it can and keep both edges between the lane and a ball's float over it:
        // 0.075 across its width, the push's way)
        // (turned about its low edge: that edge stays at its height over the lane, the high one rises 0.04)
        const tilt = Math.min(0.11, 0.04 / Math.max(0.5, hi - lo)); // (its thresholds too under the float tolerance)
        piv.quaternion.setFromAxisAngle(axis, lean * tilt);
        piv.position.y = y0 + lift + Math.abs(lean) * tilt * ((hi - lo) / 2);
      },
    });
  }
  return g;
}

// ------------------------------------------------------------ the air

/** Where along a zone its air comes from: the edge against its push, split into outlets (grates or nozzles) a couple of units apart. */
function outlets(z: Zone, t: Terrain) {
  const A = axes(z), W = A.b1 - A.b0, n = z.round && W < 5 ? 1 : Math.max(1, Math.round(W / 2.6));
  const out: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) {
    const b = n === 1 ? 0 : A.b0 + (W * (k + 0.5)) / n, a = z.round && W < 5 ? 0 : A.a0 + 0.6;
    const x = A.cx + A.ux * a + A.nx * b, zz = A.cz + A.uz * a + A.nz * b;
    out.push(new THREE.Vector3(x, t.height(x, zz), zz));
  }
  return { A, out };
}

/**
 * Steam vents (and the boosters: along the ledge): iron grates in the floor
 * (a booster: nozzles on a pipe) at the edge the air comes from, the steam
 * bursting out across the zone on its clock — spitting a few ticks before,
 * then a jet the push's way while it blows, wisps otherwise.
 */
function steamJets(z: Zone, t: Terrain, s: Hole, rand: Rand, booster: boolean) {
  const g = new THREE.Group(), { A, out: all } = outlets(z, t), L = Math.min(A.a1 - A.a0, 9);
  // (none over the void or off the lane: one whose edge runs out past the lane's is moved in along the push till it
  // is on it, inside the zone)
  const out = all.map((p) => {
    for (let d = 0; d < A.a1 - A.a0; d += 0.25) {
      const x = p.x + A.ux * d, zz = p.z + A.uz * d;
      if (t.onGreen(x, zz) && !overVoid(s, x, zz) && inZone(z, x, zz)) return new THREE.Vector3(x, t.height(x, zz), zz);
    }
    return null;
  }).filter((p): p is THREE.Vector3 => !!p);
  const still: THREE.BufferGeometry[] = [];
  for (const p of out) {
    if (booster) {
      // a nozzle: a flared iron mouth aimed along the push, sunk in its slot in the floor (its top under the
      // ball's middle: the ball rolls over it)
      const nz = new THREE.CylinderGeometry(0.28, 0.42, 0.7, 12).rotateZ(-Math.PI / 2).rotateY(-Math.atan2(A.uz, A.ux)).translate(p.x, p.y - 0.33, p.z);
      still.push(nz);
    } else {
      // a grate: an iron ring with its bars, flush with the floor
      const r = z.round ? Math.min(A.b1 - A.b0, A.a1 - A.a0) * 0.3 : 0.55;
      still.push(new THREE.TorusGeometry(r, 0.07, 6, 18).rotateX(Math.PI / 2).translate(p.x, p.y + 0.05, p.z));
      for (let k = -2; k <= 2; k++) still.push(new THREE.BoxGeometry(0.05, 0.04, 2 * Math.sqrt(Math.max(0, r * r - ((k * r) / 2.5) ** 2))).translate(p.x + (k * r) / 2.5, p.y + 0.04, p.z));
    }
  }
  // a booster's nozzles on their steam pipe, along the zone's back edge, half sunk in the floor and on into the rock
  if (booster && out.length) {
    const p0 = out[0], p1 = out[out.length - 1], d = new THREE.Vector3(A.nx, 0, A.nz), sg = Math.sign((p1.x - p0.x) * A.nx + (p1.z - p0.z) * A.nz || 1);
    // (on past the end nozzles into the rock, 1.2 at most, never out over the void)
    const reach = (p: THREE.Vector3, k: number) => { let e = 0; while (e < 1.2 && !overVoid(s, p.x + d.x * k * (e + 0.25) - A.ux * 0.5, p.z + d.z * k * (e + 0.25) - A.uz * 0.5)) e += 0.1; return e; };
    const a = p0.clone().addScaledVector(d, -sg * reach(p0, -sg)), b = p1.clone().addScaledVector(d, sg * reach(p1, sg));
    const len = Math.max(0.3, a.distanceTo(b)), mid = a.clone().add(b).multiplyScalar(0.5), yy = t.height(mid.x, mid.z) - 0.1;
    still.push(new THREE.CylinderGeometry(0.18, 0.18, len, 10).rotateZ(Math.PI / 2).rotateY(-Math.atan2(A.nz, A.nx)).translate(mid.x - A.ux * 0.5, yy, mid.z - A.uz * 0.5));
  }
  if (still.length) g.add(solid(mergeGeometries(still.map((q) => q.toNonIndexed())), IRON_DARK));
  // the dark mouth under a grate, glowing hot as the pressure builds before it blows (its own material: each vent
  // glows on its own clock)
  const mouth = new THREE.MeshBasicMaterial({ color: 0x1a1320 }), dark = new THREE.Color(0x1a1320), hot = new THREE.Color(0xffb46a);
  const ringR = z.round ? Math.min(A.b1 - A.b0, A.a1 - A.a0) * 0.3 : 0.55; // (the grate's ring: the mouth under it as wide)
  if (!booster) for (const p of out) { const m = new THREE.Mesh(new THREE.CircleGeometry(ringR - 0.05, 16).rotateX(-Math.PI / 2), mouth); m.position.set(p.x, p.y + 0.025, p.z); ud(m).live = true; g.add(m); }
  // the steam, as the physics has it: a jet while the zone blows (a column rising from each grate, leaning the
  // push's way; a nozzle's along the floor the push's way), a wisp and a hiss the two ticks before, nothing off
  const per = 7, n = out.length * per;
  let power = 0, warn = 0, want = 0, hissed = false;
  if (z.every) state.timed.push({
    at: (step) => {
      const tk = Math.floor(step), on = onAt(z, tk), until = untilOn(z, tk);
      want = on ? 1 : 0;
      warn = !on && until <= 2 ? 1 - (until - 1) / 2 : 0;
      if (warn && !hissed && out.length) (hissed = true), sound("hiss", 0.3);
      if (!warn) hissed = false;
    },
  });
  else want = 1;
  const ph = Array.from({ length: n }, () => rand());
  let pressure = 0;
  animate(() => {
    power += (want - power) * 0.3;
    pressure += (Math.max(warn, want) - pressure) * 0.15;
    mouth.color.copy(dark).lerp(hot, pressure * 0.8);
  });
  add(g, puffs(t, ph.map((p, i) => (tt: number, P: THREE.Vector3) => {
    const o = out[Math.floor(i / per)], u = (tt * (0.8 + power * 1.2) + p) % 1, wisp = warn * 0.25 * (1 - power);
    const run = booster ? power * Math.min(L, 4) * u : power * 1.3 * u, rise = booster ? 0.35 + u * (0.3 + power * 0.6) : 0.15 + u * (0.6 + power * 2.2);
    P.set(o.x + A.ux * run + Math.sin(p * 9 + u * 4) * 0.12 * (1 + u), o.y + rise, o.z + A.uz * run + Math.cos(p * 7 + u * 3) * 0.12 * (1 + u));
    // (swelling as it climbs, then shrinking away: a billow, not a blob that stops)
    return (0.2 + u * 0.5) * (1 - u) ** 0.5 * Math.max(power, wisp) * 1.2;
  })));
  return g;
}

/** The magnetic vein: a seam of iron ore in the floor where it pulls to, and iron filings drawn toward it in trembling lines. */
function magnet(z: Zone, t: Terrain, s: Hole, rand: Rand) {
  const g = new THREE.Group(), A = axes(z), ok = (x: number, zz: number) => t.onGreen(x, zz) && !overVoid(s, x, zz);
  // the vein: lumps of dark metallic ore along the far edge (the push's way), rust between them
  const lumpsG: THREE.BufferGeometry[] = [];
  // (at the far edge, or in from it as far as the lane is: a zone running out past the lane's edge still shows its vein)
  for (let b = A.b0 + 0.3; b < A.b1 - 0.3; b += 0.45) {
    let a = A.a1 - 0.4, x = 0, zz = 0;
    for (; a > A.a0; a -= 0.25) {
      const j = (rand() - 0.5) * 0.3;
      (x = A.cx + A.ux * (a + j) + A.nx * b), (zz = A.cz + A.uz * (a + j) + A.nz * b);
      if (inZone(z, x, zz) && ok(x, zz)) break;
    }
    if (a <= A.a0) continue;
    // (low in the floor, their tops under 0.1 over it: the ball rolls over the vein, nothing of it stands in its way)
    const r = 0.14 + rand() * 0.14, geo = new THREE.OctahedronGeometry(r, 0).scale(1, 0.3, 1).rotateY(rand() * 6).translate(x, t.height(x, zz) + 0.01, zz);
    paint(geo, (_x, y, _z, c) => c.set(rand() < 0.2 ? RUST : 0x3c4252).multiplyScalar(0.8 + 2 * (y - t.height(x, zz))));
    lumpsG.push(geo.toNonIndexed());
  }
  if (lumpsG.length) {
    const m = mergeGeometries(lumpsG);
    m.computeVertexNormals();
    g.add(inked(m, once("magnet ore", () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0x9aa8c8 })), INK_THIN));
  }
  // the field: lines of iron filings from across the zone toward the vein, trembling on
  const lines: THREE.Vector3[] = [];
  for (let b = A.b0 + 0.5; b < A.b1 - 0.5; b += 1.1)
    for (let q = 0; q < 6; q++) {
      const a0 = A.a0 + (A.a1 - A.a0) * (0.15 + q * 0.12), x = A.cx + A.ux * a0 + A.nx * (b + Math.sin(q) * 0.2), zz = A.cz + A.uz * a0 + A.nz * (b + Math.sin(q) * 0.2);
      if (!inZone(z, x, zz) || !ok(x, zz)) continue;
      lines.push(new THREE.Vector3(x, t.height(x, zz) + 0.05, zz), new THREE.Vector3(x + A.ux * 0.35, t.height(x, zz) + 0.05, zz + A.uz * 0.35));
    }
  const filings = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x2a2e3a, transparent: true, opacity: 0.7 }));
  ud(filings).live = true;
  g.add(filings);
  animate((tt) => ((filings.material).opacity = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(tt * 2.2))));
  return g;
}

// ------------------------------------------------------------ the Heart

/** The Heart's chamber floor: crystal paving, and the Heart itself floating high over it, turning, lighting it. */
function heart(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), A = axes(z);
  const tones = [0x5fd8f0, 0x8fe8ff, 0xb27cff].map((c) => new THREE.Color(c).multiplyScalar(0.5));
  const { mesh } = patch(z, t, s, (x, zz, d, c) => c.copy(tones[mod(Math.floor(x * 0.8) + Math.floor(zz * 0.8), 3)]).lerp(new THREE.Color(0x2a2440), 0.4 * (1 - smoothstep(d / 1.5))));
  g.add(mesh);
  // (on the chamber's far rim from its entry: the zone's middle is the lane)
  g.add(heartCrystal(A.cx + A.ux * A.a1 * 0.9, A.cz + A.uz * A.a1 * 0.9, t.height(A.cx, A.cz), Math.min(A.b1 - A.b0, A.a1 - A.a0) * 0.12 + 0.8));
  return g;
}

/** The Heart itself: one huge cluster of crystals splayed up and out every way from its bed of rock and druse, rose at its heart and cyan at its points, standing at (x, z) (its foot at y0), glowing. */
export function heartCrystal(x: number, z: number, y0: number, R: number) {
  const g = new THREE.Group(), rand = seeded("heart" + x + z);
  const bed = boulder(rand, R * 1.4, R * 0.45, R * 1.3, 1);
  bed.position.y = R * 0.15;
  g.add(bed);
  const n = 14;
  for (let k = 0; k < n; k++) {
    // points over the upper half of a sphere (a Fibonacci spiral), long and short, of mixed forms
    const yy = 0.15 + 0.85 * (1 - (k + 0.5) / n), rr = Math.sqrt(1 - yy * yy), th = k * 2.399963;
    const dir = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr);
    const len = R * (k < 3 ? 2.4 + rand() : 1.1 + rand() * 1.3), kind = (["prism", "double", "prism", "needle"] as const)[k % 4];
    const c = gem(form(kind, R * (kind === "needle" ? 0.32 : 0.24), len), k % 3 === 0 ? MINES.rose : k % 3 === 1 ? MINES.cyan : MINES.amethyst);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    c.position.copy(dir).multiplyScalar(R * 0.3).setY(R * 0.4);
    g.add(c);
  }
  // a druse of small points round its foot
  for (let k = 0; k < 10; k++) {
    const a = rand() * 6, d = R * (1 + rand() * 0.5), p = gem(form("needle", R * 0.2, R * (0.3 + rand() * 0.4)), MINES.cyan);
    p.position.set(Math.cos(a) * d, R * 0.05, Math.sin(a) * d);
    p.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    g.add(p);
  }
  const hl = halo(R * 1.7, MINES.rose, 0.2);
  hl.position.y = R * 1.6;
  g.add(hl);
  g.position.set(x, y0, z);
  return g;
}

/**
 * Streams of lava side by side along x, n of them over a span L (T its
 * thickness across), falling from y 1 to 0 (scaled to the drop by the caller):
 * each a tube of radius r, its section wider along the fall than across it,
 * swelling and thinning as it falls, flaring at its foot into the pool. One
 * geometry, its crust FALLING (its flow runs down it).
 */
function streams(rand: Rand, L: number, T: number, n: number, r: number) {
  const RS = 10, VS = 12, pos: number[] = [], idx: number[] = [];
  for (let k = 0; k < n; k++) {
    const x0 = n === 1 ? 0 : ((k + 0.5) / n - 0.5) * L * 0.92 + (rand() - 0.5) * 0.2, ph = rand() * 6, rr = r * (0.8 + rand() * 0.4);
    const base = pos.length / 3;
    for (let v = 0; v <= VS; v++) {
      // (rounded off at its top: the tail of a pour, falling away, is a stream's end, not a cut)
      const y = v / VS, flare = (1 + 2.2 * (1 - y) ** 6) * (y > 0.85 ? Math.sqrt(Math.max(0.05, 1 - ((y - 0.85) / 0.15) ** 2)) : 1), swell = 1 + 0.18 * Math.sin(y * 9 + ph);
      const wx = rr * flare * swell * 1.25, wz = Math.min(T * 0.45, rr * 0.8) * flare * swell;
      const dx = 0.08 * Math.sin(y * 5 + ph);
      for (let a = 0; a < RS; a++) {
        const th = (a / RS) * Math.PI * 2;
        pos.push(x0 + dx + Math.cos(th) * wx, y === 0 ? -0.02 : y, Math.sin(th) * wz);
      }
    }
    for (let v = 0; v < VS; v++)
      for (let a = 0; a < RS; a++) {
        const p0 = base + v * RS + a, p1 = base + v * RS + ((a + 1) % RS), p2 = p0 + RS, p3 = p1 + RS;
        idx.push(p0, p2, p1, p1, p2, p3);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return crustBy(geo, () => FALLING);
}

// ------------------------------------------------------------ dispatch

export function zone(z: Zone, t: Terrain, s: Hole): THREE.Object3D | undefined {
  const rand = seeded("mz" + s.hole + z.min.join() + z.max.join() + z.skin);
  switch (z.skin) {
    case "lava": return z.every ? undefined : lava(z, t, s, rand);
    case "lava fall": return lavaFall(z, t, s, rand);
    case "shaft": return z.every ? undefined : shaft(z, t, s, rand);
    case "sump": return sump(z, t, s, rand);
    case "hot spring": return hotSpring(z, t, s, rand);
    case "ore bin": return oreBin(z, t, s, rand);
    case "rubble": return rubble(z, t, s, rand);
    case "ore": return orePile(z, t, s, rand);
    case "ballast": return ballast(z, t, s, rand);
    case "drip pool": return dripPool(z, t, s, rand);
    case "ice": return ice(z, t, s, rand);
    case "gold": return gold(z, t, s, rand);
    case "causeway": return causeway(z, t, s, rand);
    case "conveyor": return conveyor(z, t, s);
    case "incline": return incline(z, t, s);
    case "ledge bank": return ledgeBank(z, t, s);
    case "kicker": return kicker(z, t, s);
    case "rope bridge": return z.every && s.zones.find((q) => q.skin === "rope bridge" && q.every && q.min.join() === z.min.join() && q.max.join() === z.max.join()) !== z ? new THREE.Group() : ropeBridge(z, t, s, rand);
    case "vent": return steamJets(z, t, s, rand, false);
    case "booster": return steamJets(z, t, s, rand, true);
    case "magnet": return magnet(z, t, s, rand);
    case "heart": return heart(z, t, s);
    default: return undefined;
  }
}

// ------------------------------------------------------------ falling in
//
// The ball into each hazard of the mines, in its own way (worlds.ts fallIn:
// the replay has brought it down to where it meets the hazard, then steps
// this for its 1.4 s while the ball sinks and comes back): into lava a hiss,
// a flash of heat, sparks and embers flying and a curl of smoke; into the
// void or down a shaft pebbles tumbling after it and a breath of dust; into
// the sump a splash and drips; into a hot spring a splash in a burst of
// steam; into an ore bin a thud and a puff of ore dust.

const GRAV = 14;
/** Bits flung from a point: n of them (a geometry, a material), each its own way, falling back; instanced. */
function flung(at: THREE.Vector3, geo: THREE.BufferGeometry, mat: THREE.Material, n: number, speed: number, up: number, life: number, floor = -Infinity) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false;
  const bits = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
    return { p: at.clone(), v: new THREE.Vector3(Math.cos(a) * v, up * (0.6 + Math.random() * 0.6), Math.sin(a) * v), s: 0.6 + Math.random() * 0.8, spin: Math.random() * 12 };
  });
  const o = new THREE.Object3D();
  let last = 0;
  return {
    mesh: m,
    step(t: number) {
      const dt = Math.min(0.05, t - last);
      last = t;
      bits.forEach((b, i) => {
        b.v.y -= GRAV * dt;
        b.p.addScaledVector(b.v, dt);
        if (b.p.y < floor) (b.p.y = floor), b.v.set(b.v.x * 0.3, Math.abs(b.v.y) * 0.25, b.v.z * 0.3);
        o.position.copy(b.p);
        o.rotation.set(b.spin * t, b.spin * 0.6 * t, 0);
        o.scale.setScalar(b.s * Math.max(0, 1 - t / life));
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    },
  };
}
/** Puffs rising and swelling from a point, thinning out: smoke, steam, dust. */
function billow(at: THREE.Vector3, color: number, n: number, rise: number, size: number, life: number, opacity = 0.8) {
  const mat = new THREE.MeshToonMaterial({ color, transparent: true, depthWrite: false, opacity });
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, n);
  m.frustumCulled = false;
  const way = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + Math.random(), r: 0.2 + Math.random() * 0.5, d: Math.random() * 0.25 }));
  const o = new THREE.Object3D();
  return {
    mesh: m,
    step(t: number) {
      const k = Math.min(1, t / life), e = 1 - (1 - k) ** 2;
      way.forEach((w, i) => {
        const q = Math.max(0, Math.min(1, (t - w.d) / life)), eq = 1 - (1 - q) ** 2;
        o.position.set(at.x + Math.cos(w.a) * w.r * (0.4 + eq), at.y + eq * rise * (0.7 + (i % 3) * 0.2), at.z + Math.sin(w.a) * w.r * (0.4 + eq));
        o.scale.setScalar(size * (0.35 + eq) * (q > 0 ? 1 : 0));
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      mat.opacity = opacity * (1 - e);
      m.instanceMatrix.needsUpdate = true;
    },
  };
}
/** Rings running out over water from a point, one after another, fading. */
function ripples(at: THREE.Vector3, n: number, reach: number, life: number) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, depthWrite: false });
  const m = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.04, 3, 28).rotateX(Math.PI / 2), mat, n);
  m.frustumCulled = false;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = at.clone().setY(at.y + 0.03);
  return {
    mesh: m,
    step(t: number) {
      for (let i = 0; i < n; i++) {
        const k = Math.max(0, Math.min(1, (t - i * 0.18) / life));
        m.setMatrixAt(i, M.compose(P, Q, S.set(0.15 + k * reach, 1, 0.15 + k * reach)));
      }
      mat.opacity = 0.8 * Math.max(0, 1 - t / (life + n * 0.18));
      m.instanceMatrix.needsUpdate = true;
    },
  };
}
const fx = (parts: { mesh: THREE.Object3D; step(t: number): void }[]): FallIn => {
  const group = new THREE.Group();
  for (const p of parts) group.add(p.mesh);
  return { group, step: (t) => parts.forEach((p) => p.step(t)) };
};

const LAVA_DROP = share(new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
const EMBER = share(new THREE.MeshBasicMaterial({ color: 0xffb23b }));
const SPARK = share(new THREE.MeshBasicMaterial({ color: 0xfff0b8 }));
const PEBBLE = share(flat(0x5a5270));
const ORE_BIT = share(flat(0x6b5f78));
const DROP = share(flat(0x9fd6e6, { emissive: 0x3a7a90, emissiveIntensity: 0.4 }));

export function fallIn(_s: Hole, skin: string, at: THREE.Vector3, loud: boolean): FallIn | null {
  const say = (n: Parameters<typeof sound>[0], k?: number) => loud && sound(n, k);
  if (skin === "lava" || skin === "lava tide" || skin === "lava fall") {
    say("hiss");
    return fx([
      // a crown of molten drops thrown up and falling back
      flung(at, new THREE.SphereGeometry(0.13, 6, 4).scale(1, 1.5, 1), LAVA_DROP, 16, 2.2, 6.5, 1.25, at.y - 0.05),
      flung(at, new THREE.OctahedronGeometry(0.11), SPARK, 18, 3.4, 7.5, 0.9, at.y),
      flung(at, new THREE.IcosahedronGeometry(0.12, 0), EMBER, 12, 1.8, 5, 1.3, at.y),
      billow(at.clone().setY(at.y + 0.4), 0x4a3a44, 6, 2.4, 0.45, 1.4, 0.7),
    ]);
  }
  if (skin === "void" || skin === "shaft" || skin === "crumble") {
    say("drop");
    // pebbles knocked off after it, tumbling past; a breath of dust where it went
    const from = at.clone().setY(at.y + 5);
    return fx([
      flung(from, new THREE.DodecahedronGeometry(0.1, 0), PEBBLE, 7, 0.8, -1, 1.4),
      billow(at, 0x3a3450, 5, 1.2, 0.5, 1.2, 0.6),
    ]);
  }
  if (skin === "sump" || skin === "drip pool") {
    say("splash");
    return fx([
      flung(at, new THREE.SphereGeometry(0.07, 6, 4).scale(1, 1.6, 1), DROP, 12, 2.2, 6, 1.1, at.y - 0.1),
      ripples(at, 3, 1.2, 0.9),
    ]);
  }
  if (skin === "hot spring") {
    say("splash");
    say("steam");
    return fx([
      flung(at, new THREE.SphereGeometry(0.07, 6, 4), DROP, 10, 2, 5.5, 1, at.y - 0.1),
      ripples(at, 2, 1.1, 0.8),
      billow(at, 0xf2f7fb, 9, 3.2, 0.7, 1.4, 0.7),
    ]);
  }
  if (skin === "ore bin") {
    say("thud");
    return fx([
      flung(at, new THREE.DodecahedronGeometry(0.08, 0), ORE_BIT, 9, 1.8, 4, 1.3, at.y),
      billow(at, 0x8a7f98, 6, 1, 0.5, 1.1, 0.7),
    ]);
  }
  return null;
}
