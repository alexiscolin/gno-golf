// The Crystal Mines' own drawing of its lane pieces (mines.ts dispatches here
// after mines-rides.ts): every skin of the mines but the tunnels, loops, carts
// and the void (the world's), and a stroke's pulse pieces with their
// look-ahead (mines-pulses.ts). The timed bars that make the hero machines —
// the stamp battery and its water wheel, the pickaxe, the drill head, the
// steam pump's pistons, the strongroom's doors — are in mines-machines.ts.
//
// Everything here is the worlds' own toon: MeshToon in three bands with ink
// hulls, the rock carved in strata (vertex colours over the shared grain),
// the timber grained, the iron riveted and rusting at its edges, and the
// crystals lit from within (the world's crystal: a rim of light and a pulse on the
// scene's clock). What never moves is merged with the rest of the hole by the
// bake (one draw per material); a crystal's halo is a soft additive shell,
// merged too.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flat, relief } from "./materials";
import { animate, state } from "./state";
import { seeded, GRASS, type Rand } from "./common";
import { ud, type Hole } from "./data";
import { MINES, lit } from "./mines-kit";
import { once, GOLD, GOLD_DARK, goldMat, INK_THIN, inked, facets, knobbly, lumps, vnoise, paint, strata, boulder, gem, form, splay, glow, halo, TIMBER_DARK, TIMBER_LIGHT, IRON, IRON_DARK, beam, log, rivets, plate, TIMBER, solid, tinted } from "./mines-toon";
import { segDist, inZone, there, smoothstep } from "../terrain";
import { sound } from "../feel";
import * as machines from "./mines-machines";
import * as zones from "./mines-zones";
import * as pulses from "./mines-pulses";
import type { Terrain } from "../terrain";
import type { Extras, Post, Vec2, Zone } from "../types";
import type { Bar } from "./worlds";

// ---------------------------------------------------------------- walls
//
// A lone skinned wall (or a bar of them) as the mines draw it: rock, a crystal
// facet, an iron grate, a rope-and-plank edge, a rail guard. Each stands with
// its face on the wall's line, on the side the ball plays on (the body pushed
// away from the lane), and goes down past the lane's foot so it never floats
// over a drop.

/** A wall's frame: its ends, length, angle, the unit along it and the side the lane is on (+1/-1, 0 both/none). */
function frameOf(a: Vec2, b: Vec2, t: Terrain) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = -uz, nz = ux;
  let plus = 0, minus = 0;
  for (const u of [0.2, 0.5, 0.8]) {
    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    if (t.onGreen(x + nx * 0.7, z + nz * 0.7)) plus++;
    if (t.onGreen(x - nx * 0.7, z - nz * 0.7)) minus++;
  }
  // the side the lane is on: toward it the face, away from it the body
  const lane = plus > minus ? 1 : minus > plus ? -1 : 0;
  return { a, b, len, ang, ux, uz, nx, nz, lane };
}
type Frame = ReturnType<typeof frameOf>;

/**
 * Rock along a wall: a ridge of rock running the wall's length, its face on
 * the line (the lane's side), lumpy and uneven along its top, split in facets,
 * in strata; its ends run on past the wall's, into the next one's. A few
 * crystals grow out of its top toward the lane, chips lie at its foot.
 */
function rockface(f: Frame, t: Terrain, rand: Rand, s: Hole) {
  const g = new THREE.Group(), seed = rand() * 9;
  const back = f.lane ? -f.lane : 1, centred = !f.lane; // the body goes away from the lane (centred when both sides are lane)
  const S = Math.max(2, Math.round((f.len + 0.7) / 1.0)), pos: number[] = [], idx: number[] = [];
  // a section every unit: its profile across (from the face back) and up
  const prof = (h: number, T: number, k: number): [number, number][] => [[0.03, -1], [0.02, 0.5 * h], [0.3 * T, h], [0.75 * T, 0.9 * h + 0.08 * k], [T + 0.05, -1]];
  const P = 5;
  // (low where a pit lies at its face, a hot spring or a sump: the pool's own bank, not a wall across the water;
  // ramped down over a unit and a half either side, not stepped)
  const at = (i: number) => { const u = -0.35 + ((f.len + 0.7) * i) / S; return [f.a[0] + f.ux * u, f.a[1] + f.uz * u]; };
  const pits = Array.from({ length: S + 1 }, (_, i) => { const [x, z] = at(i); return !!f.lane && s.zones.some((q) => zones.open(q) != null && q.skin !== "shaft" && inZone(q, x + f.nx * f.lane * 0.6, z + f.nz * f.lane * 0.6)); });
  // (low by a pit, but still over the ball's top: the ball bounces off it there too)
  const step = (f.len + 0.7) / S, pitK = (i: number) => { let d = Infinity; pits.forEach((p, j) => { if (p) d = Math.min(d, Math.abs(i - j) * step); }); return d === 0 ? 0.5 : 0.5 + 0.5 * Math.min(1, d / 1.5); };
  // (low by a bumper standing at it: the post whole in front of it, never the rock seeming to be what kicked)
  const postK = (x: number, z: number) => { let d = Infinity; for (const p of s.posts) if (p.c && p.skin.includes("bumper")) d = Math.min(d, Math.hypot(x - p.c[0], z - p.c[1]) - (p.r || 0.5)); return 0.2 + 0.8 * Math.min(1, Math.max(0, (d - 0.4) / 1.2)); };
  // (where the ball would fall: the void, a shaft, a crumbling floor; nothing of the rock over it)
  const drop = (x: number, z: number) => zones.overVoid(s, x, z) || s.zones.some((q) => (q.skin === "shaft" || q.skin === "crumble") && !q.every && inZone(q, x, z));
  for (let i = 0; i <= S; i++) {
    // (its ends run on past the wall's, but not out over a drop)
    const u0 = -0.35 + ((f.len + 0.7) * i) / S, u = (u0 < 0 || u0 > f.len) && drop(f.a[0] + f.ux * u0, f.a[1] + f.uz * u0) ? Math.min(Math.max(u0, 0), f.len) : u0, x0 = f.a[0] + f.ux * u, z0 = f.a[1] + f.uz * u, y0 = t.height(Math.min(Math.max(x0, 0), s.board.w), Math.min(Math.max(z0, 0), s.board.h));
    // (thin where its back is over a drop: a parapet on the chasm's rim, its back ending at the drop's edge, nothing
    // of it standing out over it)
    // (a wall with the lane on neither side stands centred on its line: the room either side of it, half each)
    const roomOn = (sg: number) => { for (let e = 0.05; e < 1.5; e += 0.05) if (drop(x0 + f.nx * sg * e, z0 + f.nz * sg * e)) return e; return 1.5; };
    const room = centred ? 2 * Math.min(roomOn(1), roomOn(-1)) : roomOn(back);
    const T0 = Math.min(1.05 + 0.3 * (0.5 + 0.5 * lumps(0, u * 0.7, 0, seed + 3)), Math.max(0.1, room - 0.04)), rim = room < 1.5;
    // (low round the tee: the camera stands behind it, its foreground not a wall of rock)
    const tee = Math.hypot(x0 - s.start[0], z0 - s.start[1]), low = 0.3 + 0.7 * Math.min(1, Math.max(0, (tee - 5) / 2.5));
    // (a parapet on the chasm's rim: lower, and lumpier, a lip of rock rather than a slab)
    const h = (1.05 + 0.5 * (0.5 + 0.5 * lumps(u * 0.9, 0, 0, seed))) * Math.min(pitK(i), postK(x0, z0)) * low * (rim ? 0.55 : 1), T = rim ? Math.min(0.5, T0) : T0, k = lumps(u * 2.3, 1, 0, seed) * (rim ? 2.5 : 1);
    for (const [a, yy] of prof(h, T, k)) {
      const across = centred ? a - T / 2 : a, foot = Math.min(y0, GRASS) - 0.5;
      const y = yy < 0 ? foot : y0 + yy + 0.06 * lumps(u * 3.1, yy * 2, a, seed);
      pos.push(x0 + f.nx * back * across, y, z0 + f.nz * back * across);
    }
  }
  for (let i = 0; i < S; i++)
    for (let q = 0; q + 1 < P; q++) {
      const a = i * P + q, b = a + 1, c = a + P, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  // the ends closed: a fan over each end's profile
  for (const e of [0, S]) for (let q = 1; q + 1 < P; q++) e ? idx.push(e * P, e * P + q, e * P + q + 1) : idx.push(0, q + 1, q);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(back < 0 ? idx : idx.map((_, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]]));
  paint(geo, (x, y, z, c) => strata(y + 0.6, x, z, 2.2, c, seed));
  g.add(facets(geo, relief()));
  // loose rock piled against its face, up to the ball's height and a little over: a scree face, soft to strike (it
  // gives: 0.35), not a smooth hard wall; each chunk behind the line (its front on it), none over a drop
  if (f.lane) {
    const scree: THREE.BufferGeometry[] = [];
    for (let u = 0.2; u < f.len - 0.1; u += 0.55 + rand() * 0.25) {
      const r = 0.13 + rand() * 0.14, off = r * 0.85 + 0.02, x = f.a[0] + f.ux * u + f.nx * back * off, z = f.a[1] + f.uz * u + f.nz * back * off;
      if (drop(x, z) || postK(x, z) < 0.9) continue;
      const y = t.height(x, z) + r * 0.35 + (rand() < 0.4 ? r * 0.9 : 0);
      scree.push(knobbly(new THREE.IcosahedronGeometry(r, 0), rand, 0.2).scale(1, 0.75, 1).rotateY(rand() * 6).translate(x, y, z).toNonIndexed());
    }
    if (scree.length) {
      // (faceted, no ink of their own: the face's ink outlines the pile; a few hundred triangles a hole)
      const sg = mergeGeometries(scree);
      paint(sg, (x, y, z, c) => strata(y + 0.6, x, z, 2.2, c, seed));
      sg.computeVertexNormals();
      g.add(new THREE.Mesh(sg, relief()));
    }
  }
  // chips of fallen rock along its foot, behind it
  const chips: THREE.BufferGeometry[] = [];
  for (let k = 0; k < Math.round(f.len * 0.5); k++) {
    // (on its far side, off the lane: nothing loose where the ball rolls)
    const u = rand(), side = -(f.lane || 1), x = f.a[0] + (f.b[0] - f.a[0]) * u + f.nx * side * (1.2 + rand() * 0.4), z = f.a[1] + (f.b[1] - f.a[1]) * u + f.nz * side * (1.2 + rand() * 0.4);
    if (t.onGreen(x, z) || drop(x, z)) continue;
    const r = 0.05 + rand() * 0.08;
    chips.push(new THREE.DodecahedronGeometry(r, 0).scale(1, 0.5, 1).translate(x, t.height(x, z) + r * 0.3, z)); // (flat: under 0.1 over the floor)
  }
  if (chips.length) g.add(tinted(mergeGeometries(chips), 0x4f486a));
  return g;
}

/**
 * A crystal wall (the geode's facets, the Heart's ring): a low plinth of rock
 * along the wall's line, and out of it crystals of every form splayed in
 * clusters, uneven, graded in colour, lit from within — kicking (singing)
 * ones bright cyan and rose, dull ones smoky violet. The line is still the
 * wall: the clusters stand on it, leaning away from the lane.
 */
function facetWall(f: Frame, t: Terrain, rand: Rand, singing: boolean, s: Hole) {
  const g = new THREE.Group();
  const hues = singing ? [MINES.cyan, MINES.cyan, 0x8ff6ff, MINES.rose] : [0x8e86b8, 0x7a72a6, MINES.amethyst];
  const back = f.lane ? -f.lane : 0;
  if (!back) {
    g.add(crystalRidge(f, t, rand, hues));
    return g;
  }
  // an uneven rhythm along the wall: now and then a tall spire cluster, between
  // them low tabular plates and druse (a bed of small points)
  for (let u = 0.3 + rand() * 0.6; u < f.len - 0.2; ) {
    const kind = rand(), x = f.a[0] + f.ux * u, z = f.a[1] + f.uz * u, y = t.height(x, z);
    const spire = kind < 0.22, plates = !spire && kind < 0.55;
    const size = spire ? 2.4 + rand() * 1.4 : plates ? 0.7 + rand() * 0.4 : 0.45 + rand() * 0.25;
    // (a spire's crystals close and near upright: none of them reaching back over the line to the lane)
    const c = spire ? splay(rand, size, 0.35, hues, 3, ["prism", "double", "prism"], 0.18)
      : plates ? splay(rand, size, 0.45, hues, 2, ["plate", "plate", "cube"])
      : splay(rand, size, 0.5, hues, 2, ["needle", "needle", "prism"], 0.85, false); // (druse: small, un-inked)
    // (behind the line, leaning away from the lane: none of it over the lane; and in closer to the line where a drop
    // lies behind it, none of it out over the drop)
    const lean0 = spire ? 0.15 : 0.3, off0 = spire ? 0.7 : 0.45, reachBack = size * 0.5 + off0;
    let room = reachBack;
    for (let e = 0.1; e <= reachBack; e += 0.1) if (zones.overVoid(s, x + f.nx * back * e, z + f.nz * back * e)) { room = e; break; }
    const off = Math.min(off0, Math.max(0.05, room - size * 0.35)), lean = room < reachBack ? 0 : lean0;
    c.position.set(x + f.nx * back * off, y - 0.05, z + f.nz * back * off);
    c.rotation.set(-f.nz * back * lean, rand() * 6, f.nx * back * lean);
    g.add(c);
    if (singing && spire) {
      const hl = halo(0.5 + size * 0.2, MINES.cyan, 0.1);
      hl.position.set(x, y + size * 0.6, z);
      g.add(hl);
    }
    u += spire ? 2.4 + rand() * 1.2 : 1.3 + rand() * 0.8;
  }
  // the rock plinth it grows out of, low along the line (narrow: never under a ball touching the wall)
  const foot = boulder(rand, f.len / 2 + 0.3, 0.3, 0.32, 1);
  foot.position.set((f.a[0] + f.b[0]) / 2 + f.nx * back * 0.2, t.height((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2) - 0.02, (f.a[1] + f.b[1]) / 2 + f.nz * back * 0.2);
  foot.rotation.y = -f.ang;
  g.add(foot);
  return g;
}

/**
 * A crystal wall standing in the lane (lane both sides): one crystal vein
 * along the line, a faceted ridge rising and falling as it goes, broken into
 * blocks, and out of it crystals of every size crowding along it, leaning
 * along the line (never out over the lane) — a wall of crystal, not a row of
 * posts.
 */
function crystalRidge(f: Frame, t: Terrain, rand: Rand, hues: readonly number[]) {
  const g = new THREE.Group(), seed = rand() * 9, n = Math.max(2, Math.round(f.len / 0.45)), W = 0.26;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = (f.len * i) / n, x0 = f.a[0] + f.ux * u, z0 = f.a[1] + f.uz * u, y0 = t.height(x0, z0);
    // (its height uneven, and lower at its ends where it meets the next wall's)
    const h = (0.45 + 0.4 * (0.5 + 0.5 * lumps(u * 0.8, 0, 0, seed))) * Math.min(1, 0.55 + Math.min(u, f.len - u));
    for (const [a, yy] of [[-W, -0.1], [-W * 0.7, h * 0.7], [0, h], [W * 0.7, h * 0.7], [W, -0.1]] as const) pos.push(x0 + f.nx * a, y0 + yy, z0 + f.nz * a);
  }
  for (let i = 0; i < n; i++) for (let q = 0; q < 4; q++) { const a = i * 5 + q, b = a + 1, c = a + 5, d = c + 1; idx.push(a, b, c, b, d, c); }
  for (const e of [0, n]) for (let q = 1; q < 4; q++) e ? idx.push(e * 5, e * 5 + q + 1, e * 5 + q) : idx.push(0, q, q + 1);
  const ridge = new THREE.BufferGeometry();
  ridge.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  ridge.setIndex(idx);
  g.add(gem(ridge, hues[0]));
  // the crystals along it: close, uneven, of every size, leaning along the line
  for (let u = 0.2 + rand() * 0.3; u < f.len - 0.15; ) {
    const x = f.a[0] + f.ux * u, z = f.a[1] + f.uz * u, big = rand() < 0.25, size = big ? 1.1 + rand() * 0.9 : 0.35 + rand() * 0.45;
    // (the small ones un-inked: the ridge's outline carries them)
    const c = splay(rand, size, 0.18, hues, big ? 2 : 1, big ? ["prism", "double", "prism"] : ["prism", "needle", "double", "plate"], 0.12, big);
    // (tilted along the line only, about the axis across it: never out over the lane)
    const tilt = new THREE.Group();
    tilt.add(c);
    tilt.position.set(x, t.height(x, z) - 0.05, z);
    tilt.quaternion.setFromAxisAngle(new THREE.Vector3(f.nx, 0, f.nz), (rand() - 0.5) * 0.6);
    g.add(tilt);
    u += big ? 1.2 + rand() * 1.0 : 0.6 + rand() * 0.6;
  }
  return g;
}

/** An iron grate: square bars between two flat rails, riveted, on a stone sill. */
function grate(f: Frame, t: Terrain) {
  const g = new THREE.Group(), H = 1.25;
  const x = (f.a[0] + f.b[0]) / 2, z = (f.a[1] + f.b[1]) / 2, y = t.height(x, z);
  const inner = new THREE.Group();
  const sill = beam(f.len + 0.3, 0.22, 0.5, 0x6d6680);
  sill.position.y = 0.05;
  inner.add(sill);
  for (const hy of [0.45, H - 0.08]) {
    const rail = plate(f.len + 0.1, 0.12, 0.16);
    rail.position.y = hy;
    inner.add(rail);
  }
  const bars: THREE.BufferGeometry[] = [], n = Math.max(2, Math.round(f.len / 0.32));
  for (let k = 0; k <= n; k++) {
    const u = -f.len / 2 + (f.len * k) / n;
    // each bar ending in a spike over the top rail
    bars.push(new THREE.BoxGeometry(0.07, H + 0.05, 0.07).translate(u, (H + 0.05) / 2 + 0.1, 0), new THREE.ConeGeometry(0.06, 0.16, 4).translate(u, H + 0.23, 0));
  }
  inner.add(solid(mergeGeometries(bars), IRON));
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k += 2) for (const hy of [0.45, H - 0.08]) pts.push(new THREE.Vector3(-f.len / 2 + (f.len * k) / n, hy, 0.09));
  inner.add(rivets(pts, 0.035));
  inner.rotation.y = -f.ang;
  g.add(inner);
  g.position.set(x, y, z);
  return g;
}

/** A rope-and-plank edge: posts along it, two ropes sagging between them, a toe board. */
function ropeEdge(f: Frame, t: Terrain, rand: Rand, s: Hole) {
  const g = new THREE.Group(), n = Math.max(1, Math.round(f.len / 1.6));
  const at = (u: number, h: number) => new THREE.Vector3(f.a[0] + (f.b[0] - f.a[0]) * u, t.height(f.a[0] + (f.b[0] - f.a[0]) * u, f.a[1] + (f.b[1] - f.a[1]) * u) + h, f.a[1] + (f.b[1] - f.a[1]) * u);
  for (let k = 0; k <= n; k++) {
    const p = at(k / n, 0), post = log(0.09, 1.25, TIMBER_DARK);
    post.position.copy(p).setY(p.y - 0.15);
    post.rotation.z = (rand() - 0.5) * 0.08;
    g.add(post);
  }
  const ropes: THREE.BufferGeometry[] = [];
  for (const h of [0.55, 1.0])
    for (let k = 0; k < n; k++) {
      const p = at(k / n, h), q = at((k + 1) / n, h), mid = p.clone().lerp(q, 0.5).setY((p.y + q.y) / 2 - 0.12);
      ropes.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p, mid, q), 6, 0.035, 3, false));
    }
  const ropeGeo = mergeGeometries(ropes);
  // (along a rope bridge whose timed hills push across it: the ropes swinging hard the push's way on its clock, the
  // push the deck can only hint at, flat as the ball rides it)
  const mx = (f.a[0] + f.b[0]) / 2, mz = (f.a[1] + f.b[1]) / 2;
  const hills = s.zones.filter((q) => q.skin === "rope bridge" && q.every && [0.25, 0.5, 0.75].some((u) => inZone(q, f.a[0] + (f.b[0] - f.a[0]) * u + f.nx * 0.5, f.a[1] + (f.b[1] - f.a[1]) * u + f.nz * 0.5) || inZone(q, f.a[0] + (f.b[0] - f.a[0]) * u - f.nx * 0.5, f.a[1] + (f.b[1] - f.a[1]) * u - f.nz * 0.5)));
  if (hills.length) {
    // (swung about the line through its posts' feet: the ropes' middles out the push's way)
    const swing = new THREE.Group(), base = new THREE.Vector3(mx, t.height(mx, mz), mz), axis = new THREE.Vector3(f.ux, 0, f.uz);
    swing.add(solid(ropeGeo.translate(-base.x, -base.y, -base.z), 0xc9a86a));
    swing.position.copy(base);
    ud(swing).live = true;
    g.add(swing);
    const push = (k: number) => { const on = hills.find((q) => there(k, q.every, q.on, q.phase)); return on ? Math.sign(on.vec[0] * f.nx + on.vec[1] * f.nz) : 0; };
    state.timed.push({
      at: (step) => {
        const k = Math.floor(step), fr = step - k, now = push(k), was = push(k - 1), lean = was + (now - was) * smoothstep(Math.min(1, fr / 0.5));
        swing.quaternion.setFromAxisAngle(axis, lean * 0.45);
        if (now !== was && fr < 0.05) sound("stretch", 0.2); // (the ropes taking the strain)
      },
    });
  } else g.add(solid(ropeGeo, 0xc9a86a));
  const m = at(0.5, 0.1), board = solid(new THREE.BoxGeometry(f.len, 0.16, 0.06), TIMBER_LIGHT);
  board.position.copy(m);
  board.rotation.y = -f.ang;
  g.add(board);
  return g;
}

/** A rail guard: a steel rail (its I profile) on short iron posts, bolted, rust at its seams. */
function railguard(f: Frame, t: Terrain, s: Hole) {
  const g = new THREE.Group(), n = Math.max(1, Math.round(f.len / 2.4));
  const x = (f.a[0] + f.b[0]) / 2, z = (f.a[1] + f.b[1]) / 2, y = t.height(x, z);
  const inner = new THREE.Group(), H = 0.62;
  // the rail on its posts: its I profile (head, web, foot) run along the wall
  const sh = new THREE.Shape([[-0.12, 0], [0.12, 0], [0.12, 0.07], [0.035, 0.1], [0.035, 0.26], [0.1, 0.29], [0.1, 0.38], [-0.1, 0.38], [-0.1, 0.29], [-0.035, 0.26], [-0.035, 0.1], [-0.12, 0.07]].map(([a, b]) => new THREE.Vector2(a, b)));
  const rail = new THREE.ExtrudeGeometry(sh, { depth: f.len + 0.05, bevelEnabled: false }).translate(0, 0, -(f.len + 0.05) / 2).rotateY(Math.PI / 2).translate(0, H - 0.38, 0);
  paint(rail, (_x, yy, _z, c) => c.set(yy > H - 0.08 ? 0xa4aab6 : 0x6e7382));
  inner.add(inked(rail, relief(), INK_THIN));
  const posts: THREE.BufferGeometry[] = [];
  for (let k = 0; k <= n; k++) posts.push(new THREE.BoxGeometry(0.14, H - 0.35, 0.14).translate(-f.len / 2 + (f.len * k) / n, (H - 0.35) / 2, -0.02));
  inner.add(solid(mergeGeometries(posts), IRON_DARK));
  // a free end (no other wall meets it: a chicane's tip in the lane) ends on a stout post with its buffer, not cut square
  const meets = (p: Vec2) => s.walls.filter((w) => Math.hypot(w.a[0] - p[0], w.a[1] - p[1]) < 0.05 || Math.hypot(w.b[0] - p[0], w.b[1] - p[1]) < 0.05).length > 1;
  for (const [sd, p] of [[-1, f.a], [1, f.b]] as const) {
    if (meets(p)) continue;
    const end = beam(0.3, H + 0.14, 0.3, IRON_DARK);
    end.position.set((sd * (f.len + 0.05)) / 2, (H + 0.14) / 2, 0);
    const stop = plate(0.1, 0.26, 0.34, 0xc9a24a);
    stop.position.set((sd * (f.len + 0.05)) / 2 + sd * 0.19, H - 0.12, 0);
    inner.add(end, stop);
  }
  inner.rotation.y = -f.ang;
  g.add(inner);
  g.position.set(x, y, z);
  return g;
}

/** A skinned wall (one, or the four of a bar) as the mines draw it; undefined for a skin not ours. */
function wall(bar: Bar, t: Terrain, s: Hole) {
  const skin = bar.skin, rand = seeded("mw" + s.hole + bar.c.join());
  if (bar.timing || skin === "drill" || skin === "rockfall" || skin === "dynamite" || skin === "vault door" || skin === "turntable" || skin === "boulder" || skin === "safe door")
    return machines.bar(bar, t, s);
  const draw: Record<string, (f: Frame) => THREE.Object3D> = {
    rockface: (f) => rockface(f, t, rand, s),
    crystal: (f) => facetWall(f, t, rand, false, s),
    "crystal bumper": (f) => facetWall(f, t, rand, true, s),
    grate: (f) => grate(f, t),
    rope: (f) => ropeEdge(f, t, rand, s),
    railguard: (f) => railguard(f, t, s),
  };
  if (!draw[skin]) return undefined;
  const g = new THREE.Group();
  // a bar is drawn as its two long sides (its ends are its thickness); a lone wall as itself
  // (not one lying wholly in an untimed hazard: no ball reaches it, it would stand over the drop; but one along a
  // deck laid over it, a rope bridge's side, stands: the ball rolls by it on the deck)
  const cover = (x: number, z: number) => s.zones.some((q) => (q.kind === "surface" || q.kind === "tunnel" || q.skin === "rope bridge") && inZone(q, x, z));
  const inHazard = (x: number, z: number) => s.zones.some((q) => q.kind === "hazard" && !q.every && q.skin !== "void" && inZone(q, x, z));
  const beside = (w: { a: Vec2; b: Vec2 }, u: number) => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, nx = -(w.b[1] - w.a[1]) / L, nz = (w.b[0] - w.a[0]) / L, x = w.a[0] + (w.b[0] - w.a[0]) * u, z = w.a[1] + (w.b[1] - w.a[1]) * u; return cover(x + nx * 0.25, z + nz * 0.25) || cover(x - nx * 0.25, z - nz * 0.25); };
  const ws = (bar.walls.length === 4 ? longSides(bar) : bar.walls).filter((w) => ![0.1, 0.5, 0.9].every((u) => inHazard(w.a[0] + (w.b[0] - w.a[0]) * u, w.a[1] + (w.b[1] - w.a[1]) * u) && !beside(w, u)));
  // (all of its line: a wall is a collider, drawn where the chain has it, over a drop too; only what it carries
  // behind it keeps off a drop: a rock face's body, its chips, a crystal wall's clusters)
  for (const w of ws) g.add(draw[skin](frameOf(w.a, w.b, t)));
  if (skin === "crystal bumper") for (const w of ws) singer(s, t, { a: w.a, b: w.b }, g);
  return g;
}
/** A bar's two long sides. */
function longSides(bar: Bar) {
  const [w0, w1, w2, w3] = bar.walls, l = (w: { a: Vec2; b: Vec2 }) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  return l(w0) >= l(w1) ? [w0, w2] : [w1, w3];
}

// ---------------------------------------------------------------- posts

/** A stalagmite filling the post's circle: dripstone rising in rings to a wet point, strata, a flowstone foot. */
function stalagmite(r: number, rand: Rand) {
  const g = new THREE.Group();
  const H = 1.3 + r * 1.6 + rand() * 0.6, pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 7; k++) {
    const v = k / 7;
    // a taper with the rings of old drips on it
    const rr = r * (1 - v) ** 0.85 * (1 + 0.08 * Math.sin(v * 19 + rand())) + 0.04;
    pts.push(new THREE.Vector2(k === 7 ? 0.001 : rr, v * H - 0.2));
  }
  const geo = knobbly(new THREE.LatheGeometry(pts, 7), rand, r * 0.1, 2.2, true);
  const top = new THREE.Color(0xc9bfd8), seed = rand() * 5;
  paint(geo, (x, y, z, c) => {
    strata(y + 0.4, x, z, H, c, seed);
    if (y > H * 0.72) c.lerp(top, (y - H * 0.72) / (H * 0.28) * 0.7); // the pale, wet point
  });
  const body = facets(geo, relief());
  body.rotation.set((rand() - 0.5) * 0.08, rand() * 3, (rand() - 0.5) * 0.08);
  g.add(body);
  // a drop hanging at the point, catching the light
  const drop = gem(new THREE.SphereGeometry(0.06, 6, 4), 0xbff6ff);
  drop.position.set(0, H - 0.18, 0);
  g.add(drop);
  // pebbles and a lip of flowstone round its foot, inside the circle
  const peb: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = rand() * Math.PI * 2, d = r * (0.85 + rand() * 0.15), rr = 0.05 + rand() * 0.07;
    peb.push(new THREE.DodecahedronGeometry(rr, 0).translate(Math.cos(a) * d, rr * 0.3, Math.sin(a) * d));
  }
  g.add(tinted(mergeGeometries(peb), 0x6d6388));
  return g;
}

/** A timber pit prop: a buttress of two squared timbers leaning together into a cap, a brace across them, iron-strapped, wedged on a sill on a stone footing as wide as its post. */
function prop(r: number, rand: Rand) {
  const g = new THREE.Group(), H = 2.2 + rand() * 0.3, w = Math.max(0.22, r * 0.45), spread = Math.max(0.25, r - w * 0.6);
  const legs: THREE.BufferGeometry[] = [];
  const timber = (p: THREE.Vector3, q: THREE.Vector3, ww: number) => {
    const geo = new THREE.BoxGeometry(p.distanceTo(q) + ww * 0.3, ww, ww);
    geo.applyMatrix4(new THREE.Matrix4().compose(p.clone().add(q).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), q.clone().sub(p).normalize()), new THREE.Vector3(1, 1, 1)));
    legs.push(geo);
  };
  const top = new THREE.Vector3(0, H, 0);
  // (standing on its footing, 0.55 up)
  timber(new THREE.Vector3(-spread * 0.8, 0.55, 0), top, w);
  timber(new THREE.Vector3(spread * 0.8, 0.55, 0), top, w);
  timber(new THREE.Vector3(-spread * 0.5, H * 0.55, 0), new THREE.Vector3(spread * 0.5, H * 0.55, 0), w * 0.7);
  timber(new THREE.Vector3(-spread * 0.8 - 0.1, 0.62, 0), new THREE.Vector3(spread * 0.8 + 0.1, 0.62, 0), w * 0.8); // the sill
  const geo = mergeGeometries(legs);
  paint(geo, (x, y, z, c) => c.set(TIMBER).multiplyScalar(0.7 + 0.3 * (y / H) + 0.06 * Math.sin((x + z) * 9)));
  g.add(inked(geo, relief()));
  const cap = plate(w * 1.3, w * 0.7, w * 1.3, IRON_DARK);
  cap.position.y = H + 0.05;
  g.add(cap);
  for (const sd of [-1, 1]) {
    const strap = plate(0.08, w * 1.3, w * 1.2, IRON);
    strap.position.set(sd * spread * 0.5, H * 0.55, 0);
    g.add(strap);
  }
  g.rotation.y = rand() * Math.PI;
  // its footing: a drum of stone as wide as the post plays, at the ball's height (what the ball strikes is stone)
  const foot = knobbly(new THREE.CylinderGeometry(r * 0.97, r, 0.55, 12, 2), rand, 0.03, 3);
  paint(foot, (x, y, z, c) => strata(y + 0.8, x, z, 1.2, c, 2));
  g.add(inked(foot.translate(0, 0.27, 0), relief(), INK_THIN));
  return g;
}

/** A buffer stop: a timber frame braced back, two red-banded sprung buffers facing the lane. */
function buffer(r: number, face: number) {
  const g = new THREE.Group(), inner = new THREE.Group();
  const post = beam(0.3, 1.1, 0.3, TIMBER_DARK);
  post.position.set(0, 0.55, 0);
  const cross = beam(0.28, 0.32, r * 2.2, 0xb8433a);
  cross.position.set(0.08, 0.72, 0);
  const brace = beam(1.1, 0.2, 0.22, TIMBER_DARK);
  brace.position.set(-0.4, 0.4, 0);
  brace.rotation.z = -0.6;
  inner.add(post, cross, brace);
  for (const sz of [-1, 1]) {
    const stem = solid(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8).rotateZ(Math.PI / 2), IRON);
    stem.position.set(0.4, 0.72, sz * r * 0.6);
    const head = solid(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14).rotateZ(Math.PI / 2), IRON_DARK);
    head.position.set(0.62, 0.72, sz * r * 0.6);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.03, 14, 1, true).rotateZ(Math.PI / 2), flat(0xf1d24a, { side: THREE.DoubleSide }));
    stripe.position.set(0.62, 0.72, sz * r * 0.6);
    inner.add(stem, head, stripe);
  }
  inner.rotation.y = face;
  inner.scale.setScalar(Math.min(1, r / 0.95)); // (inside its post's circle)
  g.add(inner);
  // a ring of sandbags round its foot, two courses, as wide as the post plays at the ball's height: it is soft
  const bags: THREE.BufferGeometry[] = [];
  const br = r;
  for (const [course, n, rr] of [[0, 9, br * 0.74], [1, 8, br * 0.68]] as const)
    for (let k = 0; k < n; k++) {
      const a = ((k + course * 0.5) / n) * Math.PI * 2, len = (2 * Math.PI * rr) / n + 0.06;
      bags.push(new THREE.SphereGeometry(1, 8, 5).scale(len / 2, 0.14, br * 0.2 + 0.06).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * rr, 0.13 + course * 0.24, Math.sin(a) * rr).toNonIndexed());
    }
  if (!bags.length) return g;
  const bg = mergeGeometries(bags.map((q) => (q.deleteAttribute("uv"), q)));
  paint(bg, (x, y, z, c) => c.set(0xb49c74).multiplyScalar(0.85 + 0.25 * Math.sin(x * 11 + z * 7) * 0.4 + y * 0.3));
  bg.computeVertexNormals();
  g.add(inked(bg, relief(), INK_THIN));
  return g;
}

/** A crystal bumper as a post: a cluster filling the circle, on its rock, glowing. */
function crystalPost(r: number, rand: Rand) {
  const g = new THREE.Group();
  // (its rock as wide as the post plays at the ball's height, and ringed there with crystal points: what kicks is
  // crystal, all round)
  const rock = boulder(rand, r * 1.02, 0.62, r * 1.02, 1);
  rock.position.y = 0.12;
  g.add(rock);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rand() * 0.3, p = gem(form("prism", 0.16, 0.34 + rand() * 0.12), k % 3 ? MINES.cyan : 0x8ff6ff, false);
    p.position.set(Math.cos(a) * r * 0.86, 0.1, Math.sin(a) * r * 0.86);
    p.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    g.add(p);
  }
  // a druse of points on its rock round a big splayed cluster
  const c = splay(rand, 1.3 + r * 0.9, r * 0.5, [MINES.cyan, MINES.cyan, 0x8ff6ff, MINES.amethyst], 4, undefined, 0.3);
  c.position.y = 0.5;
  g.add(c);
  for (let k = 0; k < 3; k++) {
    const a = rand() * 6, d = r * (0.55 + rand() * 0.3), p = gem(form("needle", 0.25, 0.25 + rand() * 0.25), MINES.cyan, false);
    p.position.set(Math.cos(a) * d, 0.25, Math.sin(a) * d);
    p.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    g.add(p);
  }
  // (its light round its crystals, high: not a veil laid over the lane round it)
  const hl = halo(r * 0.6 + 0.45, MINES.cyan, 0.16);
  hl.position.y = 1.5 + r * 0.5;
  g.add(hl);
  return g;
}

/**
 * A jewel bumper: the strongroom's riches as a post (inside its circle) —
 * an iron-bound strongbox with its lid thrown back, heaped with coin, a big
 * cut jewel on top; or a stack of gold ingots crossed course on course, the
 * jewel set on its top. Deep, saturated stones, lit from within.
 */
const GEMS = [0xe0306a, 0x1fb070, 0x3a5af0, 0xd09a2a] as const;
function jewel(r: number, rand: Rand, k: number) {
  const g = new THREE.Group(), c = GEMS[k % GEMS.length];
  // (on a heap of spilt coin as wide as the post plays at the ball's height)
  const spill = new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(r * 1.02, 0.5, r * 1.02);
  paint(spill, (x, _y, zz, cc) => cc.set(vnoise(x * 7, zz * 7) > 0.5 ? GOLD : GOLD_DARK));
  g.add(inked(spill, goldMat(), INK_THIN));
  let top = 0;
  if (k % 2 === 0) {
    // the strongbox: timber, iron bands and corners, its lock, the lid open behind
    const W = r * 1.5, D = r * 1.05, H = 0.75;
    const box = beam(W, H, D, TIMBER_DARK);
    box.position.y = H / 2;
    g.add(box);
    for (const u of [-0.32, 0.32]) {
      const band = plate(0.12, H + 0.04, D + 0.06, IRON_DARK);
      band.position.set(u * W, H / 2, 0);
      g.add(band);
    }
    const lock = plate(0.22, 0.26, 0.06, BRASS_);
    lock.position.set(0, H * 0.7, D / 2 + 0.04);
    g.add(lock);
    const lid = beam(W, 0.12, D, TIMBER_DARK);
    lid.position.set(0, H + D / 2 - 0.05, -D / 2 - 0.02);
    lid.rotation.x = -1.35;
    g.add(lid);
    // heaped with coin, domed over its rim
    const heap = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(W * 0.48, 0.28, D * 0.46).translate(0, H - 0.02, 0);
    paint(heap, (x, _y, zz, cc) => cc.set(vnoise(x * 9, zz * 9) > 0.5 ? GOLD : GOLD_DARK));
    g.add(inked(heap, goldMat(), INK_THIN));
    top = H + 0.25;
  } else {
    // ingots stacked course on course, crossed, a narrower course each time
    const ingots: THREE.BufferGeometry[] = [];
    const ingot = () => new THREE.CylinderGeometry(0.19, 0.26, 0.16, 4).rotateY(Math.PI / 4).scale(1.8, 1, 0.7);
    for (let c2 = 0; c2 < 4; c2++) {
      const n = 3 - Math.floor(c2 / 2), turn = c2 % 2 ? Math.PI / 2 : 0;
      for (let q = 0; q < n; q++) {
        const off = (q - (n - 1) / 2) * 0.36;
        ingots.push(ingot().rotateY(turn).translate(c2 % 2 ? off : 0, 0.08 + c2 * 0.17, c2 % 2 ? 0 : off));
      }
    }
    const geo = mergeGeometries(ingots.map((q) => q.toNonIndexed()));
    geo.computeVertexNormals();
    paint(geo, (_x, y, _z, cc) => cc.set(GOLD).lerp(new THREE.Color(GOLD_DARK), 1 - (y % 0.17) / 0.17));
    g.add(inked(geo, goldMat(), INK_THIN));
    top = 0.72;
  }
  // the jewel: a brilliant (a crown over a pavilion) on its gold collet
  const collet = inked(paint(new THREE.CylinderGeometry(r * 0.4, r * 0.3, 0.14, 12), (_x, _y, _z, cc) => cc.set(GOLD)), goldMat(), INK_THIN);
  collet.position.y = top + 0.05;
  g.add(collet);
  const crown = new THREE.CylinderGeometry(r * 0.3, r * 0.5, 0.2, 8).translate(0, 0.1, 0);
  const pavilion = new THREE.ConeGeometry(r * 0.5, 0.42, 8).rotateX(Math.PI).translate(0, -0.21, 0);
  const stone = gem(mergeGeometries([crown, pavilion].map((x) => x.toNonIndexed())), c);
  stone.position.y = top + 0.52;
  stone.rotation.y = rand() * Math.PI;
  g.add(stone);
  const hl = halo(0.55, c, 0.14);
  hl.position.y = top + 0.52;
  g.add(hl);
  // (all of it set down in its heap of coin, 0.25 up: nothing of the box or the ingots down on the floor's paving)
  g.children.slice(1).forEach((o) => (o.position.y += 0.25));
  g.rotation.y = rand() * Math.PI;
  return g;
}
const BRASS_ = 0xc9a24a;

/**
 * The frozen waterfall's column (a post): the fall poured from the vault and
 * frozen as it ran — strands of ice fused side by side, each bulging and
 * thinning as it goes, faceted like the crystals, a lip of icicles where it
 * spilled over a ledge, and at its foot a frozen splash spreading low into
 * the ice (within the post's circle: nothing raised where the ball rolls).
 */
function frozenColumn(r: number, rand: Rand) {
  const g = new THREE.Group(), H = 7, strands: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.6, off = r * (k ? 0.45 : 0), rr = r * (k ? 0.42 + rand() * 0.18 : 0.62), ph = rand() * 6, pts: THREE.Vector2[] = [new THREE.Vector2(0.01, -0.15)];
    for (let q = 0; q <= 12; q++) {
      const v = q / 12;
      // a strand: fat where it froze in a bulge, thin where it ran fast, flaring at the vault
      pts.push(new THREE.Vector2(Math.max(0.05, rr * (0.75 + 0.42 * Math.sin(v * 9 + ph) + 0.9 * v * v) * (v < 0.06 ? 0.75 + 4 * v : 1)), v * H - 0.1));
    }
    const geo = new THREE.LatheGeometry(pts, 7).rotateY(rand() * 6).translate(Math.cos(a) * off, 0, Math.sin(a) * off);
    geo.rotateZ((rand() - 0.5) * 0.05);
    strands.push(geo.toNonIndexed());
  }
  // a lip of icicles where it spilled over a ledge, halfway up, and under the vault
  for (const [y0, ring] of [[3.2, r * 1.05], [H - 0.6, r * 1.6]] as const)
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rand() * 0.3, l = 0.35 + rand() * 0.7, w = 0.07 + rand() * 0.07;
      strands.push(new THREE.ConeGeometry(w, l, 5).rotateX(Math.PI).translate(Math.cos(a) * ring, y0 - l / 2, Math.sin(a) * ring).toNonIndexed());
    }
  const geo = mergeGeometries(strands.map((q) => (q.deleteAttribute("uv"), q.deleteAttribute("normal"), q)));
  paint(geo, (x, y, z, c) => c.set(0xeaf9ff).lerp(new THREE.Color(0x8fd0ea), 0.35 + 0.35 * Math.sin(y * 1.9 + Math.atan2(z, x) * 2)));
  // (lit from within as the crystals are: ice, pale in the dark, not a dark blue pillar)
  const ice = once("frozen fall", () => flat(0xffffff, { vertexColors: true, emissive: 0x6fbcdc, emissiveIntensity: 0.55 })); // (in the world's toon bands)
  g.add(facets(knobbly(geo, rand, r * 0.06, 2.4, true), ice, INK_THIN));
  // its frozen splash: a low lumpy apron of ice spreading into the lake round it, inside the post's circle
  const apron = knobbly(new THREE.IcosahedronGeometry(1, 2), rand, 0.12, 2.2);
  apron.scale(r * 0.95, 0.16, r * 0.95).translate(0, -0.01, 0);
  paint(apron, (_x, y, _z, c) => c.set(0xd8f2fb).lerp(new THREE.Color(0xa8def0), Math.max(0, -y * 4)));
  g.add(facets(apron, ice, INK_THIN));
  const hl = halo(r * 0.6 + 0.5, 0x9fe8ff, 0.12);
  hl.position.y = 1.6;
  g.add(hl);
  return g;
}

/** A post as drawn (never faded out of the camera's way: a collider the player aims past; the camera keeps clear of it). */
function post(p: Post, t: Terrain, s: Hole) {
  const [x, z] = p.c, r = p.r, rand = seeded("mp" + s.hole + x + "," + z);
  const at = <O extends THREE.Object3D>(o: O) => ((o.position.set(x, t.height(x, z), z)), o);
  switch (p.skin) {
    case "stalagmite": return at(stalagmite(r, rand));
    case "prop": return at(prop(r, rand)); // (a collider: whole, at its physics size, over a drop too)
    case "buffer": {
      // facing the lane: the way with the most green in front of it
      let best = 0, face = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, n = [1, 1.6, 2.2].filter((d) => t.onGreen(x + Math.cos(a) * d, z + Math.sin(a) * d)).length;
        if (n > best) (best = n), (face = a);
      }
      return at(buffer(r, -face)); // (a collider: whole, at its physics size, over a drop too)
    }
    case "crystal bumper": {
      const g = at(crystalPost(r, rand)); // (a collider: whole, at its physics size, over a drop too)
      singer(s, t, { c: p.c, r }, g);
      return g;
    }
    case "jewel bumper": {
      const k = s.posts.filter((q) => q.skin === "jewel bumper").indexOf(p);
      return at(jewel(r, rand, Math.max(0, k)));
    }
    case "frozen fall": return at(frozenColumn(r, rand));
    case "bat": return pulses.batPost(p, t, s); // (a roost on the hole itself: rare, the pulses draw them)
    default: return undefined;
  }
}

// ---------------------------------------------------------------- the singing crystals
//
// A crystal bumper rings when the ball strikes it: a note of a pentatonic
// scale (its own, by its place along the lane, so a chicane plays a tune), a
// flash of light out of it, and the whole hole's crystals a little brighter
// for a while (lit). The replay tells a bounce (worlds.ts ring); the nearest
// crystal answers, or none and the replay knocks as anywhere.
interface Singer { c?: Vec2; r?: number; a?: Vec2; b?: Vec2; flash: THREE.Mesh; at: number; note: number }
// (keyed by the hole's slot, not its object: the course is built from a copy of the hole, the replay rings with the
// engine's own)
const singers = new Map<string, { t: Terrain; list: Singer[] }>();
const choirOf = (s: Hole) => s.slot || s.hole;
function singer(s: Hole, t: Terrain, where: { c?: Vec2; r?: number; a?: Vec2; b?: Vec2 }, g: THREE.Object3D) {
  let reg = singers.get(choirOf(s));
  if (!reg || reg.t !== t) singers.set(choirOf(s), (reg = { t, list: [] })); // a new build of the hole: a new choir
  const [x, z] = where.c || [((where.a![0] + where.b![0]) / 2), ((where.a![1] + where.b![1]) / 2)];
  // the flash: a bright shell, live, hidden until it rings
  const flash = glow(new THREE.IcosahedronGeometry((where.r || 0.8) + 1.6, 1), 0xbff8ff, 0.9);
  flash.position.set(x - g.position.x, t.height(x, z) + 1 - g.position.y, z - g.position.z);
  flash.visible = false;
  ud(flash).live = true;
  g.add(flash);
  const me: Singer = { ...where, flash, at: -99, note: 0 };
  reg.list.push(me);
  // notes by place along the board's long way: a run up the scale
  const long = s.board.w >= s.board.h ? 0 : 1;
  reg.list.sort((p, q) => ((p.c || p.a)![long]) - ((q.c || q.a)![long]));
  reg.list.forEach((q, i) => (q.note = i));
  const m = flash.material;
  animate((tt) => {
    const k = tt - me.at;
    flash.visible = k >= 0 && k < 0.9;
    if (!flash.visible) return;
    m.opacity = 0.9 * (1 - k / 0.9) ** 2;
    flash.scale.setScalar(0.7 + 0.5 * Math.sqrt(k / 0.9));
  });
}
let litDecay = 0;
export function ring(s: Hole, x: number, z: number, k: number) {
  const reg = singers.get(choirOf(s));
  if (!reg) return false;
  let best: Singer | null = null, bd = 1.3;
  for (const q of reg.list) {
    const d = q.c ? Math.hypot(q.c[0] - x, q.c[1] - z) - (q.r || 0) : segDist(x, z, q.a!, q.b!);
    if (d < bd) (bd = d), (best = q);
  }
  if (!best) return false;
  const now = performance.now() / 1000;
  best.at = now;
  // the geode keeps the light a while: brighter with every hit, fading back
  lit.value = Math.min(1.2, lit.value + 0.35);
  if (!litDecay) {
    const fade = () => {
      lit.value = Math.max(0, lit.value - 0.02);
      litDecay = lit.value > 0 ? +setTimeout(fade, 100) : 0;
    };
    litDecay = +setTimeout(fade, 600);
  }
  if (k > 0) sound("chime", best.note);
  return true;
}

// ---------------------------------------------------------------- dispatch

export function piece(kind: "post" | "wall" | "zone", item: Post | Bar | Zone, t: Terrain, s: Hole): THREE.Object3D | null | undefined {
  const o = kind === "post" ? post(item as Post, t, s) : kind === "wall" ? wall(item as Bar, t, s) : zones.zone(item as Zone, t, s);
  if (o && !o.name) o.name = "mines:" + (item as { skin: string }).skin; // (named: the probes say whose it is)
  return o;
}

export function extras(ex: Extras, s: Hole, t: Terrain) {
  const r = pulses.extras(ex, s, t);
  if (r) r.group.name = "mines:stroke";
  return r;
}

/** The hazards the lane is cut open over (worlds.ts open), and the level a ball falls to in each. */
export const open = zones.open;

/** The ball into a hazard of the mines: lava, the void, a sump, a hot spring... (mines-zones.ts) */
export const fallIn = zones.fallIn;
