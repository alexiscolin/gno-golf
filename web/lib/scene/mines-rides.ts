// The Crystal Mines' rides: its tunnels and loops (the cage, the lift, the
// geysers, the cable car, the cart rides, the chutes) and its carts, drawn
// here first (mines.ts), with the ride each gives the ball.
//
// The carts are course.ts's trams (a timed bar driving along its own axis out
// of a tunnel, through its window, into the far one), their bodies and their
// track drawn here: an ore cart heaped with glowing crystal on iron rails
// over timber sleepers, between two timbered adits in the rock.
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { flat, rbox, share, relief, carved } from "./materials";
import { bakeLocal } from "./bake";
import { seeded, onGround, type Rand } from "./common";
import { state, animate } from "./state";
import { mod, boxOf, inZone, onAt, smoothstep, BALL_R } from "../terrain";
import { darkMouth, inked, solid, tinted, boulder, beam, plate, boxed, paint, knobbly, strata, facets, INK, INK_THIN, TIMBER, TIMBER_DARK, TIMBER_LIGHT, IRON, IRON_DARK, RUST, BRASS } from "./mines-toon";
import { MINES, crystalCluster, crystalMat, shard, cartMouth, planks, drawnGround, lantern, between } from "./mines-kit";
import type { Terrain } from "../terrain";
import type { Post, Zone } from "../types";
import { md, ud, type Hole, type Ride, type TubePath } from "./data";
import type { Bar, Track } from "./worlds";

// ------------------------------------------------------------ the kit
//
// What every ride is built of: rock, timber and riveted iron, in the mines'
// palette, toon and inked like every world's pieces (mines-toon.ts's kit).

const RUST_HI = 0xb0643a;
const DARK = share(new THREE.MeshBasicMaterial({ color: MINES.void, side: THREE.BackSide }));
const DARK_FRONT = darkMouth();

/** A rock, w × h × d, its foot at 0: the kit's boulder, in strata, faceted and inked. */
function rock(w: number, h: number, d: number, rand: Rand) {
  const g = new THREE.Group(), b = boulder(rand, w / 2, h / 2, d / 2);
  b.position.y = h / 2;
  g.add(b);
  return g;
}

/**
 * A small timber repeated by the hundred (a sleeper, a shaft set, a trestle
 * cap), w × h × d: its edges bevelled flat (44 triangles, the kit's chamfer is
 * 108: no square finish, cheaply), its ink on a plain box of its size.
 */
function slat(w: number, h: number, d: number, color: number = TIMBER_DARK, rand?: Rand) {
  const r = Math.min(0.03, w / 4, h / 4, d / 4), x = w / 2, y = h / 2, z = d / 2, pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    pts.push(new THREE.Vector3(sx * x, sy * (y - r), sz * (z - r)), new THREE.Vector3(sx * (x - r), sy * y, sz * (z - r)), new THREE.Vector3(sx * (x - r), sy * (y - r), sz * z));
  // its colour in its vertices over the shared relief (one bake bucket for them all): a tone of its own (a
  // timber: given rand), a little darker to its foot
  const k = rand ? 0.85 + 0.27 * rand() : 1;
  return boxed(paint(new ConvexGeometry(pts), (_x, py, _z, c) => c.set(color).multiplyScalar(k * (0.9 + 0.1 * (py / h + 0.5)))), w, h, d);
}

/** A timber from a to b (its middle on the line), w wide and h deep: the kit's grained beam. */
const strut = (a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, color: number = TIMBER) => between(beam(w, h, a.distanceTo(b), color), a, b);
/** An iron rod (a cable, a chain's run, a rail's tie) from a to b, r thick. */
const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, color: number = IRON_DARK) => between(tinted(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 5).rotateX(Math.PI / 2), color), a, b);

/**
 * A profile swept along a polyline of points (the ground's own heights in
 * them): a rail, a trestle's stringer. prof: [across, up] pairs round the
 * section, closed. Drawn with its ink hull.
 */
function sweep(pts: readonly THREE.Vector3[], prof: readonly (readonly [number, number])[], color: number) {
  const pos: number[] = [], idx: number[] = [], M = prof.length, side = new THREE.Vector3(), tan = new THREE.Vector3();
  const [co, cy] = prof.reduce(([a, b], [o, y]) => [a + o / M, b + y / M], [0, 0]); // (the section's middle)
  // each end bevelled (a ring drawn in a little) and capped: no square cut
  const ring = (p: THREE.Vector3, k: number, pull: number, sc: number) => {
    tan.subVectors(pts[Math.min(k + 1, pts.length - 1)], pts[Math.max(k - 1, 0)]).setY(0).normalize();
    side.set(-tan.z, 0, tan.x);
    for (const [o, y] of prof) pos.push(p.x + tan.x * pull + side.x * (co + (o - co) * sc), p.y + cy + (y - cy) * sc, p.z + tan.z * pull + side.z * (co + (o - co) * sc));
  };
  const n = pts.length, e = Math.min(0.05, pts[0].distanceTo(pts[1]) / 3, pts[n - 1].distanceTo(pts[n - 2]) / 3);
  ring(pts[0], 0, 0, 0.6);
  pts.forEach((p, k) => ring(p, k, k === 0 ? e : k === n - 1 ? -e : 0, 1));
  ring(pts[n - 1], n - 1, 0, 0.6);
  for (let k = 0; k + 1 < n + 2; k++)
    for (let m = 0; m < M; m++) {
      const a = k * M + m, b = k * M + ((m + 1) % M);
      idx.push(a, b, a + M, b, b + M, a + M);
    }
  for (const [first, flip] of [[0, true], [(n + 1) * M, false]] as const)
    for (let m = 1; m + 1 < M; m++) idx.push(...(flip ? [first, first + m + 1, first + m] : [first, first + m, first + m + 1]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return solid(geo, color, INK_THIN);
}
// a rail's section: a head over a web over a foot, low (the ball rolls over it)
const RAIL: readonly (readonly [number, number])[] = [[-0.07, 0], [0.07, 0], [0.03, 0.02], [0.05, 0.05], [-0.05, 0.05], [-0.03, 0.02]];

/** Four timbers round a square hole of half-width h (a collar, a hopper's rim), w wide, t thick, their tops at y. */
function collar(grp: THREE.Object3D, h: number, w = 0.25, th = 0.1, y = 0.03) {
  for (let i = 0; i < 4; i++) {
    const b = slat(i % 2 ? h * 2 - 0.01 : h * 2 + 2 * w, th, w, TIMBER, wood), a = (i * Math.PI) / 2; // (bevelled; two long, two short between them: no two over each other at a corner)
    b.rotation.y = a;
    b.position.set(Math.sin(a) * (h + w / 2), y, Math.cos(a) * (h + w / 2));
    grp.add(b);
  }
}

/**
 * A timbered mouth in the rock (an adit, a portal, a station): its opening
 * at x = 0 facing −x, running D deep along +x, Wd wide and HP high: the
 * timber set (legs splayed, a cap, braces, a second set further in), dark
 * inside, boulders over and either side with crystal in the cracks, a lamp
 * on the cap; `foot`: the rock runs on down under it (a mouth over the void).
 */
function portal(D: number, Wd: number, HP: number, rand: Rand, { foot = true, side = 1.6 } = {}) {
  const grp = new THREE.Group(), k = side / 1.6; // (side: the rock's thickness beyond the opening, either side)
  for (const sz of [-1, 1]) {
    grp.add(strut(new THREE.Vector3(0.1, -0.1, sz * (Wd / 2 + 0.06)), new THREE.Vector3(0.1, HP, sz * (Wd / 2 - 0.08)), 0.26, 0.26));
    grp.add(post(new THREE.Vector3(0.1, HP - 0.55, sz * (Wd / 2 - 0.05)), new THREE.Vector3(0.1, HP - 0.05, sz * (Wd / 2 - 0.5)), 0.07));
  }
  const cap = beam(0.34, 0.3, Wd + 0.8);
  cap.position.set(0.1, HP + 0.12, 0);
  const cap2 = slat(0.26, 0.24, Wd + 0.2, TIMBER_DARK, wood);
  cap2.position.set(Math.min(D - 0.4, 1.3), HP + 0.02, 0);
  // sets going on in, fainter into the dark: it reads as a tunnel, not a black plate
  for (const [x, c] of [[Math.min(D - 0.3, 1.3), 0x4a2f1b], [Math.min(D - 0.15, 2.2), 0x2c1c12]] as const) {
    for (const sz of [-1, 1]) {
      const leg = slat(0.2, HP, 0.2, c, wood);
      leg.position.set(x, HP / 2, sz * (Wd / 2 - 0.2));
      grp.add(leg);
    }
  }
  const inside = new THREE.Mesh(new THREE.BoxGeometry(D, HP + 0.2, Wd - 0.05), DARK);
  inside.position.set(D / 2 + 0.05, (HP + 0.2) / 2 - 0.1, 0);
  grp.add(cap, cap2, inside);
  // the rock arch over the timber set: a thick half ring of rock, lumpy, in
  // strata, the mouth cut into the face of the hill behind it
  const R0 = Wd / 2 + 0.55 * k, arch = knobbly(new THREE.TorusGeometry(R0, 0.62 * k, 7, 14, Math.PI).scale(1, (HP + 0.35) / R0, 1.25), rand, 0.14, 1.6);
  const aseed = rand() * 9;
  paint(arch, (x, y, zz, c) => strata(y + 0.6, x, zz, HP + 1, c, aseed));
  const archM = facets(arch, relief());
  archM.rotation.y = Math.PI / 2;
  archM.position.set(0.35, 0, 0);
  grp.add(archM);
  // the hill it is driven into: a lumpy mass behind the face, over the adit
  const hill = rock(D + 0.6, 1.4 + rand() * 0.5, Wd + 2.2 * k, rand);
  hill.position.set(D / 2 + 0.7, HP - 0.2, 0);
  grp.add(hill);
  for (const sz of [-1, 1]) {
    const cheek = rock(D + 0.8, HP + 0.9, (1.3 + rand() * 0.5) * k, rand);
    cheek.position.set(D / 2 + 0.3, -0.4, sz * (Wd / 2 + 0.72 * k));
    grp.add(cheek);
    if (k < 0.65) continue; // (a thin cheek: no crystal in it, it would stand out of the rock)
    const gems = crystalCluster(rand, 0.55 + rand() * 0.3, rand() < 0.3 ? MINES.amethyst : MINES.cyan, 4);
    gems.position.set(0.3 + rand() * 0.3, HP * (0.55 + rand() * 0.3), sz * (Wd / 2 + 0.3)); // (over a ball at the mouth)
    gems.rotation.set(sz * -1.1, rand(), 0.3);
    grp.add(gems);
  }
  if (foot) {
    const under = rock(D + 1.4, 7, Wd + 0.6, rand); // (under the mouth only: its cheeks stop at the drop)
    under.position.set(D / 2 + 0.2, -7.05, 0);
    grp.add(under);
  }
  const l = lantern(0.55); // (the world's lantern, hung by its ring: it dims with every other in Lights out and the dark)
  l.position.set(-0.3 - 0.3 * k, HP - 0.52, 0); // (out in front of the arch)
  grp.add(l);
  return grp;
}

/**
 * A portal (as portal() draws it) with its mouth at (x, z) opening to heading
 * a, fitted where it stands: as deep, as wide and as thick in the rock as asked
 * where that stands on nothing a ball goes to (the lane, or a drop within 2 of
 * it; `own`, its zone, aside), else as little of it as it can (`fixed`: only
 * thinner in the rock, its depth and width kept).
 */
function mouthAt(s: Hole, t: Terrain, x: number, z: number, a: number, D: number, Wd: number, HP: number, rand: Rand, { foot = true, own = null as Zone | null, y = t.height(x, z), fixed = false } = {}) {
  const holes = s.zones.filter((q) => q.kind === "hazard" && !q.every), c = Math.cos(a), sn = Math.sin(a);
  const lane = (px: number, pz: number) => t.onGreen(px, pz) && !holes.some((q) => inZone(q, px, pz));
  const near = (px: number, pz: number) => { for (let i = 0; i < 8; i++) for (const r of [1, 2]) if (lane(px + Math.cos(i * 0.785) * r, pz + Math.sin(i * 0.785) * r)) return true; return false; };
  const taken = (px: number, pz: number) => !(own && inZone(own, px, pz)) && t.onGreen(px, pz) && (lane(px, pz) || near(px, pz));
  // (the footprint set `back` into the rock: its legs and cheeks on the lane itself count first, then near it)
  const onIt = (d: number, w: number, back: number) => {
    let n = 0, on = 0;
    for (let u = -0.45 + back; u <= d + 1 + back; u += 0.25) for (let v = -w; v <= w + 1e-6; v += 0.25) {
      const px = x - c * u - sn * v, pz = z - sn * u + c * v;
      if (taken(px, pz)) n++;
      if (!(own && inZone(own, px, pz)) && lane(px, pz)) on++;
    }
    return { n, on };
  };
  let best = { on: Infinity, n: Infinity, cost: Infinity, d: D, wd: Wd, side: 1.6, back: 0 };
  // (fixed: a cart line's adit keeps its depth and its width, what drives into it is that long and that wide)
  for (const back of [0, 0.4, 0.8, 1.2]) for (const d of fixed ? [D] : [D, D * 0.7, 1.2]) for (const side of [1.6, 1.1, 0.7, 0.45]) for (const wd of fixed ? [Wd] : [Wd, Wd * 0.8, Math.max(1.3, Wd * 0.65)]) {
    const { n, on } = onIt(d, wd / 2 + side, back), cost = (1.6 - side) / 1.6 + ((Wd - wd) / Wd) * 1.5 + ((D - d) / D) * 0.5 + back * 0.6;
    if (on < best.on || (on === best.on && (n < best.n || (n === best.n && cost < best.cost)))) best = { on, n, cost, d, wd, side, back };
  }
  const piece = facing(portal(best.d, best.wd, HP, rand, { foot, side: best.side }), a);
  piece.position.set(x - c * best.back, y, z - sn * best.back);
  return { piece, D: best.d, n: best.n, on: best.on };
}

// ------------------------------------------------------------ carts

/**
 * An ore cart, L long (along x) and W wide, on its wheels at 0: a riveted
 * iron tub flaring to a rusty rim, on a timber chassis, four flanged wheels
 * on the rails' gauge, buffers at both ends, heaped with ore and crystals
 * that glow. Merged into a draw or three a material (bakeLocal).
 */
function oreCart(L: number, W: number, gauge: number, rand: Rand, paintC: number = IRON) {
  const g = new THREE.Group();
  const R = 0.25, top = 1.35, foot = 0.52;
  // the wheels: a flanged iron disc and its hub, either side of each axle
  for (const x of [-L / 2 + 0.55, L / 2 - 0.55]) {
    for (const z of [-gauge, gauge]) {
      const wheel = solid(new THREE.CylinderGeometry(R, R, 0.1, 14), IRON_DARK, INK);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, R, z + Math.sign(z) * 0.02);
      const flange = tinted(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.03, 14), IRON_DARK);
      flange.rotation.x = Math.PI / 2;
      flange.position.set(x, R, z - Math.sign(z) * 0.05);
      const hub = tinted(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), RUST_HI);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(x, R, z + Math.sign(z) * 0.06);
      g.add(wheel, flange, hub);
    }
    const axle = tinted(new THREE.CylinderGeometry(0.05, 0.05, gauge * 2, 6), IRON);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(x, R, 0);
    g.add(axle);
  }
  // the chassis: two timber sills over the axles, joined at the ends
  for (const z of [-gauge, gauge]) {
    const sill = slat(L - 0.2, 0.16, 0.2, TIMBER_DARK, wood);
    sill.position.set(0, R + 0.2, z);
    g.add(sill);
  }
  // the buffers: a timber block and an iron face at each end, the coupling hook between
  for (const sx of [-1, 1]) {
    const block = slat(0.22, 0.26, W * 0.7, TIMBER, wood);
    block.position.set(sx * (L / 2 - 0.05), R + 0.24, 0);
    const hook = solid(new THREE.TorusGeometry(0.08, 0.03, 5, 10), IRON, INK);
    hook.position.set(sx * (L / 2 + 0.1), R + 0.24, 0);
    g.add(block, hook);
  }
  // the tub: a rounded box flaring from its floor to its rim, iron shaded to its foot and grained
  const tub = rbox(L - 0.25, top - foot, W, 0.14), p = tub.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y01 = (p.getY(i) + (top - foot) / 2) / (top - foot), k = 0.8 + 0.2 * y01;
    p.setXYZ(i, p.getX(i) * (0.88 + 0.12 * y01), p.getY(i), p.getZ(i) * k);
  }
  tub.computeVertexNormals();
  // iron, darker to its foot, rust bleeding up from the floor and down from the rim
  const rust = new THREE.Color(RUST), iron = new THREE.Color(paintC);
  paint(tub, (x, y, z, c) => {
    const y01 = (y + (top - foot) / 2) / (top - foot), streak = 0.5 + 0.5 * Math.sin(x * 7.1 + z * 5.3);
    c.copy(iron).multiplyScalar(0.72 + 0.36 * y01).lerp(rust, Math.max(0, 0.45 - y01 * 1.6) * streak + Math.max(0, y01 - 0.86) * 2.2 * streak);
  });
  const body = inked(tub, relief());
  body.position.y = (top + foot) / 2;
  g.add(body);
  // the rim, rusted where hands and ore wear it, and the corner straps with their rivets
  for (const [w, d, x, z] of [[L - 0.15, 0.12, 0, W / 2], [L - 0.15, 0.12, 0, -W / 2], [0.12, W, L / 2 - 0.13, 0], [0.12, W, -L / 2 + 0.13, 0]] as const) {
    const rim = solid(new THREE.BoxGeometry(w, 0.12, d), RUST);
    rim.position.set(x, top, z);
    g.add(rim);
  }
  const rivet = paint(new THREE.SphereGeometry(0.035, 5, 4), (_x, _y, _z, c) => c.set(RUST_HI));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const strap = slat(0.1, top - foot - 0.1, 0.06, IRON_DARK);
      const x = sx * (L / 2 - 0.3) * 0.94, z = sz * (W / 2) * 0.93;
      strap.position.set(x, (top + foot) / 2, z + sz * 0.02);
      g.add(strap);
      for (let r = 0; r < 3; r++) {
        const rv = new THREE.Mesh(rivet, relief());
        rv.position.set(x, foot + 0.18 + r * 0.25, z + sz * 0.06);
        g.add(rv);
      }
    }
  // the load: a heap of dark ore over the rim, crystals standing out of it that glow
  const heap = solid(new THREE.DodecahedronGeometry(1, 1), 0x3b3048, INK);
  heap.scale.set((L - 0.5) / 2, 0.32, (W - 0.3) / 2);
  heap.position.y = top - 0.05;
  g.add(heap);
  const n = Math.max(6, Math.round(L * 3.5));
  for (let i = 0; i < n; i++) {
    // a big one or two over a scatter of small ones
    const big = i < Math.max(1, Math.round(L / 2.5)), x = (rand() - 0.5) * (L - 0.9), z = (rand() - 0.5) * (W - 0.6), r = big ? 0.2 + rand() * 0.06 : 0.07 + rand() * 0.07;
    const s = inked(shard(r, big ? 0.55 + rand() * 0.25 : 0.12 + rand() * 0.25, rand() < 0.3 ? MINES.amethyst : MINES.cyan), crystalMat());
    s.position.set(x, top + 0.1 + 0.18 * (1 - Math.abs(x) / L - Math.abs(z) / W), z);
    s.rotation.set((rand() - 0.5) * 1.2, rand() * 3, (rand() - 0.5) * 1.2);
    g.add(s);
  }
  return g;
}

/**
 * A cart on its bar: an ore cart the bar's length, or a short train of them
 * coupled (a bar across a whole crossing), heading along ang. Drawn still at
 * the bar's centre: course.ts drives it along its track.
 */
function cartOn(bar: Bar, t: Terrain) {
  const rand = seeded("cart" + bar.c.join()), g = new THREE.Group();
  const n = Math.max(1, Math.round(bar.length / 3)), each = bar.length / n;
  for (let i = 0; i < n; i++) {
    // (a heavy wooden cart, heaped with ore: it plays soft, 0.4)
    const c = oreCart(each - 0.6, bar.thick - 0.25, gauge(bar.thick), rand, TIMBER_DARK); // (its buffers inside its bar's ends)
    c.position.x = -bar.length / 2 + each * (i + 0.5);
    g.add(c);
  }
  g.rotation.y = -bar.ang;
  return onGround(bakeLocal(g), bar.c[0], bar.c[1], t);
}
const gauge = (th: number) => Math.min(0.55, th * 0.3);

// ------------------------------------------------------------ the track

/**
 * A cart track (a line of `cart` bars): iron rails on timber sleepers across
 * the lane, and an adit at each end, timbered and set in the rock, dark
 * inside, a lantern hung on its cap, where the carts come out and go in.
 * Under a mouth that stands out over the void, the rock runs on down.
 */
function cartTrack(l: Track, s: Hole, t: Terrain) {
  const g = new THREE.Group(), [ux, uz] = l.u, rand = seeded("track" + l.perp.toFixed(2));
  const P = (sv: number, off = 0) => new THREE.Vector3(ux * sv - uz * (l.perp + off), 0, uz * sv + ux * (l.perp + off));
  const ang = Math.atan2(uz, ux), gg = gauge(l.th);
  const [a, b] = l.portals, from = a.at - a.depth + 0.3, to = b.at + b.depth - 0.3;
  const yAt = (sv: number) => { const p = P(Math.min(Math.max(sv, l.e0), l.e1)); return t.height(p.x, p.z); };
  // the sleepers, every 0.55, on the lane (past its edge the rails go on
  // alone over the drop, into the tunnels: nothing there to stand on)
  for (let sv = l.e0 + 0.15; sv < l.e1; sv += 0.55) {
    const p = P(sv), y = yAt(sv);
    if (s.zones.some((q) => q.kind === "hazard" && inZone(q, p.x, p.z))) continue; // (none over a drop: the rails alone there, on their bents)
    const sl = slat(0.26, 0.07, gg * 2 + 0.55, rand() < 0.5 ? TIMBER_DARK : TIMBER, wood);
    sl.position.set(p.x + (rand() - 0.5) * 0.04, y + 0.075, p.z); // (0.03 over the lane's own laid paving, rubble, ballast, not in it)
    sl.rotation.set(0, -ang + (rand() - 0.5) * 0.06, Math.atan((yAt(sv + 0.13) - yAt(sv - 0.13)) / 0.26)); // (flat on the lane's fall along it, not standing proud of an incline)
    g.add(sl);
  }
  for (const off of [-gg, gg]) {
    const pts: THREE.Vector3[] = [];
    for (let sv = from; sv <= to + 1e-6; sv += Math.max(0.5, (to - from) / 200)) pts.push(P(sv, off).setY(yAt(sv) + 0.12)); // (a hundredth over the sleepers' tops)
    g.add(sweep(pts, RAIL, 0x9aa3ad));
  }
  // under the rails where they cross the drop to the adits: a bent every 1.2, legs down into the dark
  for (const [s0, s1] of [[from, l.e0], [l.e1, to]] as const) for (let sv = s0 + 0.3; sv < s1; sv += 1.2) {
    const p = P(sv), y = yAt(sv) + 0.11 - 0.14, sd = new THREE.Vector3(-uz, 0, ux);
    if (!s.zones.some((q) => q.kind === "hazard" && inZone(q, p.x, p.z))) continue; // (over ground: the rails lie on it)
    for (const sg of [-1, 1]) g.add(post(p.clone().addScaledVector(sd, sg * (gg + 0.15)).setY(y), p.clone().addScaledVector(sd, sg * (gg + 0.9)).setY(y - 9), 0.1));
    const cap = slat(0.24, 0.18, gg * 2 + 0.7, TIMBER, wood);
    cap.position.copy(p).setY(y - 0.07);
    cap.rotation.y = -ang + Math.PI / 2;
    g.add(cap);
  }
  // (the adits set back from the lane's edge: a gap of drop before them, rails over it)
  for (const pt of l.portals) {
    const at = P(pt.at + pt.dir * 1.7); // (1.7 back from the lane's edge: over the drop between, the rails on their bents, nothing at the lane's level)
    // (the cart and its load clear it: mines-kit's cartMouth)
    const cm = cartMouth(l.th);
    g.add(mouthAt(s, t, at.x, at.z, ang + (pt.dir > 0 ? Math.PI : 0), pt.depth, Math.max(pt.width, cm.width), cm.height, rand, { y: yAt(pt.at), fixed: true }).piece);
  }
  return g;
}

// ------------------------------------------------------------ rides
//
// A tunnel of the mines is a set piece, its mouth and its exit drawn as one,
// and the ball rides it (replay.ts through): its curve and its Ride (data.ts)
// go in the course's tubes, keyed by the zone.

/** Registers z's ride: the ball taken along curve as ride says. */
function rides(z: Zone, curve: THREE.Curve<THREE.Vector3>, ride: Ride) {
  const tube: TubePath = Object.assign(curve, { userData: { ride } });
  state.tubes.set(z, tube);
}
/** A camera chasing the ball along a ride: `back` behind it along dir (its
 *  heading, flat), `side` to its right, `up` over it, looking at it. */
function chase(dir: THREE.Vector3, back: number, side: number, up: number, floor = -Infinity) {
  return (_k: number, pos: THREE.Vector3, look: THREE.Vector3, ball: THREE.Vector3) => {
    look.copy(ball);
    pos.set(ball.x - dir.x * back - dir.z * side, Math.max(floor, ball.y + up), ball.z - dir.z * back + dir.x * side);
    return true;
  };
}
/** A zone's timed clock as a live value: the substep the timed pieces show (state.timed), and whether z is there then. */
function clockOf(z: Zone) {
  const c = { step: 0, there: () => onAt(z, Math.floor(c.step)), phase: () => (z.every ? mod(c.step + (z.phase ?? 0), z.every) : 0) };
  state.timed.push({ at: (st) => (c.step = st) });
  return c;
}
/**
 * Which way a mouth at (x, z) opens: the heading (radians, the board's) with
 * the most lane in front of it within 4 (not over a hazard), `prefer` (the
 * tee, the cup) breaking a tie. Its body runs the other way, into the rock.
 */
function openTo(s: Hole, t: Terrain, x: number, z: number, prefer: readonly number[]) {
  const holes = s.zones.filter((q) => q.kind === "hazard" && !q.every), lane = (a: number, b: number) => t.onGreen(a, b) && !holes.some((q) => inZone(q, a, b));
  let best = 0, score = -1;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    let n = 0;
    for (let d = 1.5; d <= 4; d += 0.5) n += lane(x + c * d, z + sn * d) ? 1 : 0;
    // (a wide lane either side of a narrow one: the middle of the widest arc wins, below)
    const pl = Math.hypot(prefer[0] - x, prefer[1] - z) || 1, k = n + 0.4 * ((c * (prefer[0] - x) + sn * (prefer[1] - z)) / pl);
    if (k > score) (score = k), (best = a);
  }
  return best;
}
/** A group turned so that its local −x (the way a portal opens) faces heading a. */
const facing = <O extends THREE.Object3D>(o: O, a: number) => ((o.rotation.y = Math.PI - a), o);
/** Heading a as a flat unit vector. */
const headV = (a: number) => new THREE.Vector3(Math.cos(a), 0, Math.sin(a));

/**
 * A ride through the rock, out of sight: in at a (the ball rolling into a
 * mouth that opens toward heading ia), under the ground, out at b (a mouth
 * opening toward ob) onto the lane. The ball is seen going in and coming out;
 * the camera watches it go in, then cuts to the exit (never over the lane
 * between: a passage in the rock is not seen from the air) and watches it
 * come out. back0, back1: how deep each mouth's dark begins.
 */
function transit(a: THREE.Vector3, ia: number, b: THREE.Vector3, ob: number, { back0 = 1.6, back1 = 1.6, deep = 1.6, ms = 0 } = {}): { curve: THREE.CatmullRomCurve3; ride: Ride } {
  const da = headV(ia), db = headV(ob), A = a.clone().addScaledVector(da, -back0), B = b.clone().addScaledVector(db, -back1);
  // (in level, down under the floor, straight along, up, out level: a run with clean ends, no swoop)
  const low = Math.min(a.y, b.y) - deep, A1 = A.clone().addScaledVector(da, -0.8).setY(low), B1 = B.clone().addScaledVector(db, -0.8).setY(low);
  const curve = new THREE.CatmullRomCurve3([a, A, A1, A1.clone().lerp(B1, 0.5), B1, B, b], false, "centripetal");
  const len = curve.getLength(), uOf = (p: THREE.Vector3) => { let best = 0, bd = Infinity; for (let i = 0; i <= 200; i++) { const d = curve.getPointAt(i / 200).distanceTo(p); if (d < bd) (bd = d), (best = i / 200); } return best; };
  const uA = uOf(A), uB = uOf(B); // (seen only while in a mouth's dark or out of it: never under the ground or a lake between)
  return {
    curve,
    ride: {
      ms: ms || Math.min(2600, 1100 + len * 22),
      at: (k, ball) => void (ball.visible = k < 0 || k < uA || k > uB),
      cam: cutCam(a, da, b, db, B, 0.2),
    },
  };
}

/**
 * A camera for a ride through the rock: behind the ball at the mouth (a,
 * opening along da) until `at` of the ride, then cut to the exit (b, facing
 * db), looking at its dark (inside) and then at the ball coming out.
 */
function cutCam(a: THREE.Vector3, da: THREE.Vector3, b: THREE.Vector3, db: THREE.Vector3, inside: THREE.Vector3, at: number) {
  const from = a.clone().addScaledVector(da, 5.5).setY(a.y + 3), to = b.clone().addScaledVector(db, 6).setY(b.y + 3);
  return (k: number, pos: THREE.Vector3, look: THREE.Vector3) => {
    if (k < at) return (pos.copy(from), look.copy(a), true);
    pos.copy(to);
    look.lerpVectors(inside, b, smoothstep((k - 0.7) / 0.25));
    return "cut" as const;
  };
}

/** Eased toward a target each frame: x += (to - x)·(1 − e^(−rate·dt)). */
const easer = (rate: number) => {
  let x = 0, last: number | null = null;
  return (to: number, tt: number) => {
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, tt - last)); // (a clock run back, held or replayed: no step, never a growing one)
    last = tt;
    return (x += (to - x) * (1 - Math.exp(-rate * dt)));
  };
};

// ------------------------------------------------------------ geysers

const SINTER = 0xdcc79c, SINTER_RUST = 0xc9824a, STEAM = share(flat(0xeef3f8, { transparent: true, opacity: 0.9, depthWrite: false, emissive: 0x9fb6c8, emissiveIntensity: 0.35 }));
const SPOUT = share(new THREE.MeshToonMaterial({ color: 0xc8f2ff, emissive: 0x5fc8e8, emissiveIntensity: 0.45, transparent: true, opacity: 0.82, depthWrite: false }));
const BOIL = share(new THREE.MeshBasicMaterial({ color: 0x7fdcef }));
// a throw's arc while aiming: the timed pieces' dashed look (course.ts ghosts)
const HINT = share(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.4, depthWrite: false }));

/**
 * A geyser (a timed tunnel): a pad of sinter terraced round its vent, the
 * water boiling in the throat, swelling before it blows; while the chain has
 * it, a column of water and steam shoots up, puffs rolling off it, spray
 * falling round. A ball in it rides the column up and over to the terrace
 * above (its exit), the camera rising with it.
 */
function geyser(z: Zone, t: Terrain) {
  const g = new THREE.Group(), { cx, cz, hx, hz } = boxOf(z), R = Math.min(hx, hz), y = t.height(cx, cz), rand = seeded("geyser" + z.min.join());
  // the pad: sinter in low rings stepping up to the vent's lip, rust in its runnels
  // (a tenth high at most: while the geyser sleeps a ball rolls over it on the lane)
  const prof = [[R * 1.25, -0.08], [R * 1.18, 0.02], [R * 0.95, 0.03], [R * 0.88, 0.05], [R * 0.62, 0.06], [R * 0.55, 0.085], [0.5, 0.1], [0.38, 0.06], [0.34, -0.5]];
  const pad = carved(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 28), SINTER, THREE.FrontSide, (y01) => 0.72 + 0.34 * y01);
  pad.position.set(cx, y, cz);
  g.add(pad);
  for (const [rr, h] of [[R * 1.08, 0.035], [R * 0.72, 0.07]]) {
    const ring = tinted(new THREE.TorusGeometry(rr, 0.035, 4, 28), SINTER_RUST);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, y + h, cz);
    g.add(ring);
  }
  // the launcher's collar: an iron ring round the vent, riveted, a grate over the throat
  const collar = solid(new THREE.TorusGeometry(0.46, 0.06, 6, 20).rotateX(Math.PI / 2), IRON_DARK, INK);
  collar.position.set(cx, y + 0.05, cz); // (a tenth high: a ball rolls over it while the geyser sleeps)
  g.add(collar);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, rv = tinted(new THREE.SphereGeometry(0.045, 5, 4), RUST);
    rv.position.set(cx + Math.cos(a) * 0.46, y + 0.09, cz + Math.sin(a) * 0.46);
    g.add(rv);
  }
  // (the grate on a hinge at the collar's edge: swung aside while the geyser blows, the jet never through its bars)
  const grate = new THREE.Group();
  for (const k of [-1, 0, 1]) {
    const bar = slat(0.06, 0.05, 0.78, IRON);
    bar.position.set(0.42 + k * 0.2, 0, 0);
    grate.add(bar);
  }
  bakeLocal(grate);
  ud(grate).live = true;
  grate.position.set(cx - 0.42, y + 0.085, cz);
  g.add(grate);
  // pebbles of sinter round its foot
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, rr = R * (1.2 + rand() * 0.25), p = rock(0.25 + rand() * 0.2, 0.14, 0.2 + rand() * 0.15, rand);
    const q = t.zoneAt(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr);
    if (q && q.kind === "surface") continue; // (none on a deck or a bridge laid there)
    p.position.set(cx + Math.cos(a) * rr, y - 0.02, cz + Math.sin(a) * rr);
    g.add(p);
  }
  // the water in the throat, rising before it blows
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), BOIL); // (inside the throat's lip, never on it)
  water.rotation.x = -Math.PI / 2;
  // the column: a tapering jet, and the steam round it
  const H = 6.5;
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.28, 1, 14, 6, true).translate(0, 0.5, 0), SPOUT); // (out of the throat, 0.28, flaring as it rises)
  const N = 34, puffGeo = new THREE.IcosahedronGeometry(1, 0); // (20 faces a puff: toon, it reads round)
  const puffs = new THREE.InstancedMesh(puffGeo, STEAM, N); // (steam unoutlined: soft, and one draw)
  for (const m of [water, jet, puffs]) ((ud(m).live = true), (m.frustumCulled = false));
  jet.position.set(cx, y, cz);
  g.add(water, jet, puffs);
  const seeds = Array.from({ length: N }, () => [rand(), rand() * Math.PI * 2, 0.35 + rand() * 0.35, rand()]);
  const clock = clockOf(z), ON = z.on || 0, swell = easer(6), dummy = new THREE.Object3D();
  let forced = -1; // a ride: the column blowing whatever the clock
  animate((tt) => {
    const p = clock.phase(), E = z.every || 1, blowing = forced >= 0 || clock.there();
    // (on the chain's clock itself, its window's every tick: up in its first 0.15, down in its last; a ride's, full)
    const o = forced >= 0 ? 1 : blowing ? smoothstep(Math.min(p, ON - p) / 0.15) : 0, sw = swell(blowing ? 1 : p > E - 3 ? (p - (E - 3)) / 3 : 0, tt);
    water.position.set(cx, y + 0.02 + sw * 0.04 + 0.015 * Math.sin(tt * 9), cz); // (under the grate)
    jet.visible = o > 0.02;
    grate.rotation.z = Math.min(1, o * 3) * 1.9;
    jet.scale.set(0.8 + 0.2 * o + 0.05 * Math.sin(tt * 21), H * o, 0.8 + 0.2 * o + 0.05 * Math.cos(tt * 17));
    for (let i = 0; i < N; i++) {
      const [u0, a, sz, w] = seeds[i];
      const u = (tt * (0.55 + 0.25 * w) + u0) % 1;
      // blowing: rolling up the column and off its head; between: a plume
      // that builds over the period, taller and thicker as the blow comes
      // (a countdown to read), the water swelling at the end
      const build = Math.min(1, (p / E) ** 1.4), shown = o > 0.05 || i < 6 + build * (N - 6);
      const h = o > 0.05 ? u * H * o * 1.05 : u * (0.6 + 3.4 * build + 1.2 * sw), out = o > 0.05 ? 0.35 + u * (0.8 + w) : 0.08 + u * (0.25 + 0.5 * build);
      dummy.position.set(cx + Math.cos(a + u * 2) * out, y + 0.2 + h, cz + Math.sin(a + u * 2) * out);
      dummy.scale.setScalar(!shown ? 0.001 : Math.max(0.001, (o > 0.05 ? sz * (0.35 + u * 0.8) : 0.1 + 0.3 * build + 0.2 * sw) * Math.sin(Math.PI * Math.min(1, u * 1.15))));
      dummy.updateMatrix();
      puffs.setMatrixAt(i, dummy.matrix);
    }
    puffs.instanceMatrix.needsUpdate = true;
  });
  // the ride: up the column, over, and down onto the terrace above
  const [ox, oz] = z.vec, oy = t.height(ox, oz), dir = new THREE.Vector3(ox - cx, 0, oz - cz).normalize();
  const top = Math.max(y, oy) + H;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(cx, y + 0.5, cz),
    new THREE.Vector3(cx, y + H * 0.45, cz),
    new THREE.Vector3(cx + dir.x * 0.4, top - 0.3, cz + dir.z * 0.4),
    new THREE.Vector3(cx + (ox - cx) * 0.45, top + 0.6, cz + (oz - cz) * 0.45),
    new THREE.Vector3(cx + (ox - cx) * 0.85, oy + 2.2, cz + (oz - cz) * 0.85),
    new THREE.Vector3(ox, oy + 0.5, oz),
  ]);
  // while aiming, its throw drawn faintly dashed from the pad to the terrace it lands on
  const hint = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), HINT);
  hint.computeLineDistances();
  hint.visible = false;
  ud(hint).live = true;
  g.add(hint);
  const before = state.ghosts;
  state.ghosts = (on) => { if (before) before(on); hint.visible = !!on; };
  const cam = chase(dir, 7.5, 3, 1.2, y + 2.5), at = new THREE.Vector3();
  rides(z, curve, {
    ms: 1900,
    // shot up fast, hanging at the top, down onto the terrace
    ease: (k) => (k < 0.35 ? 0.4 * (1 - (1 - k / 0.35) ** 2) : 0.4 + 0.6 * ((k - 0.35) / 0.65) ** 1.3),
    at: (k) => void (forced = k),
    cam: (k, pos, look) => cam(k, pos, look, curve.getPoint(k < 0.35 ? 0.4 * (1 - (1 - k / 0.35) ** 2) : 0.4 + 0.6 * ((k - 0.35) / 0.65) ** 1.3, at)),
  });
  return g;
}

// ------------------------------------------------------------ the pithead

const SHAFT_D = 14; // how deep the cage goes down, out of sight

/**
 * A cage's depth on its tunnel's clock (phase p of every E, at the landing
 * the first ON of them): down the shaft and back, eased (it gathers speed,
 * runs, slows) over `run` substeps each way at most, back at the landing as
 * the window opens, a little bounce as it settles there.
 */
function hoist(p: number, E: number, ON: number, deep: number, run = 2.3) {
  // (out of the landing quick: in the window's last 0.3 substep up the last 3.2, in its first 0.3 after it down them;
  // the chain has the landing lane then, the leaves shut over it; the rest of the way eased)
  const r = Math.min(run, (E - ON) / 2), q = 0.3, top = Math.min(3.8, deep); // (in its first 0.3, its roof under the landing)
  if (p < ON) return -0.07 * Math.exp(-4 * p) * Math.sin(8 * p);
  if (p < ON + q) return -top * smoothstep((p - ON) / q);
  if (p < ON + r) return -top - (deep - top) * smoothstep((p - ON - q) / (r - q));
  if (p > E - q) return -top * smoothstep((E - p) / q);
  if (p > E - r) return -top - (deep - top) * smoothstep((E - q - p) / (r - q));
  return -deep;
}

/**
 * The cage (ADR §8, hole 1), local: its floor at 0, the way in facing −x, an
 * iron cage 2.1 square and 2.3 tall: corner posts, a riveted floor and roof,
 * barred sides and back, the bridle's chains up to the rope's shackle, a lamp
 * inside. Merged (bakeLocal).
 */
function cage(W = 2.1) {
  const g = new THREE.Group(), H = 2.3, h = W / 2;
  const floor = plate(W, 0.1, W);
  floor.position.y = 0.05;
  const roof = plate(W + 0.1, 0.1, W + 0.1);
  roof.position.y = H;
  g.add(floor, roof);
  for (const x of [-h, h]) for (const z of [-h, h]) {
    const post = slat(0.12, H, 0.12, IRON_DARK);
    post.position.set(x, H / 2, z);
    g.add(post);
  }
  const bar = paint(new THREE.CylinderGeometry(0.025, 0.025, H - 0.2, 5), (_x, _y, _z, c) => c.set(IRON));
  // the bars: the sides and the back; a lintel and a rail over the way in
  for (let i = 1; i < 8; i++) {
    const u = -h + (i * W) / 8;
    for (const [x, z] of [[u, -h], [u, h], [h, u]] as const) {
      const b = new THREE.Mesh(bar, relief());
      b.position.set(x, H / 2, z);
      g.add(b);
    }
  }
  for (const y of [0.35, 1.15]) for (const [w, d, x, z] of [[W, 0.07, 0, -h], [W, 0.07, 0, h], [0.07, W, h, 0]] as const) {
    const rail = slat(w, 0.1, d, IRON_DARK);
    rail.position.set(x, y, z);
    g.add(rail);
  }
  const lintel = slat(0.12, 0.3, W, RUST);
  lintel.position.set(-h, H - 0.15, 0);
  g.add(lintel);
  const top = new THREE.Vector3(0, H + 1.1, 0);
  for (const x of [-h + 0.1, h - 0.1]) for (const z of [-h + 0.1, h - 0.1]) g.add(rod(new THREE.Vector3(x, H + 0.05, z), top, 0.03));
  const shackle = tinted(new THREE.TorusGeometry(0.12, 0.04, 5, 10), RUST);
  shackle.position.copy(top);
  g.add(shackle); // (no lantern of its own: a moving cage is two draws, its body and its outline)
  return g;
}

/**
 * A headframe on a site (local: the shaft at the origin, the winding house
 * off along +x): legs either side of the shaft (S out), back legs leaning to
 * the winding house, braces, a deck on top, the spoked sheave turning as the
 * rope runs (its front rim over the shaft's middle), the rope to the winding
 * house and the rope down to the cage (1 long: scale it); feet on stone pads,
 * or on rock columns out of the deep (deep). Returns the sheave and the rope.
 */
function headframe(site: THREE.Group, H: number, S: number, R: number, rand: Rand, deep = false, drop: (x: number, z: number) => boolean = () => false) {
  for (const sz of [-1, 1]) {
    const foot = new THREE.Vector3(-0.2, 0, sz * S), top = new THREE.Vector3(0.4, H, sz * 0.9);
    site.add(strut(foot, top, 0.34, 0.34));
    const back = new THREE.Vector3(4.6, 0, sz * S * 0.9);
    site.add(strut(back, top.clone().setX(0.9), 0.3, 0.3, TIMBER_DARK));
    for (const k of [0.3, 0.55, 0.78]) {
      const p0 = foot.clone().lerp(top, k), p1 = back.clone().lerp(top.clone().setX(0.9), k);
      site.add(strut(p0, p1, 0.16, 0.18, TIMBER_DARK));
      if (sz > 0 && k > 0.5) site.add(strut(p0, p0.clone().setZ(-p0.z), 0.16, 0.18, TIMBER_DARK)); // (none low across the shaft: the rope and the cage go there)
    }
    for (const f of [foot, back]) {
      // (a foot over the drop stands on a column up out of the dark, its top under the lip: nothing solid at the lane's level there)
      site.updateMatrixWorld(true);
      const w = site.localToWorld(f.clone()), down = deep || drop(w.x, w.z);
      const pad = down ? rock(1.4, 12, 1.4, rand) : rock(0.8, 0.35, 0.8, rand);
      pad.position.copy(f).setY(down ? -12.5 : -0.15);
      site.add(pad);
    }
  }
  const deck = beam(2.2, 0.16, 2.4);
  deck.position.set(0.6, H + 0.1, 0);
  site.add(deck);
  const sheave = new THREE.Group();
  sheave.add(tinted(new THREE.TorusGeometry(R, 0.1, 6, 28), IRON_DARK)); // (dark iron, no outline: one draw as it turns)
  for (let i = 0; i < 8; i++) {
    const a8 = (i / 8) * Math.PI * 2;
    sheave.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a8) * R, Math.sin(a8) * R, 0), 0.05, IRON));
  }
  sheave.add(solid(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10).rotateX(Math.PI / 2), IRON_DARK, INK));
  bakeLocal(sheave);
  ud(sheave).live = true;
  const wheel = new THREE.Group();
  wheel.position.set(R, H + 0.2 + R, 0);
  wheel.add(sheave);
  site.add(wheel);
  // the rope over the sheave down to its winding drum on the rim (away from the shaft where the shaft is deep), on a timber frame
  // (a deep shaft's: the drum up on the frame's back legs, no ground for it on the rim)
  const drumAt = deep ? new THREE.Vector3(3.2, H * 0.32, 0) : new THREE.Vector3(9, 1.2, 0);
  site.add(rod(new THREE.Vector3(R, H + 0.2 + 2 * R, 0), drumAt, 0.035, MINES.ink));
  const drum = solid(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14).rotateX(Math.PI / 2), IRON_DARK, INK);
  drum.position.copy(drumAt);
  site.add(drum);
  if (!deep) {
    for (const sz of [-1, 1]) {
      const leg = beam(0.24, 1.5, 0.24, TIMBER_DARK);
      leg.position.set(drumAt.x, 0.75, sz * 0.8);
      site.add(leg);
    }
    const bed = beam(1.6, 0.2, 2, TIMBER);
    bed.position.set(drumAt.x, 0.1, 0);
    site.add(bed);
  } else {
    const axle = beam(0.2, 0.2, S * 1.9, TIMBER_DARK); // (its axle across between the back legs)
    axle.position.copy(drumAt);
    site.add(axle);
  }
  const rope = tinted(new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, -0.5, 0), MINES.ink);
  rope.position.set(0, H + 0.2 + R, 0);
  ud(rope).live = true;
  site.add(rope);
  return { sheave, rope };
}

/**
 * The pithead (hole 1): the cage, a timed tunnel, stops at the landing while
 * the chain has it and drops down its shaft between. A timber headframe over
 * it, its sheave turning with the rope as the cage goes; the landing's two
 * iron leaves stand open while it is there or moving and lie shut over the
 * shaft when it is down (a ball rolls over them, into the open shaft
 * behind). The shaft goes on down timbered, lanterns on its walls. A ball in
 * the cage rides it down, the camera dropping with it, and comes out of the
 * station at the pit bottom (the tunnel's exit): a portal with a cage at rest
 * in it.
 */
// the shaft's lining, seen from inside (one for every build: a material made per visit and shared was never freed)
const SHAFT_LINING = share(flat(0x33241a, { side: THREE.BackSide }));
function pithead(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), { cx, cz, hx, hz } = boxOf(z), y = t.height(cx, cz), rand = seeded("pithead" + z.min.join());
  const a = openTo(s, t, cx, cz, s.start), da = headV(a);
  const site = facing(new THREE.Group(), a);
  site.position.set(cx, y, cz);
  g.add(site);
  const hole = Math.min(hx, hz) * 0.72; // the landing's opening (course.ts leaves those cells open)
  // the shaft down from the landing: timber lagging on four sides, a set of
  // beams every two, lanterns every few
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(hole * 2, SHAFT_D + 2, hole * 2).translate(0, -(SHAFT_D + 2) / 2 - 0.02, 0), SHAFT_LINING);
  site.add(shaft);
  for (let d = 1.2; d < SHAFT_D + 1; d += 2)
    for (const [w, dd, x, zz] of [[hole * 2, 0.2, 0, -hole + 0.1], [hole * 2, 0.2, 0, hole - 0.1], [0.2, hole * 2, -hole + 0.1, 0], [0.2, hole * 2, hole - 0.1, 0]] as const) {
      const b = slat(w, 0.18, dd, TIMBER_DARK, wood);
      b.position.set(x, -d, zz);
      site.add(b);
    }
  for (let d = 2.2, k = 0; d < SHAFT_D; d += 3.1, k++) {
    const l = lantern(0.55); // (the world's lantern, hung by its ring: it dims with every other in Lights out and the dark)
    l.position.set(hole - 0.6, 0.12 - d, k % 2 ? 0.45 : -0.45); // (off the far wall: the camera comes down the near side)
    site.add(l);
  }
  collar(site, hole, 0.25, 0.08, 0); // (flush round the landing)
  const drops = s.zones.filter((q) => q.kind === "hazard" && /void|shaft|crumble/.test(q.skin) && q !== z);
  const H = 8.6, R = 1.25, { sheave, rope } = headframe(site, H, hole + 1.7, R, rand, false, (x, zz) => drops.some((q) => inZone(q, x, zz)));
  // the cage, and the landing's leaves
  // (the cage sized from its opening: 0.2 clear of the shaft's sets each side on its way down)
  const c = bakeLocal(cage(2 * hole - 0.6));
  ud(c).live = true;
  site.add(c);
  // the leaves hinged just outside the opening, opening outward (off the cage's sides), a notch between them for the rope
  const leaves = [-1, 1].map((sz) => {
    const pivot = new THREE.Group(), leaf = plate(hole * 2 - 0.04, 0.06, hole - 0.08);
    leaf.position.set(0, 0, -sz * (hole / 2 + 0.03));
    pivot.add(leaf);
    pivot.position.set(0, 0.03, sz * (hole + 0.05));
    ud(pivot).live = true;
    site.add(pivot);
    return [pivot, sz] as const;
  });
  // the clock: at the landing through its window, down and away between
  const clock = clockOf(z), E = z.every || 1, ON = z.on || 0;
  let ride = -2; // a ride's cage depth, while one carries the ball (-2: none)
  // the counterweight, in the headframe behind the sheave: up as the cage goes down (half its travel)
  const cw = beam(0.6, 0.9, 0.5, TIMBER_DARK), cwRope = tinted(new THREE.CylinderGeometry(0.03, 0.03, 1, 5).translate(0, -0.5, 0), MINES.ink);
  cwRope.position.set(2 * R, H + 0.2 + R, 0);
  for (const o of [cw, cwRope]) ((ud(o).live = true), site.add(o));
  const depth = () => (ride > -2 ? ride : hoist(clock.phase(), E, ON, SHAFT_D));
  animate(() => {
    const d = depth();
    c.position.y = d;
    c.visible = ride > -2 || d > -Math.min(3.8, SHAFT_D) - 1e-3; // (under its leaves, shut once it is down its first 3.8, it is not drawn: on the landing only through its window, as the chain has it)
    rope.scale.y = H + 0.2 + R - (d + 3.4);
    sheave.rotation.z = (d / R) % (Math.PI * 2);
    cw.position.set(2 * R, 1.8 - 0.45 * d, 0); // (its foot over a ball's head at its lowest)
    cwRope.scale.y = H + 0.2 + R - (cw.position.y + 0.45);
    // the leaves open through the window (and a ride), shut over the landing a 0.3 substep either side of it, as the cage goes
    const ph = clock.phase(), o = ride > -2 ? 1 : ph < ON ? 1 : ph < ON + 0.3 ? 1 - smoothstep((ph - ON) / 0.3) : ph > E - 0.3 ? smoothstep((ph - (E - 0.3)) / 0.3) : 0;
    for (const [pv, sz] of leaves) pv.rotation.x = -sz * o * (Math.PI / 2 + 0.15); // (opening outward, past upright, off the cage's sides)
  });
  // the station at the pit bottom (the exit): a portal with a cage at rest in its dark
  const [ox, oz] = z.vec, oy = t.height(ox, oz), ob = openTo(s, t, ox, oz, s.cup), db = headV(ob);
  // (where no station fits, off the lane and clear of the drop, a hatch in the floor: the ball comes up through it)
  const st = mouthAt(s, t, ox - db.x * 2, oz - db.z * 2, ob, 2.6, 2.6, 2.6, rand, { foot: false, y: oy }), ex = st.on > 0 || st.n > 8 ? exitOf(s, t, ox, oz, rand, true) : null;
  if (ex) g.add(ex.piece);
  else {
    const parked = cage();
    parked.position.set(Math.min(1.6, st.D - 0.9), 0, 0);
    st.piece.add(parked);
    g.add(st.piece);
  }
  // the ride: down the shaft in the cage, along the pit bottom, out of the station (or up out of the hatch)
  const top0 = new THREE.Vector3(cx, y + BALL_R, cz), bottom = top0.clone().setY(y - SHAFT_D + BALL_R), out = new THREE.Vector3(ox, oy + BALL_R, oz);
  const inside = ex ? ex.from.clone().setY(ex.from.y + BALL_R) : new THREE.Vector3(ox - db.x * 3.1, oy + BALL_R, oz - db.z * 3.1);
  const path = new THREE.CurvePath<THREE.Vector3>();
  path.add(new THREE.LineCurve3(top0, bottom));
  path.add(new THREE.LineCurve3(bottom, inside.clone().setY(bottom.y)));
  path.add(new THREE.LineCurve3(inside.clone().setY(bottom.y), inside));
  path.add(new THREE.LineCurve3(inside, out));
  const L = path.getCurveLengths(), total = L[L.length - 1], u1 = L[0] / total, u3 = L[2] / total;
  const to = out.clone().addScaledVector(db, 6.5).setY(oy + 3.4);
  const plunge: Ride = {
    ms: 3000,
    // the plunge (gathering speed), the dark, out of the station
    ease: (k) => (k < 0.42 ? u1 * (k / 0.42) ** 2 : k < 0.72 ? u1 + (u3 - u1) * ((k - 0.42) / 0.3) : u3 + (1 - u3) * smoothstep((k - 0.72) / 0.28)),
    at: (k, ball) => {
      ride = k < 0 ? -2 : k < 0.42 ? ball.position.y - BALL_R - y : -SHAFT_D;
      ball.visible = k < 0 || k < 0.45 || k > 0.8;
    },
    cam: (k, pos, look) => {
      if (k < 0.42) {
        // over the landing, then down the shaft over the cage, the lanterns going by
        const b = top0.y - SHAFT_D * (k / 0.42) ** 2, inShaft = b < y - 0.5;
        pos.set(cx + da.x * (inShaft ? 0.55 : 2.4), Math.max(b + 2.8, y - SHAFT_D + 3.2), cz + da.z * (inShaft ? 0.55 : 2.4));
        look.set(cx - da.x * 0.2, b - 1, cz - da.z * 0.2);
        return true;
      }
      // a cut to the pit bottom: the station (the hatch), the ball coming out of it
      pos.copy(to);
      look.lerpVectors(inside, out, smoothstep((k - 0.62) / 0.3));
      return "cut";
    },
  };
  rides(z, path, ex ? withLid(ex, plunge, 0.75) : plunge);
  return g;
}

// ------------------------------------------------------------ adits, chutes, manways

/** An adit (hole 13, 14): a timbered mouth in the rock at the zone, another where it comes out, and the dark between. */
function aditPair(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), { cx, cz } = boxOf(z), y = t.height(cx, cz), rand = seeded("adit" + z.min.join());
  const a = openTo(s, t, cx, cz, s.start), da = headV(a), [ox, oz] = z.vec, oy = t.height(ox, oz), b = openTo(s, t, ox, oz, s.cup), db = headV(b);
  g.add(mouthAt(s, t, cx - da.x * 1.6, cz - da.z * 1.6, a, 2.4, 2.3, 2.1, rand, { foot: false, own: z, y }).piece);
  // the adit's boarded landing: planks over the lane where the chain takes the ball in (the zone), running into the mouth
  const { hx, hz } = boxOf(z), holes = s.zones.filter((q) => q.kind === "hazard" && !q.every);
  g.add(planks([{ inside: (px, pz) => inZone(z, px, pz) && t.onGreen(px, pz) && !holes.some((q) => inZone(q, px, pz)), top: (px, pz) => drawnGround(t, px, pz) + 0.08, box: [cx - hx, cz - hz, cx + hx, cz + hz], angle: a }], wood));
  // where it comes out: a timbered mouth against the rock, or in open lane a hatch in the floor
  const open = inOpen(s, t, ox, oz), ex = open ? exitOf(s, t, ox, oz, rand) : null;
  if (ex) g.add(ex.piece);
  else {
    g.add(mouthAt(s, t, ox - db.x * 1.3, oz - db.z * 1.3, b, 2.4, 2.3, 2.1, rand, { foot: false, y: oy }).piece);
  }
  const { curve, ride } = transit(new THREE.Vector3(cx, y + BALL_R, cz), a, new THREE.Vector3(ox, oy + BALL_R, oz), b, { back0: 1.8, back1: open ? 0.2 : 2.3, deep: open ? 2.2 : 1.6 });
  rides(z, curve, ex ? withLid(ex, ride) : ride);
  return g;
}

/**
 * A timber ore chute's trough, L long, falling at `fall` over it, its top
 * end at 0 (local: running along +x, down): a plank floor and sides, iron
 * bands round it, worn to the wood in its bed.
 */
function trough(L: number, fall: number, W = 1.3, rand: Rand = wood) {
  const g = new THREE.Group(), sl = Math.atan2(fall, L), run = Math.hypot(L, fall);
  // its bed boards along it (the kit's planks: each its own tone, bevel and nails), their tops where the old slab's was
  const bed = planks([{ inside: (x, z) => Math.abs(x) <= run / 2 && Math.abs(z) <= W / 2, top: () => 0.06, box: [-run / 2, -W / 2, run / 2, W / 2], angle: 0 }], rand, { tone: TIMBER_LIGHT });
  bed.position.set(L / 2, -fall / 2, 0);
  bed.rotation.z = -sl;
  g.add(bed);
  for (const sz of [-1, 1]) {
    const side = beam(run, 0.5, 0.12);
    side.position.set(L / 2, -fall / 2 + 0.25, sz * (W / 2 + 0.03));
    side.rotation.z = -sl;
    g.add(side);
  }
  for (let u = 0.3; u < run; u += 0.9) {
    const band = plate(0.1, 0.1, W + 0.3, IRON_DARK), x = u * Math.cos(sl), yy = -u * Math.sin(sl);
    band.position.set(x, yy - 0.08, 0);
    band.rotation.z = -sl;
    g.add(band);
    for (const sz of [-1, 1]) {
      const strap = plate(0.1, 0.62, 0.05, IRON_DARK);
      strap.position.set(x, yy + 0.22, sz * (W / 2 + 0.12));
      strap.rotation.z = -sl;
      g.add(strap);
    }
  }
  return g;
}

/** Whether (x, z) stands in open lane (lane all round it within 2.6): an exit there comes up out of the floor, not out of a wall. */
function inOpen(s: Hole, t: Terrain, x: number, z: number) {
  const holes = s.zones.filter((q) => q.kind === "hazard" && !q.every);
  let n = 0;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, px = x + Math.cos(a) * 2.6, pz = z + Math.sin(a) * 2.6;
    if (t.onGreen(px, pz) && !holes.some((q) => inZone(q, px, pz))) n++;
  }
  return n >= 13;
}

/**
 * Where a chute or a manway comes out: in open lane a hatch in the floor, a
 * timber collar round an iron grating and its lid, which flies open as the
 * ball pops out (open(1)); against the rock a spout, a trough out of a
 * timbered mouth, down onto the lane. Returns the piece, the point the ball
 * leaves it from (under the floor, or up the spout) and the lid's hinge.
 */
function exitOf(s: Hole, t: Terrain, x: number, z: number, rand: Rand, hatch = false) {
  const y = t.height(x, z), b = openTo(s, t, x, z, s.cup), db = headV(b), g = facing(new THREE.Group(), b);
  g.position.set(x, y, z);
  if (hatch || inOpen(s, t, x, z)) {
    collar(g, 0.75, 0.24, 0.1, 0.05); // (its corners clear of the paving's rubble, 0.065 up)
    // the dark under the grating (a hole in the floor, not lane), and a stop post the lid comes to rest on, past upright
    const dark = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 1.5), DARK_FRONT);
    dark.position.y = 0.025; // (over the lane's paving, under the grate)
    const stop = beam(0.14, 0.75, 0.14, TIMBER_DARK);
    stop.position.set(1.05, 0.37, 0.55);
    g.add(dark, stop);
    const hinge = new THREE.Group(), lid = new THREE.Group();
    // (its bars plain iron, dark as ink, no outline: the lid is one draw)
    for (let k = 0; k < 5; k++) {
      const bar = tinted(new THREE.BoxGeometry(1.5, 0.06, 0.12), IRON_DARK);
      bar.position.set(-0.75, 0.04, -0.6 + k * 0.3);
      lid.add(bar);
    }
    for (const zz of [-0.72, 0.72]) {
      const edge = tinted(new THREE.BoxGeometry(1.5, 0.08, 0.08), MINES.ink);
      edge.position.set(-0.75, 0.05, zz);
      lid.add(edge);
    }
    hinge.add(bakeLocal(lid));
    hinge.position.set(0.75, 0.03, 0);
    ud(hinge).live = true;
    g.add(hinge);
    return { piece: g, from: new THREE.Vector3(x, y - 1.2, z), up: false, lid: hinge };
  }
  // a spout: a trough down out of a low timbered mouth
  const mouth = portal(2, 2, 1.7, rand, { foot: false });
  mouth.position.set(3.7, 1.25, 0);
  const sp = trough(2.8, 1.25);
  sp.rotation.y = Math.PI; // (it runs down toward the lane, −x)
  sp.position.set(3.7, 1.3, 0);
  const prop = beam(0.18, 1.3, 0.18, TIMBER_DARK);
  prop.position.set(1.6, 0.6, 0);
  g.add(mouth, sp, prop);
  return { piece: g, from: new THREE.Vector3(x, y + BALL_R + 1.3, z).addScaledVector(db, -3.6), up: true, lid: null };
}

/** A ride whose way out has a lid (exitOf's hatch): it flies open as the ball comes up (from `at` of the ride). */
function withLid(ex: ReturnType<typeof exitOf>, ride: Ride, at = 0.7): Ride {
  const lid = ex.lid;
  if (!lid) return ride;
  const opened = easer(10), at0 = ride.at;
  let want = 0;
  animate((tt) => void (lid.rotation.z = -opened(want, tt) * 1.9));
  return { ...ride, at: (k, ball) => ((want = k > at ? 1 : 0), at0 && at0(k, ball)) };
}

/**
 * An ore chute (hole 3) or the stamp mill's hopper (hole 6): the ball drops
 * into a timber trough under a low timbered mouth in the rock (the chute's)
 * or into a funnel of planks over the zone (the hopper's), and comes out
 * where the tunnel leads (exitOf): up out of a hatch, or down a spout.
 */
function chute(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), { cx, cz, hx, hz } = boxOf(z), y = t.height(cx, cz), rand = seeded("chute" + z.min.join());
  const hopper = z.skin === "hopper", a = openTo(s, t, cx, cz, s.start), da = headV(a);
  const mouth = facing(new THREE.Group(), a);
  mouth.position.set(cx, y, cz);
  g.add(mouth);
  let into: THREE.Vector3;
  if (hopper) {
    // a funnel of planks over the opening (course.ts leaves it open), its rim flush with the belt's end
    const h = Math.min(hx, hz) * 0.72, deep = 2.6, throat = 0.55;
    for (let i = 0; i < 4; i++) {
      const wall = new THREE.Group(), slope = Math.atan2(h - throat, deep), len = Math.hypot(h - throat, deep);
      // each wall the kit's boards, laid across it (a deck on its side: its top the wall's inner face, where the old
      // slab's was), as wide as the funnel at their height (and a hair more: the corners close)
      const half = (v: number) => throat + (h - throat) * (v / len + 0.5) + 0.08;
      const boards = planks([{ inside: (x, v) => Math.abs(v) <= len / 2 && Math.abs(x) <= half(v), top: () => 0.06, box: [-h - 0.1, -len / 2, h + 0.1, len / 2], angle: 0 }], wood, { tone: i % 2 ? TIMBER : TIMBER_DARK });
      boards.rotation.x = -Math.PI / 2;
      boards.position.set(0, -len / 2, 0);
      wall.add(boards);
      wall.rotation.set(slope, (i * Math.PI) / 2, 0, "YXZ"); // (leaning in to the throat)
      wall.position.set(Math.sin((i * Math.PI) / 2) * h, 0, Math.cos((i * Math.PI) / 2) * h);
      mouth.add(wall);
    }
    collar(mouth, h, 0.26, 0.14, 0.02);
    const dark = new THREE.Mesh(new THREE.CircleGeometry(throat * 1.2, 12).rotateX(-Math.PI / 2), DARK_FRONT);
    dark.position.y = -deep + 0.05;
    mouth.add(dark);
    into = new THREE.Vector3(cx, y - deep + 0.6, cz);
  } else {
    // the chute's head: a low timbered mouth, a trough down into its dark
    const m = portal(2.4, 1.9, 1.5, rand, { foot: false });
    m.position.set(0.6, 0, 0);
    const tr = trough(2.4, 0.9, 1.2); // (from the lane, down into the rock along +x)
    tr.position.set(-0.3, 0.02, 0);
    mouth.add(m, tr);
    into = new THREE.Vector3(cx, y + BALL_R - 0.9, cz).addScaledVector(da, -2.4);
  }
  const [ox, oz] = z.vec, oy = t.height(ox, oz), ex = exitOf(s, t, ox, oz, rand), db = headV(openTo(s, t, ox, oz, s.cup));
  g.add(ex.piece);
  // the ride: into the chute, through the dark, out where it leads
  const a0 = new THREE.Vector3(cx, y + BALL_R, cz), out = new THREE.Vector3(ox, oy + BALL_R, oz), deepY = Math.min(y, oy) - 1.8; // (a shallow run: straight in, straight out)
  const pts = ex.up
    ? [a0, into, into.clone().lerp(ex.from, 0.5).setY(deepY), ex.from.clone().addScaledVector(db, -1.2), ex.from, out.clone().addScaledVector(db, -0.9).setY(out.y + 0.25), out]
    : [a0, into, into.clone().lerp(ex.from, 0.5).setY(deepY), ex.from, out.clone().setY(out.y + 0.9), out];
  const curve = new THREE.CatmullRomCurve3(pts);
  rides(z, curve, withLid(ex, {
    ms: 2200,
    at: (k, ball) => void (ball.visible = k < 0 || k < 0.2 || k > 0.74),
    cam: cutCam(a0, da, out, db, ex.from, 0.2),
  }, 0.72));
  return g;
}

/**
 * A manway (hole 8's ladder): a timber collar round a square hole in the
 * floor (course.ts leaves it open), a ladder going down into the dark and
 * standing up out of it; the ball climbs out where it leads (exitOf).
 */
function manway(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), { cx, cz, hx, hz } = boxOf(z), y = t.height(cx, cz), h = Math.min(hx, hz) * 0.72, rand = seeded("manway" + z.min.join());
  const a = openTo(s, t, cx, cz, s.start);
  const top = facing(new THREE.Group(), a);
  top.position.set(cx, y, cz);
  // the shaft under it: timber lining a unit and a half down its four sides (seen from the void's side too: timber, not
  // a dark block), then the dark
  for (let i = 0; i < 4; i++) {
    const side = beam(h * 2 + 0.24, 1.5, 0.12, TIMBER_DARK), q = (i * Math.PI) / 2;
    side.rotation.y = q;
    side.position.set(Math.sin(q) * (h + 0.06), -0.78, Math.cos(q) * (h + 0.06));
    top.add(side);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(h * 2, 0.1, h * 2).translate(0, -1.55, 0), DARK_FRONT);
  top.add(floor);
  collar(top, h, 0.25, 0.12);
  const ladder = new THREE.Group(), len = 2.95; // (from the lining's dark floor to a rung over the lane)
  for (const sz of [-0.32, 0.32]) {
    const rail = slat(0.1, len, 0.1, TIMBER, wood);
    rail.position.set(0, len / 2, sz);
    ladder.add(rail);
  }
  for (let u = 0.25; u < len; u += 0.32) {
    const rung = tinted(new THREE.CylinderGeometry(0.035, 0.035, 0.64, 5).rotateX(Math.PI / 2), TIMBER_DARK);
    rung.position.set(0, u, 0);
    ladder.add(rung);
  }
  ladder.position.set(h - 0.15, -1.55, 0);
  ladder.rotation.z = 0.12;
  top.add(ladder);
  g.add(top);
  const [ox, oz] = z.vec, oy = t.height(ox, oz), ex = exitOf(s, t, ox, oz, rand), b = openTo(s, t, ox, oz, s.cup);
  g.add(ex.piece);
  const { curve, ride } = transit(new THREE.Vector3(cx, y + BALL_R, cz), a, new THREE.Vector3(ox, oy + BALL_R, oz), b, { back0: 0.2, back1: ex.up ? 3.4 : 0.2, deep: 2.2 });
  rides(z, curve, withLid(ex, ride));
  return g;
}

// ------------------------------------------------------------ the cart ride

/** A hexagonal timber post from a to b, r thick (a trestle's leg: cheaper than a rounded beam). */
const post = (a: THREE.Vector3, b: THREE.Vector3, r: number, color: number = TIMBER_DARK) => between(solid(new THREE.CylinderGeometry(r, r * 1.1, a.distanceTo(b), 6).rotateX(Math.PI / 2), color, INK_THIN), a, b);
/** Flat unit vector to the right of a curve's heading at u. */
function sideAt(c: THREE.Curve<THREE.Vector3>, u: number, out = new THREE.Vector3()) {
  const tg = c.getTangentAt(u);
  return out.set(-tg.z, 0, tg.x).normalize();
}

/**
 * A track along a curve (u from a to b of it, by length): iron rails over
 * timber sleepers, and where it runs over the deep (deep(x, z, y)), trestle
 * bents under it: two splayed legs going down into the dark, a cap, a
 * brace; now and then a rock pillar with crystal on it takes a bent.
 */
function trackAlong(c: THREE.Curve<THREE.Vector3>, gg: number, rand: Rand, deep: (x: number, z: number, y: number) => boolean, a = 0, b = 1, bare = 0, drop: (x: number, z: number) => boolean = () => true, battened: (x: number, z: number) => boolean = () => false) {
  const g = new THREE.Group(), L = c.getLength() * (b - a), sd = new THREE.Vector3();
  const pts: THREE.Vector3[] = [];
  for (let i = 0, n = Math.max(2, Math.ceil(L / 0.9)); i <= n; i++) pts.push(c.getPointAt(a + ((b - a) * i) / n)); // (a point every 0.9: the rails' bends read, the triangles a third fewer)
  for (const off of [-gg, gg]) g.add(sweep(pts, RAIL.map(([o, y]) => [o + off, y] as const), 0x9aa3ad));
  for (let d = 0.2 + bare; d < L; d += 0.7) {
    const u = a + (b - a) * (d / L), p = c.getPointAt(u), q = c.getPointAt(Math.min(b, u + 0.2 / (L / (b - a)))), r = c.getPointAt(Math.max(a, u - 0.2 / (L / (b - a))));
    // (over a drop at the lane's level, even half: the rails alone, nothing to stand on)
    if ((deep(p.x, p.z, p.y) || deep(q.x, q.z, q.y) || deep(r.x, r.z, r.y)) && p.y > -1) continue;
    if (battened(p.x, p.z)) continue; // (up an incline its own battens carry the rails: no sleeper laid on them)
    const sl = slat(0.24, 0.07, gg * 2 + 0.55, rand() < 0.5 ? TIMBER_DARK : TIMBER, wood);
    sl.position.copy(p).setY(p.y - 0.05); // (its top a hundredth under the rails' foot)
    sideAt(c, u, sd);
    sl.up.crossVectors(sd, c.getTangentAt(u)).normalize(); // (square to the rails' own fall: flat on an incline, no corner standing proud)
    sl.lookAt(p.clone().add(sd).setY(p.y - 0.05));
    g.add(sl);
  }
  let k = 0;
  for (let d = 0.8; d < L; d += 1.6) { // (a bent every 1.6: nothing of the track more than 0.8 from one)
    const u = a + (b - a) * (d / L), p = c.getPointAt(u);
    if (!deep(p.x, p.z, p.y)) continue;
    sideAt(c, u, sd);
    const void_ = drop(p.x, p.z), top = p.y - 0.14, low = void_ ? p.y - 13 : p.y - 1.4; // (over lava its legs go into it, not on down)
    for (const sg of [-1, 1]) g.add(post(p.clone().addScaledVector(sd, sg * (gg + 0.2)).setY(top), p.clone().addScaledVector(sd, sg * (gg + 1.1)).setY(low), 0.11));
    const cap = slat(0.26, 0.2, gg * 2 + 0.9, TIMBER, wood);
    cap.position.copy(p).setY(top - 0.08);
    cap.lookAt(p.clone().add(sd).setY(top - 0.08));
    g.add(cap);
    g.add(post(p.clone().addScaledVector(sd, -(gg + 0.35)).setY(top - 0.5), p.clone().addScaledVector(sd, gg + 0.6).setY(top - 3.2), 0.06));
    if (void_ && k++ % 3 === 1) {
      const pillar = rock(2.2, 12, 2.4, rand); // (a column up out of the dark)
      pillar.position.copy(p).setY(p.y - 18.6);
      const gems = crystalCluster(rand, 1.3);
      gems.position.copy(p).setY(p.y - 6.6).addScaledVector(sd, 0.9);
      g.add(pillar, gems);
    }
  }
  return g;
}

/** A buffer stop at p across a track going along `dir` (flat unit), gauge gg: two legs and a timber bar at a cart's buffers' height. */
function bufferStop(p: THREE.Vector3, dir: THREE.Vector3, gg: number) {
  const g = new THREE.Group(), side = new THREE.Vector3(-dir.z, 0, dir.x);
  for (const o of [-gg - 0.1, gg + 0.1]) {
    const leg = beam(0.22, 0.9, 0.22);
    leg.position.copy(p).addScaledVector(side, o).setY(p.y + 0.45);
    g.add(leg);
  }
  const bar = beam(0.3, 0.3, gg * 2 + 0.8, TIMBER);
  bar.position.copy(p).setY(p.y + 0.75);
  bar.lookAt(bar.position.clone().add(side));
  g.add(bar);
  // leather pads on its face where a cart's buffers meet it (it gives: soft)
  for (const o of [-gg * 0.7, gg * 0.7]) {
    const pad = solid(rbox(0.16, 0.3, 0.34, 0.07), 0x5a3522, INK_THIN);
    pad.position.copy(p).addScaledVector(side, o).addScaledVector(dir, -0.2).setY(p.y + 0.75);
    pad.lookAt(pad.position.clone().add(side));
    g.add(pad);
  }
  return g;
}

const CART_PAINT: readonly number[] = [0xb8402f, 0x3f64a8]; // the red cart, the blue

/**
 * The cart ride (hole 14's red and blue carts, 18's red): each `cart ride`
 * is a timed tunnel shaped like the cart it is, waiting in its berth on a
 * track that runs downhill away from the station. The station is drawn once
 * for all of them: the track from the berths to its end (a trestle over a
 * pit on its way, a buffer stop at its end), and for a cart whose exit is
 * far away the roller coaster its carts go down: a switch off the track, a
 * dive on trestles over the deep, round a banked bend and into a portal in
 * the rock; at its far end a portal, a run and the buffers by the exit.
 * On the clock each cart rises into its berth on a lift before its window,
 * waits through it, and goes: down the coaster, gone into the portal. A
 * ball in one rides it: down the coaster with the camera behind it (the
 * trailer shot), through the dark, out of the far portal into the buffers,
 * and flung on to the exit; a cart going to a near exit (the siding) runs
 * along the track instead. The ridden cart stays where it stopped.
 */
function cartRide(z: Zone, t: Terrain, s: Hole) {
  const all = s.zones.filter((q) => q.skin === "cart ride" && q.kind === "tunnel"), first = all[0] === z;
  const g = new THREE.Group(), rand = seeded("cartride" + z.min.join()), gg = gauge(1.6);
  const { cx, cz } = boxOf(z), y = t.height(cx, cz);
  // the track's heading: down the incline the berths stand on, else along the berths
  const hill = s.zones.find((q) => q.kind === "slope" && inZone(q, cx, cz));
  const ref = hill ? Math.atan2(hill.vec[1], hill.vec[0]) : 0, u = headV(ref), sd = new THREE.Vector3(-u.z, 0, u.x);
  const holes = s.zones.filter((q) => q.kind === "hazard" && !q.every), lane = (x: number, zz: number) => t.onGreen(x, zz) && !holes.some((q) => inZone(q, x, zz));
  const along = (p: THREE.Vector3) => p.x * u.x + p.z * u.z;
  const berths = all.map((q) => { const b = boxOf(q); return new THREE.Vector3(b.cx, t.height(b.cx, b.cz), b.cz); });
  const W0 = berths.reduce((m, p) => (along(p) < along(m) ? p : m), berths[0]);
  // the track's end: on along the line while there is lane or a hazard to bridge, to the last lane
  let end = 0;
  for (let d = 0; d < 60; d += 0.5) {
    const x = W0.x + u.x * d, zz = W0.z + u.z * d;
    if (lane(x, zz)) end = d;
    else if (!t.onGreen(x, zz) && !holes.some((q) => inZone(q, x, zz))) break;
  }
  const P = (d: number, off = 0) => { const x = W0.x + u.x * d + sd.x * off, zz = W0.z + u.z * d + sd.z * off; return new THREE.Vector3(x, t.height(x, zz), zz); };
  // (the ground as the lane has it, carried over a hazard at the lane's level)
  // (over a hazard: from the ground before it to the ground after it, straight; off the lane's edge the ground is the ground)
  const over = (e: number) => holes.some((q) => inZone(q, W0.x + u.x * e, W0.z + u.z * e));
  const laneY = (d: number) => {
    if (!over(d)) return P(d).y;
    let a = d, b = d;
    while (a > 0 && over(a)) a -= 0.25;
    while (b < d + 20 && over(b)) b += 0.25;
    return over(b) ? P(a).y : P(a).y + ((P(b).y - P(a).y) * (d - a)) / (b - a);
  };
  const trackPt = (d: number) => P(d).setY(laneY(d) + 0.13); // (over an incline's slabs and battens, the sleepers' tops under 0.12) // (its sleepers clear over a deck's planks, an incline's slabs)
  // where the station track first leaves the lane (a pit): the switch stands before it
  let pit = end;
  for (let d = 0; d < end; d += 0.5) if (!lane(W0.x + u.x * d, W0.z + u.z * d)) { pit = d; break; }
  const sw = Math.max(0, pit - 2.2);
  // the far-going carts' side: toward their exits
  const far = all.filter((q) => { const e = new THREE.Vector3(q.vec[0], 0, q.vec[1]), off = (e.x - W0.x) * sd.x + (e.z - W0.z) * sd.z; return Math.abs(off) > 4 || along(e) < along(W0); });
  // the track ends past its pit where a cart stops beyond it (the siding), else at the pit's far side
  {
    let pitEnd = pit;
    while (pitEnd < end && !lane(W0.x + u.x * pitEnd, W0.z + u.z * pitEnd)) pitEnd += 0.5;
    const near = all.filter((q) => !far.includes(q)).map((q) => (q.vec[0] - W0.x) * u.x + (q.vec[1] - W0.z) * u.z);
    end = Math.min(end, near.length ? Math.max(pitEnd + 0.5, ...near.map((d) => d + 2.5)) : pitEnd + 0.5);
  }
  // the coaster's side: the one with the deep under it (never under a lane), else toward the exits
  const S0p = P(sw), onLaneCount = (g1: number) => [[2.5, 0.4], [5, 2.6], [6.5, 6.5], [4.5, 10.5], [0, 12.2], [-6, 12.8], [-12, 13]].filter(([d, o]) => { const x = S0p.x + u.x * d + sd.x * g1 * o, zz = S0p.z + u.z * d + sd.z * g1 * o; return x < 0 || zz < 0 || x > s.board.w || zz > s.board.h || t.onGreen(x, zz); }).length;
  const toward = far.length ? Math.sign(far.reduce((m, q) => m + (q.vec[0] - W0.x) * sd.x + (q.vec[1] - W0.z) * sd.z, 0)) || 1 : 1;
  const sg = onLaneCount(toward) <= onLaneCount(-toward) ? toward : -toward;
  // the coaster: off the switch, out over the deep, down and round, back along into a portal
  const S0 = trackPt(sw), Y = S0.y;
  // (it dives only over a drop, a void or a shaft: over lava or the lane it keeps over them, on its trestles)
  const drop = (x: number, zz: number) => s.zones.some((q) => q.kind === "hazard" && /void|shaft|crumble/.test(q.skin) && inZone(q, x, zz));
  const at = (d: number, off: number, dy: number) => { const p = S0.clone().addScaledVector(u, d).addScaledVector(sd, sg * off); return p.setY(Y + (drop(p.x, p.z) ? dy : Math.max(dy, -0.1))); };
  const station: THREE.Vector3[] = [];
  for (let d = -2.5; d < sw; d += 1.5) station.push(trackPt(d));
  const coaster = new THREE.CatmullRomCurve3([...station, S0, at(2.5, 0.4, -0.1), at(5, 2.6, -0.9), at(6.5, 6.5, -3.4), at(4.5, 10.5, -5.6), at(0, 12.2, -5.2), at(-6, 12.8, -4.6), at(-12, 13, -4.3)], false, "centripetal");
  const coastLen = coaster.getLength();
  const dOf = (p: THREE.Vector3) => { let best = 0, bd = Infinity; for (let i = 0; i <= 200; i++) { const q = coaster.getPointAt(i / 200), dd = q.distanceTo(p); if (dd < bd) (bd = dd), (best = i / 200); } return best * coastLen; };
  const deep = (x: number, zz: number, yy: number) => !lane(x, zz) || yy < t.height(x, zz) - 0.4;
  if (first) {
    // the station track, berths to its end (and over its pit), a buffer stop there
    // (on the lane's ground all along, down its incline: a point a unit)
    const n = Math.ceil(end + 3), line = new THREE.CatmullRomCurve3(Array.from({ length: n + 1 }, (_, i) => trackPt(-2.5 + ((end + 3) * i) / n)));
    g.add(trackAlong(line, gg, rand, (x, zz) => holes.some((q) => inZone(q, x, zz)), 0, 1, 0, undefined, (x, zz) => s.zones.some((q) => q.skin === "incline" && inZone(q, x, zz))));
    // a buffer stop at its end, where that is off the lane and on the rock
    const rockAt = (d: number, o = 0) => { const q = P(d, o); return !t.onGreen(q.x, q.z); };
    if ([-gg - 0.1, 0, gg + 0.1].every((o) => rockAt(end + 0.6, o))) g.add(bufferStop(P(end + 0.6).setY(laneY(end)), u, gg));
    if (far.length) {
      g.add(trackAlong(coaster, gg, rand, deep, dOf(at(2.5, 0.4, -0.1)) / coastLen, 1, 3, drop)); // (from where it has left the station track: no rail over its rails)
      // the points' lever by the switch, on the rock beside the lane
      const spot = [0.8, 1.6, 2.4, 3.2].flatMap((d) => [1.1, 1.8, 2.6].flatMap((o) => [-sg, sg].map((k) => [sw - d, k * (gg + o)]))).find(([d, o]) => rockAt(d, o));
      if (spot) {
        const lever = new THREE.Group(), stand = beam(0.3, 0.5, 0.3, TIMBER_DARK), arm = plate(0.08, 1.1, 0.08, RUST);
        stand.position.y = 0.25;
        arm.position.set(0, 0.8, 0);
        arm.rotation.z = 0.5;
        lever.add(stand, arm);
        lever.position.copy(P(spot[0], spot[1]));
        g.add(lever);
      }
      // the portal the coaster dives into, facing back up it
      const pe = coaster.getPointAt(1), te = coaster.getTangentAt(1);
      const pm = pe.clone().addScaledVector(te, 0.6);
      g.add(mouthAt(s, t, pm.x, pm.z, Math.atan2(-te.z, -te.x), 3, cartMouth(1.7).width, cartMouth(1.7).height, rand, { y: pe.y, fixed: true }).piece);
    }
  }
  // this cart's berth: the cart on its lift (the incline's slabs are its floor: no frame of its own laid on them)
  const paint = CART_PAINT[far.includes(z) ? 0 : 1]; // red down the coaster, blue to the siding (ADR §8)
  const make = () => {
    // (no bigger than its zone: what the chain has there is what is drawn, the ball passes beside it)
    const along = Math.abs((z.max[0] - z.min[0]) * u.x) + Math.abs((z.max[1] - z.min[1]) * u.z), across = Math.abs((z.max[0] - z.min[0]) * u.z) + Math.abs((z.max[1] - z.min[1]) * u.x);
    const c = oreCart(Math.min(2.3, along), Math.min(1.7, across), gg, rand, paint);
    const w = new THREE.Group();
    // (on a lift's iron platform, its rails on it: the berth's cart comes up on it out of the floor, and goes down on it)
    const deck = plate(Math.min(2.3, along) + 0.2, 0.1, Math.min(1.7, across) + 0.1, IRON_DARK);
    deck.position.y = -0.05;
    w.add(c, deck);
    bakeLocal(w);
    ud(w).live = true;
    return w;
  };
  const cart = make();
  g.add(cart);
  const dStart = dOf(new THREE.Vector3(cx, y, cz)), dPortal = coastLen;
  const onRoute = (d: number, o: THREE.Object3D) => {
    const uu = Math.min(1, Math.max(0, d / coastLen)), p = coaster.getPointAt(uu), tg = coaster.getTangentAt(uu);
    o.position.copy(p);
    o.rotation.set(0, Math.atan2(-tg.z, tg.x), Math.asin(Math.max(-1, Math.min(1, tg.y))), "YZX");
  };
  // the clock: up on the lift before the window, there through it, then away down the coaster
  const clock = clockOf(z), ON = z.on || 0;
  let riding = false;
  animate(() => {
    if (riding) return;
    const p = clock.phase();
    // (up out of the berth over the window's first 0.3 substep: before it the berth is lane, nothing on it)
    // (in its berth: on the zone itself, not the nearest point of the coaster's curve)
    if (p < ON) (onRoute(dStart, cart), cart.position.set(cx, y - 1.9 * (1 - smoothstep(p / 0.3)), cz), (cart.visible = true));
    // (after it, down again into its berth: it never drives out over the lane, where the chain has nothing)
    else if (p < ON + 0.3) (onRoute(dStart, cart), cart.position.set(cx, y - 1.9 * smoothstep((p - ON) / 0.3), cz), (cart.visible = true));
    else cart.visible = false;
  });
  // the ride
  const [ox, oz] = z.vec, oy = t.height(ox, oz), exit = new THREE.Vector3(ox, oy + BALL_R, oz);
  const isFar = far.includes(z), b = isFar ? openTo(s, t, ox, oz, s.cup) : ref, db = headV(b);
  const stopAt = exit.clone().addScaledVector(db, -(isFar ? 3.4 : 2.4)).setY(oy);
  const ridden = make();
  ridden.visible = false;
  g.add(ridden);
  const up = new THREE.Vector3(0, 1.55, 0), tmp = new THREE.Vector3();
  let arrive: THREE.CatmullRomCurve3 | null = null;
  if (isFar) {
    // the far end: a portal, a run on a ledge of trestle into the buffers
    const pw = stopAt.clone().addScaledVector(db, -7);
    arrive = new THREE.CatmullRomCurve3([pw.clone().setY(oy + 0.06), pw.clone().lerp(stopAt, 0.5).setY(oy + 0.06), stopAt.clone().setY(oy + 0.06)]); // (over the rubble laid there)
    g.add(trackAlong(arrive, gg, rand, deep));
    // the stop at the run's end, just past it (credibility 27): a timber block laid across between the rails, low on
    // the rubble, its top 0.1 up (a hair under the rails' heads: nothing standing proud of the lane, the ball rolls over it)
    const stop = beam(0.35, 0.08, gg * 2 - 0.22, TIMBER_DARK);
    stop.position.copy(stopAt).addScaledVector(db, 0.7).setY(oy + 0.06);
    stop.lookAt(stop.position.clone().add(db));
    g.add(stop);
    const pm = pw.clone().addScaledVector(db, -0.6);
    g.add(mouthAt(s, t, pm.x, pm.z, b, 3, cartMouth(1.7).width, cartMouth(1.7).height, rand, { y: pm.y, fixed: true }).piece);
  } else {
    arrive = new THREE.CatmullRomCurve3([new THREE.Vector3(cx, y, cz), new THREE.Vector3(cx, y, cz).lerp(stopAt, 0.5).setY(laneY(dOf(stopAt) - 1)), stopAt.clone().setY(laneY(along(stopAt) - along(W0)))]);
  }
  const arr = arrive;
  const placeOn = (c: THREE.CatmullRomCurve3, k: number, o: THREE.Object3D) => {
    const p = c.getPointAt(k), tg = c.getTangentAt(k);
    o.position.copy(p);
    o.rotation.set(0, Math.atan2(-tg.z, tg.x), 0);
  };
  const curve = new THREE.LineCurve3(new THREE.Vector3(cx, y + BALL_R, cz), exit);
  rides(z, curve, {
    ms: isFar ? 3400 : 2000,
    at: (k, ball) => {
      riding = k >= 0;
      if (k < 0) return;
      cart.visible = false;
      ridden.visible = true;
      if (isFar && k < 0.62) {
        onRoute(dStart + (dPortal - dStart) * (k / 0.62) ** 1.6, ridden);
        ridden.visible = ridden.position.distanceTo(coaster.getPointAt(1)) > 0.8;
        ball.position.copy(ridden.position).add(up);
        ball.visible = ridden.visible;
      } else if (isFar && k < 0.72) (ridden.visible = false), (ball.visible = false);
      else if (k < 0.9) {
        const q = isFar ? (k - 0.72) / 0.18 : k / 0.9;
        placeOn(arr, isFar ? 1 - (1 - q) ** 2 : q * q * (3 - 2 * q), ridden);
        ball.position.copy(ridden.position).add(up);
        ball.visible = true;
      } else {
        // into the buffers: the cart stops dead, the ball flies on
        placeOn(arr, 1, ridden);
        const q = (k - 0.9) / 0.1;
        ball.position.lerpVectors(tmp.copy(ridden.position).add(up), exit, q).y += Math.sin(Math.PI * q) * 1.2;
        ball.visible = true;
      }
    },
    cam: (k, pos, look) => {
      if (isFar && k < 0.62) {
        const d = dStart + (dPortal - dStart) * (k / 0.62) ** 1.6, uu = Math.min(0.999, d / coastLen), p = coaster.getPointAt(uu), tg = coaster.getTangentAt(uu);
        pos.copy(p).addScaledVector(tg, -6.2).y += 2.6;
        look.copy(p).addScaledVector(tg, 4).y += 0.8;
        return true;
      }
      if (!isFar) {
        // along the track behind the cart, into the siding
        pos.copy(ridden.position).addScaledVector(db, -6).y += 2.8;
        look.copy(ridden.position).addScaledVector(db, 4).y += 0.6;
        return true;
      }
      // (at the far end: from the lane, looking back at the portal, then at the ball)
      pos.copy(exit).addScaledVector(db, 5).addScaledVector(tmp.set(-db.z, 0, db.x), 2.4).setY(oy + 3.2);
      look.lerpVectors(arr.getPointAt(0), exit, smoothstep((k - 0.72) / 0.25));
      return "cut";
    },
  });
  return g;
}

// ------------------------------------------------------------ the cable car

/**
 * The cable car over the great shaft (hole 17): a timed tunnel where the car
 * docks at the rim. A gantry at each end (legs down onto rock columns out of
 * the deep where there is no ledge under them, a cross-head carrying the
 * bullwheel, a lantern), the track cable sagging between them over the
 * shaft, the haul rope under it, a counterweight hanging at the dock's
 * gantry; the car: an open iron gondola on its hanger and carriage. On the
 * clock it waits at the dock through its window, crosses, waits at the far
 * side and comes back for the next. A ball in it rides across, the camera
 * rising to look down past it into the shaft, and rolls out at the far rim;
 * the car waits there until the clock brings it back.
 */
function cableCar(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), rand = seeded("cablecar" + z.min.join());
  const pts = z.poly || [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]];
  const cx = pts.reduce((m, p) => m + p[0], 0) / pts.length, cz = pts.reduce((m, p) => m + p[1], 0) / pts.length, y = t.height(cx, cz);
  const [ox, oz] = z.vec, oy = t.height(ox, oz), dir = new THREE.Vector3(ox - cx, 0, oz - cz).normalize(), sd = new THREE.Vector3(-dir.z, 0, dir.x);
  const A = new THREE.Vector3(cx, y, cz), B = new THREE.Vector3(ox, oy, oz).addScaledVector(dir, -1.4), HANG = 3.3, CS = 1.45, TOP = (HANG + 0.2) * CS;
  const span = A.distanceTo(B), sag = Math.min(4, span * 0.05);
  const cable = (u: number, out: THREE.Vector3) => out.lerpVectors(A, B, u).setY(A.y + (B.y - A.y) * u + TOP - sag * 4 * u * (1 - u));
  const holes = s.zones.filter((q) => q.kind === "hazard" && !q.every), onLedge = (x: number, zz: number) => t.onGreen(x, zz) && !holes.some((q) => inZone(q, x, zz));
  // the gantries
  const gantry = (at: THREE.Vector3, sign: number) => {
    const grp = new THREE.Group();
    for (const o of [-1.9, 1.9]) {
      const f = at.clone().addScaledVector(sd, o).addScaledVector(dir, -sign * 0.8), top = at.clone().addScaledVector(sd, o * 0.55).setY(at.y + TOP + 0.9);
      const foot = onLedge(f.x, f.z) ? f.setY(at.y) : f.setY(at.y - 1.2);
      grp.add(strut(foot, top, 0.3, 0.3));
      if (!onLedge(f.x, f.z)) {
        const col = rock(1.8, 12, 1.8, rand);
        col.position.copy(foot).setY(foot.y - 12.4);
        grp.add(col);
      } else {
        const pad = rock(0.9, 0.35, 0.9, rand);
        pad.position.copy(foot).setY(foot.y - 0.36);
        grp.add(pad);
      }
    }
    const head = beam(0.4, 0.34, 2.6, TIMBER);
    head.position.copy(at).setY(at.y + TOP + 0.95);
    head.lookAt(head.position.clone().add(sd));
    grp.add(head);
    // the bullwheel, flat on the cross-head, turning with the rope
    const wheel = new THREE.Group(), rim = tinted(new THREE.TorusGeometry(0.85, 0.08, 5, 22).rotateX(Math.PI / 2), IRON_DARK); // (dark iron, no outline: one draw as it turns)
    wheel.add(rim);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      wheel.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85), 0.04, IRON));
    }
    bakeLocal(wheel);
    ud(wheel).live = true;
    wheel.position.copy(at).addScaledVector(dir, -sign * 0.4).setY(at.y + TOP + 1.25);
    grp.add(wheel);
    const l = lantern(0.55); // (the world's lantern, hung by its ring: it dims with every other in Lights out and the dark)
    l.position.copy(at).addScaledVector(sd, 0.55).setY(at.y + TOP + 0.2); // (under the cross-head, between the legs)
    grp.add(l);
    return { grp, wheel };
  };
  const ga = gantry(A, 1), gb = gantry(B, -1);
  g.add(ga.grp, gb.grp);
  // the counterweight at the dock: a crate of rock on the rope's tail
  const cw = beam(0.7, 0.9, 0.7, TIMBER_DARK), cwAt = A.clone().addScaledVector(dir, -2.2).addScaledVector(sd, 1.9).setY(A.y + TOP - 1.6);
  cw.position.copy(cwAt);
  g.add(cw, rod(cwAt.clone().setY(cwAt.y + 0.55), A.clone().addScaledVector(dir, -0.4).setY(A.y + TOP + 1.25), 0.03, MINES.ink));
  // the track cable and the haul rope under it, sagging over the shaft
  const cpts: THREE.Vector3[] = [], hpts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) (cpts.push(cable(i / 40, new THREE.Vector3())), hpts.push(cable(i / 40, new THREE.Vector3()).setY(cable(i / 40, new THREE.Vector3()).y - 0.45 - 0.3 * Math.sin((Math.PI * i) / 40))));
  // anchored: the track cable up over a saddle on each cross-head and down behind it, the haul rope round each bullwheel's rim
  for (const [end, sign] of [[A, 1], [B, -1]] as const) {
    const saddle = end.clone().addScaledVector(dir, -sign * 0.2).setY(end.y + TOP + 1.18), back = end.clone().addScaledVector(dir, -sign * 1.6).setY(end.y + TOP + 0.2);
    const rim = end.clone().addScaledVector(dir, -sign * 0.4 + sign * 0.85).setY(end.y + TOP + 1.25);
    if (sign > 0) (cpts.unshift(back, saddle), hpts.unshift(rim));
    else (cpts.push(saddle, back), hpts.push(rim));
    const block = slat(0.4, 0.14, 0.3, IRON_DARK);
    block.position.copy(saddle).setY(saddle.y - 0.1);
    g.add(block);
  }
  g.add(sweep(cpts, [[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]], 0x2b2733));
  g.add(sweep(hpts, [[-0.03, -0.03], [0.03, -0.03], [0.03, 0.03], [-0.03, 0.03]], MINES.rope));
  // the car: carriage, hanger, an open gondola (floor, rails, corner posts, a lamp)
  const car = new THREE.Group();
  const floor = plate(1.9, 0.12, 2.4, IRON);
  floor.position.y = 0.06;
  car.add(floor);
  for (const x of [-0.9, 0.9]) for (const zz of [-1.15, 1.15]) {
    const p0 = slat(0.1, 1.2, 0.1, IRON_DARK);
    p0.position.set(x, 0.6, zz);
    car.add(p0);
  }
  for (const yy of [0.55, 1.15]) for (const [w, d, x, zz] of [[1.9, 0.07, 0, -1.15], [1.9, 0.07, 0, 1.15], [0.07, 2.3, 0.9, 0]] as const) {
    const rl = slat(w, 0.08, d, yy > 1 ? RUST : IRON_DARK);
    rl.position.set(x, yy, zz);
    car.add(rl);
  }
  const hanger = plate(0.12, HANG - 1.1, 0.12, IRON_DARK);
  hanger.position.set(0, 1.15 + (HANG - 1.1) / 2, 0);
  const yoke = plate(1.9, 0.1, 0.12, IRON_DARK);
  yoke.position.set(0, 1.2, 0);
  const carriage = plate(0.3, 0.3, 1.2, RUST);
  carriage.position.set(0, HANG + 0.1, 0);
  car.add(hanger, yoke, carriage);
  for (const zz of [-0.4, 0.4]) {
    const w = solid(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10).rotateZ(Math.PI / 2), IRON_DARK, INK);
    w.position.set(0, HANG + 0.25, zz);
    car.add(w);
  }
  const carM = bakeLocal(car); // (no lantern aboard: the car is two draws as it goes)
  ud(carM).live = true;
  carM.rotation.y = -Math.atan2(sd.z, sd.x); // (its length along the cable: local z across... its rails along the way)
  carM.scale.setScalar(CS); // (a car to carry a gnome across a great shaft: big)
  g.add(carM);
  const place = (u: number, sway: number) => {
    cable(u, carM.position).y -= (HANG + 0.2) * CS;
    carM.rotation.z = sway;
    ga.wheel.rotation.y = gb.wheel.rotation.y = (u * span) / 0.85;
  };
  // the clock: docked through its window, across, waiting, back
  const clock = clockOf(z), E = z.every || 1, ON = z.on || 0, cross = Math.max(2, (E - ON) / 2 - 1.5);
  let held = -1; // after a ride: parked at the far side until the clock comes there
  animate((tt) => {
    if (held >= 0) return;
    const p = clock.phase();
    // (out of the dock in the window's first 0.3 substep, and back in its last 0.3 before it: the chain has the dock lane then)
    // (across it waits short of the far dock, over the shaft: the chain has no car there, the lane by the far dock is lane)
    const OUT = 0.14, FAR = 1 - OUT, u = p < ON ? 0 : p < ON + 0.3 ? OUT * smoothstep((p - ON) / 0.3) : p < ON + cross ? OUT + (FAR - OUT) * smoothstep((p - ON - 0.3) / (cross - 0.3)) : p < E - cross ? FAR : p < E - 0.3 ? FAR - (FAR - OUT) * smoothstep((p - (E - cross)) / (cross - 0.3)) : OUT * (1 - smoothstep((p - (E - 0.3)) / 0.3));
    place(u, 0.03 * Math.sin(tt * 1.3) + (u > 0 && u < 1 ? 0.04 * Math.sin(u * 9) : 0));
  });
  state.timed.push({ at: (st) => { if (held >= 0 && mod(st + (z.phase ?? 0), E) >= ON + cross) held = -1; } });
  // a headframe out over the great shaft, on rock columns up from the deep,
  // its cage going down and up the shaft on its own (the hole's biggest
  // shaft; the side of it farthest from the cable)
  const big = s.zones.filter((q) => q.skin === "shaft" && q.kind === "hazard" && q.round).sort((p, q) => (q.max[0] - q.min[0]) * (q.max[1] - q.min[1]) - (p.max[0] - p.min[0]) * (p.max[1] - p.min[1]))[0];
  if (big) {
    const sb = boxOf(big), seg = (x: number, zz: number) => { const ab = B.clone().sub(A), k = Math.max(0, Math.min(1, ((x - A.x) * ab.x + (zz - A.z) * ab.z) / (ab.x * ab.x + ab.z * ab.z))); return Math.hypot(x - A.x - ab.x * k, zz - A.z - ab.z * k); };
    let best = 0, bd = -1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = sb.cx + Math.cos(a) * (sb.hx - 4), zz = sb.cz + Math.sin(a) * (sb.hz - 4), d = seg(x, zz);
      if (d > bd) (bd = d), (best = a);
    }
    const hx = sb.cx + Math.cos(best) * (sb.hx - 4.5), hz = sb.cz + Math.sin(best) * (sb.hz - 4.5), rim = t.height(sb.cx + Math.cos(best) * (sb.hx + 1), sb.cz + Math.sin(best) * (sb.hz + 1));
    const site = new THREE.Group();
    site.position.set(hx, rim, hz);
    site.rotation.y = -Math.atan2(sb.cz - hz, sb.cx - hx); // (its back legs lean in over the shaft)
    const Hh = 9.5, Rr = 1.25, { sheave, rope } = headframe(site, Hh, 3, Rr, rand, true);
    // (its sheave turning with its cage, one draw)
    const c = bakeLocal(cage());
    ud(c).live = true;
    site.add(c);
    g.add(site);
    animate((tt) => {
      const d = -3.5 - 3.5 * (1 - Math.cos(tt * 0.35)); // down and up, slowly
      c.position.y = d;
      rope.scale.y = Hh + 0.2 + Rr - (d + 3.4);
      sheave.rotation.z = (d / Rr) % (Math.PI * 2);
    });
  }
  // the ride: across the shaft in the car, out at the far rim
  const exit = new THREE.Vector3(ox, oy + BALL_R, oz), mid = new THREE.Vector3();
  const curve = new THREE.LineCurve3(new THREE.Vector3(cx, y + BALL_R, cz), exit);
  rides(z, curve, {
    ms: 3400,
    at: (k, ball) => {
      if (k < 0) return void (held = 1);
      held = 1;
      const u = smoothstep(Math.min(1, k / 0.88));
      place(u, 0.05 * Math.sin(k * 14) * (1 - u));
      ball.position.copy(carM.position).y += BALL_R + 0.12 * CS;
      if (k > 0.88) ball.position.lerp(exit, (k - 0.88) / 0.12);
    },
    cam: (k, pos, look) => {
      const u = smoothstep(Math.min(1, k / 0.88)), rise = Math.sin(Math.PI * u);
      cable(u, mid).y -= HANG * CS;
      // behind and beside the car, rising over it at mid-span to look down the shaft
      pos.copy(mid).addScaledVector(dir, -7 + 2 * rise).addScaledVector(sd, 4.5 - 1.5 * rise).y += 2 + 5 * rise;
      look.copy(mid).addScaledVector(dir, 3 * (1 - rise)).y -= 1.4 * rise;
      return true;
    },
  });
  return g;
}

// ------------------------------------------------------------ the corkscrew

/**
 * A U-trough swept along a curve (the corkscrew's ore chute): planks on
 * its bed, its open side toward up(u) (the loop's middle where it loops,
 * the sky elsewhere); iron bands round it now and then. r its half-width.
 */
function chuteAlong(c: THREE.Curve<THREE.Vector3>, up: (u: number, out: THREE.Vector3) => THREE.Vector3, r = 0.72, end = 1, start = 0) {
  const g = new THREE.Group(), n = Math.max(24, Math.ceil(c.getLength() * (end - start) * 3)), M = 9, T = new THREE.Vector3(), U = new THREE.Vector3(), Bn = new THREE.Vector3(), N = new THREE.Vector3();
  const pos: number[] = [], idx: number[] = [], col: number[] = [], wood = new THREE.Color(TIMBER_LIGHT), dark = new THREE.Color(TIMBER_DARK);
  for (let i = 0; i <= n; i++) {
    const u = start + (i / n) * (end - start), p = c.getPointAt(u);
    c.getTangentAt(u, T);
    Bn.crossVectors(T, up(u, U)).normalize();
    N.crossVectors(Bn, T).normalize();
    // (planks with a thickness: the bed's inner face, then its outer 0.08 further out; a ring of 2M a step)
    for (const k of [1, 1 + 0.08 / r]) for (let m = 0; m < M; m++) {
      const a = -Math.PI * 0.55 + (m / (M - 1)) * Math.PI * 1.1, q = p.clone().addScaledVector(Bn, Math.sin(a) * r * k).addScaledVector(N, -Math.cos(a) * r * 0.8 * k + 0.08);
      pos.push(q.x, q.y, q.z);
      const cc = (Math.floor(u * n * 0.5) % 2 ? wood : dark).clone().lerp(wood, 0.5).multiplyScalar(k > 1 ? 0.8 : 1);
      col.push(cc.r, cc.g, cc.b);
    }
    if (i) {
      const A = (i - 1) * 2 * M, B = i * 2 * M;
      for (let m = 0; m + 1 < M; m++) {
        idx.push(A + m, B + m, A + m + 1, A + m + 1, B + m, B + m + 1); // inner
        idx.push(A + M + m, A + M + m + 1, B + M + m, A + M + m + 1, B + M + m + 1, B + M + m); // outer
      }
      for (const m of [0, M - 1]) idx.push(A + m, A + M + m, B + m, B + m, A + M + m, B + M + m); // the two top edges
    }
  }
  // its two cut ends closed
  for (const R0 of [0, n * 2 * M]) for (let m = 0; m + 1 < M; m++) idx.push(R0 + m, R0 + m + 1, R0 + M + m, R0 + m + 1, R0 + M + m + 1, R0 + M + m);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, relief(THREE.DoubleSide)));
  // its ink: the rims
  for (const sgn of [-1, 1]) {
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const u = start + (i / n) * (end - start), p = c.getPointAt(u);
      c.getTangentAt(u, T);
      Bn.crossVectors(T, up(u, U)).normalize();
      N.crossVectors(Bn, T).normalize();
      rim.push(p.clone().addScaledVector(Bn, sgn * Math.sin(Math.PI * 0.55) * r).addScaledVector(N, -Math.cos(Math.PI * 0.55) * r * 0.8 + 0.08));
    }
    g.add(tinted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), n, 0.06, 5), IRON_DARK));
  }
  const Lc = c.getLength(), ds: number[] = [Lc * start + 0.12]; // (a band at either end too: the trough's cut edge finished in iron)
  for (let d = Lc * start + 0.6; d < Lc * end - 0.5; d += 1.4) ds.push(d);
  ds.push(Lc * end - 0.12);
  for (const d of ds) {
    const u = d / Lc, p = c.getPointAt(u);
    c.getTangentAt(u, T);
    const band = tinted(new THREE.TorusGeometry(r * 0.95, 0.05, 4, 12, Math.PI * 1.1), IRON_DARK);
    band.position.copy(p);
    band.lookAt(p.clone().add(T));
    Bn.crossVectors(T, up(u, U)).normalize();
    N.crossVectors(Bn, T).normalize();
    // (the band's arc under the bed: turned so its gap is the trough's open side)
    band.up.copy(N);
    band.lookAt(p.clone().add(T));
    band.rotateZ(Math.PI * 0.95);
    band.position.addScaledVector(N, 0.2);
    g.add(band);
  }
  return g;
}

/**
 * A corkscrew (hole 11's loops): an ore chute of timber and iron raised on
 * its own frame, a loop over the lane, stepping sideways as it goes round,
 * and running on down to where it lets the ball out, on posts. The lane runs
 * on under the loop (a ball not taken in rolls straight across, under it):
 * the way in is the points, a long timber blade hinged at the mouth that
 * lifts into a ramp up to the loop while the loop is there and lies flat on
 * the lane when it is not, a signal by it (green: into the loop; red:
 * straight on). The ball rides up the ramp, round the loop and down the
 * chute, the camera beside the loop, then behind.
 */
function corkscrew(z: Zone, t: Terrain, _s: Hole) {
  const g = new THREE.Group(), { cx, cz, w, h } = boxOf(z), y = t.height(cx, cz);
  const [ox, oz] = z.vec, oy = t.height(ox, oz);
  // the way in: across the zone's short side, away from the lane the ball comes from
  const ax = w <= h ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const lane = (sgn: number) => { let n = 0; for (let d = 1.5; d <= 4; d += 0.5) n += t.onGreen(cx + ax.x * sgn * d, cz + ax.z * sgn * d) ? 1 : 0; return n; };
  const toExit = (ox - cx) * ax.x + (oz - cz) * ax.z;
  const sgn = lane(-1) !== lane(1) ? (lane(-1) > lane(1) ? 1 : -1) : toExit >= 0 ? 1 : -1;
  const d = ax.clone().multiplyScalar(sgn), sd = new THREE.Vector3(-d.z, 0, d.x);
  const exitSide = Math.sign((ox - cx) * sd.x + (oz - cz) * sd.z) || 1;
  // the loop's foot raised over a ball on the lane (its top is 1: BALL_R), a ramp's run beyond the mouth
  // (the ramp within the mouth, its near edge to its far one: out of it the lane is the lane, under the loop)
  const E0 = ((w <= h ? w : h) - 0.1) / 2, RUN = 2 * E0, FOOT = 1.35;
  const R = Math.max(1.8, (z.scale || 2) * 1.1), shift = exitSide * 1.6, m0 = new THREE.Vector3(cx, y + BALL_R, cz).addScaledVector(d, -E0);
  const base = (i: number) => m0.clone().addScaledVector(d, RUN).addScaledVector(sd, (shift * i) / 24).setY(y + BALL_R + FOOT);
  const loopPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    loopPts.push(base(i).addScaledVector(d, R * Math.sin(th)).setY(y + BALL_R + FOOT + R * (1 - Math.cos(th))));
  }
  const after = loopPts[24].clone(), exit = new THREE.Vector3(ox, oy + BALL_R, oz), lift = Math.min(2.2, 0.8 + after.distanceTo(exit) * 0.05);
  const run: THREE.Vector3[] = [after.clone().addScaledVector(d, 1.5).setY(after.y + 0.15)];
  for (let i = 1; i <= 3; i++) run.push(after.clone().lerp(exit, i / 4).setY(Math.max(after.y, exit.y) + lift * Math.sin((Math.PI * i) / 4)));
  const ramp = m0.clone().addScaledVector(d, RUN / 2).setY(y + BALL_R + FOOT / 2);
  const curve = new THREE.CatmullRomCurve3([m0, ramp, ...loopPts.slice(0, 24), ...run, exit.clone().addScaledVector(new THREE.Vector3(ox - after.x, 0, oz - after.z).normalize(), -1).setY(exit.y + 0.2), exit], false, "centripetal");
  const L = curve.getLength(), rampU = Math.hypot(RUN, FOOT) / L, loopEnd = rampU + (2 * Math.PI * R) / L, centre = base(0).setY(y + BALL_R + FOOT + R);
  const upAt = (u: number, out: THREE.Vector3) => {
    if (u > rampU && u < loopEnd) {
      const p = curve.getPointAt(u);
      return out.set(centre.x - p.x, centre.y - p.y, centre.z - p.z).addScaledVector(sd, -((centre.x - p.x) * sd.x + (centre.z - p.z) * sd.z)).normalize();
    }
    return out.set(0, 1, 0);
  };
  // the chute from the ramp's top (the points are its way up), letting the ball out short of the exit: nothing of it on the lane there
  g.add(chuteAlong(curve, upAt, 0.72, 1 - 2.6 / L, rampU));
  // the loop's frame: a trestle each side of it, up to its middle, its feet beyond the mouth (none on the lane a ball crosses)
  const tops = [-0.95, shift + Math.sign(shift) * 0.95].map((o) => {
    const top = centre.clone().addScaledVector(sd, o).setY(centre.y - 0.2);
    for (const k of [-0.2, R + 0.3]) {
      const foot = centre.clone().addScaledVector(sd, o + Math.sign(o) * 0.5).addScaledVector(d, k);
      g.add(post(top, foot.setY(Math.min(t.height(foot.x, foot.z), y) - 0.2), 0.12));
    }
    return top;
  });
  // braces from the frame's heads to the trough's outside, a quarter, a half and three quarters round (credibility 20)
  for (const i of [6, 12, 18]) {
    const on = loopPts[i], out = on.clone().add(on.clone().sub(centre).setY(on.y - centre.y).multiplyScalar(0.12));
    const head = tops.reduce((a, b) => (a.distanceTo(on) < b.distanceTo(on) ? a : b));
    g.add(post(head, out, 0.07));
  }
  // posts under the chute's run, down to the ground (or the lava's floor)
  for (let dd = 1; dd < L; dd += 2.2) {
    const p = curve.getPointAt(dd / L), gy = t.height(p.x, p.z);
    if (p.y - gy < 0.9 || dd / L < loopEnd + 0.03 || p.distanceTo(exit) < 3.5) continue; // (the loop stands on its own frame; none on the lane by the exit)
    g.add(post(p.clone().setY(p.y - 0.55), p.clone().setY(Math.min(gy, p.y - 1) - 0.3), 0.12));
  }
  // the points: a timber blade hinged at the mouth, up into a ramp to the loop while it is there, flat on the lane when not
  const holder = facing(new THREE.Group(), Math.atan2(-d.z, -d.x));
  holder.position.set(cx, y, cz);
  const hinge = new THREE.Group(), blade = beam(Math.hypot(RUN, FOOT) + 0.1, 0.1, 1.5, TIMBER_LIGHT), up = Math.atan2(FOOT, RUN);
  blade.position.set((Math.hypot(RUN, FOOT) + 0.1) / 2, 0.03, 0); // (from the hinge on toward the loop: local +x; flat, a ball rolls over it)
  hinge.add(blade);
  hinge.position.x = -E0; // (at the mouth's near edge)
  ud(hinge).live = true;
  holder.add(hinge);
  g.add(holder);
  if (z.every) {
    // its signal on the loop's frame, facing the lane the ball comes from: green into the loop, red straight on
    const signal = facing(new THREE.Group(), Math.atan2(-d.z, -d.x)), lens = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc0392b })); // (a glass with a thickness)
    const hood = solid(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12).rotateZ(Math.PI / 2), IRON_DARK, INK);
    lens.rotation.y = -Math.PI / 2;
    lens.position.x = -0.08;
    signal.add(hood, lens);
    signal.position.copy(tops[0]).addScaledVector(d, -0.25).y += 0.35;
    g.add(signal);
    // (on the clock itself, not eased after it: up through the loop's window, lifting and lying down in its first and last 0.3)
    const clock = clockOf(z), ON = z.on || 0, green = new THREE.Color(0x3fbf5f), red = new THREE.Color(0xc0392b);
    // the blade lifted by a chain from its tip up to the frame's head (credibility 21): one live rod, set each frame
    const chain = tinted(new THREE.CylinderGeometry(0.03, 0.03, 1, 5).translate(0, 0.5, 0), MINES.ink), tip = new THREE.Vector3(), up3 = new THREE.Vector3(0, 1, 0);
    ud(chain).live = true;
    g.add(chain);
    const liftChain = (o: number) => {
      holder.updateMatrixWorld(true);
      tip.set(-E0 + Math.cos(o * up) * (Math.hypot(RUN, FOOT) + 0.05), Math.sin(o * up) * (Math.hypot(RUN, FOOT) + 0.05) + 0.08, 0).applyMatrix4(holder.matrixWorld);
      const dirv = tops[0].clone().sub(tip);
      chain.position.copy(tip);
      chain.scale.set(1, dirv.length(), 1);
      chain.quaternion.setFromUnitVectors(up3, dirv.normalize());
    };
    animate(() => {
      const p = clock.phase(), o = p < ON ? smoothstep(Math.min(p, ON - p) / 0.3) : 0;
      hinge.rotation.z = o * up;
      liftChain(o);
      lens.material.color.copy(red).lerp(green, o);
    });
  } else hinge.rotation.z = up;
  // the ride
  const at = new THREE.Vector3(), tg = new THREE.Vector3();
  rides(z, curve, {
    ms: Math.min(2800, 1000 + L * 45),
    // a ball too slow for it climbs a quarter of the loop at most, and rolls back out (step.gno: put back in front of the mouth)
    climb: rampU + ((Math.PI / 2) * R) / L,
    // (slower up the ramp and the loop, quicker down the chute)
    ease: (k) => (k < 0.55 ? loopEnd * (k / 0.55) ** 1.15 : loopEnd + (1 - loopEnd) * ((k - 0.55) / 0.45)),
    cam: (k, pos, look) => {
      const u = k < 0.55 ? loopEnd * (k / 0.55) ** 1.15 : loopEnd + (1 - loopEnd) * ((k - 0.55) / 0.45);
      curve.getPointAt(Math.min(1, u), at);
      if (u < loopEnd) {
        // beside the loop, looking at the ball going round it
        pos.copy(centre).addScaledVector(sd, -exitSide * (R * 2.6 + 3)).y += 0.8;
        look.copy(at);
        return true;
      }
      curve.getTangentAt(Math.min(1, u), tg);
      pos.copy(at).addScaledVector(tg.setY(0).normalize(), -5.5).y += 2.6;
      look.copy(at).addScaledVector(tg, 3);
      return true;
    },
  });
  return g;
}

// ------------------------------------------------------------ the lift

/**
 * The lift (hole 8): a pulse tunnel, at one landing or another with the
 * stroke (the stroke's pieces: engine.ts builds them anew each stroke and
 * grows them in). Drawn whole at every stroke, the same: a balanced hoist, a
 * gantry over each landing (the cage-door rings), its sheave, a rope from
 * sheave to sheave, a cage in each shaft hung from it, one the counterweight
 * of the other: as a stroke's lift comes in, its cage rises up its shaft to
 * the landing (eased, a little bounce as it settles) while the other goes
 * down. The piece
 * stays full size while the stroke's pieces grow in, and the stroke's before
 * is not drawn once they shrink (this one has taken over, cages where they
 * were). A ball in it goes down with its cage, the camera over the landing,
 * then a cut to where the tunnel lets it out: the station on the level below,
 * or, just off the landing, a hatch in the floor it comes up through.
 */
function liftPiece(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), { cx, cz, w, h } = boxOf(z), y = t.height(cx, cz);
  const long = w >= h, L = Math.max(w, h) - 0.9, D = Math.min(w, h) - 0.7, a = long ? 0 : Math.PI / 2;
  // the landings, top to bottom: the cage doors in rings, each ring's middle (this zone's the one it is in)
  // (each door's span across, the spans that overlap one ring)
  const span = (q: { a: readonly number[]; b: readonly number[] }) => (long ? [Math.min(q.a[1], q.b[1]), Math.max(q.a[1], q.b[1])] : [Math.min(q.a[0], q.b[0]), Math.max(q.a[0], q.b[0])]);
  const rings: number[][] = [];
  for (const [lo, hi] of s.walls.filter((q) => q.skin === "cage door").map(span).sort((p, q) => p[0] - q[0])) {
    const r = rings[rings.length - 1];
    if (r && lo <= r[1] + 0.3) r[1] = Math.max(r[1], hi);
    else rings.push([lo, hi]);
  }
  const mids = rings.map(([lo, hi]) => (lo + hi) / 2), mine = long ? cz : cx;
  const here = mids.length ? mids.reduce((bi, m, i) => (Math.abs(m - mine) < Math.abs(mids[bi] - mine) ? i : bi), 0) : 0;
  const at = (mids.length ? mids : [mine]).map((m, i) => (i === here ? 0 : m - mids[here])); // (offsets from this landing, across)
  const root = new THREE.Group();
  g.add(root);
  // the frame: a gantry over each landing and the rope across between their sheaves (one piece, it never moves)
  const frame = new THREE.Group(), H = 7.2, R = 0.9, CH = 2.6, DOWN = 7; // (DOWN: the shaft's dark floor is under 7.8)
  const siteOf = (o: number) => { const q = new THREE.Group(); q.position.set(long ? cx : cx + o, y, long ? cz + o : cz); q.rotation.y = -a; return q; };
  const cages: THREE.Object3D[] = [], ropeAt: THREE.Vector3[] = [], sheaveAt: THREE.Vector3[] = [];
  // the ropes, from each sheave down to its cage's spreader, paid out and wound in as it goes: one draw for them all
  const ropes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 5).translate(0, -0.5, 0), flat(MINES.ink), 4), rm = new THREE.Matrix4();
  ud(ropes).live = true;
  ropes.frustumCulled = false;
  const oneSheave = () => {
    const sh = new THREE.Group();
    sh.add(tinted(new THREE.TorusGeometry(R, 0.1, 6, 24), IRON_DARK));
    for (let k = 0; k < 6; k++) {
      const q = (k / 6) * Math.PI * 2;
      sh.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(q) * R, Math.sin(q) * R, 0), 0.05, IRON_DARK));
    }
    return bakeLocal(sh);
  };
  at.forEach((o, i) => {
    const site = siteOf(o), gantry = new THREE.Group();
    for (const sx of [-1, 1]) {
      // (its legs outside the cage doors' lines: the doors are the chain's bars, 0.3 clear of them)
      for (const sz of [-1, 1]) gantry.add(strut(new THREE.Vector3(sx * (L / 2 + 1.45), 0, sz * (D / 2 + 0.2)), new THREE.Vector3(sx * (L / 2 + 1.05), H, sz * 0.35), 0.3, 0.3));
      gantry.add(strut(new THREE.Vector3(sx * (L / 2 + 1.35), 2.4, -(D / 2 - 0.3)), new THREE.Vector3(sx * (L / 2 + 1.35), 2.4, D / 2 - 0.3), 0.16, 0.18, TIMBER_DARK));
    }
    const top = beam(L + 3.2, 0.36, 0.5);
    top.position.y = H + 0.1;
    gantry.add(top);
    // a sill at each end, flush with the lane, under the cage door's line: the lane's cut ends short of the landing there
    for (const sx of [-1, 1]) {
      const sill = plate(0.85, 0.06, Math.min(w, h), IRON_DARK);
      sill.position.set(sx * (Math.max(w, h) / 2 + 0.4), -0.02, 0);
      gantry.add(sill);
    }
    // the well: a timber collar flush round the opening's long sides, guide rails down the shaft at its four corners
    // (the cage rides them: it goes through a framed opening, never through a floor), the shaft's timber sets every 2.5
    const LO = Math.max(w, h) / 2, DO = Math.min(w, h) / 2;
    for (const sz of [-1, 1]) {
      const kerb = slat(LO * 2, 0.08, 0.3, TIMBER, wood);
      kerb.position.set(0, -0.03, sz * (DO + 0.15));
      gantry.add(kerb);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const guide = slat(0.12, DOWN + 1.2, 0.12, IRON_DARK);
      guide.position.set(sx * (LO - 0.1), -(DOWN + 1.2) / 2, sz * (DO - 0.1));
      gantry.add(guide);
    }
    for (let dy = 2.5; dy < DOWN; dy += 2.5) for (const sz of [-1, 1]) {
      const set = slat(LO * 2 + 0.2, 0.18, 0.2, TIMBER_DARK, wood);
      set.position.set(0, -dy, sz * (DO + 0.1));
      gantry.add(set);
    }
    site.add(gantry);
    frame.add(site);
    // its sheave and its cage, moving: built once, the others the same pieces (their geometries shared: one each for all)
    // (its sheave one draw: an iron wheel dark as ink, no outline of its own; turning as its cage goes)
    const mount = siteOf(o);
    // (its body only, no outline of its own: two draws saved, the hole at the draw budget)
    const cage = i ? cages[0].clone() : withoutHull(bakeLocal(liftCage(L, D, CH, Math.max(w, h) - 0.06, Math.min(w, h) - 0.06)));
    ud(cage).live = true;
    mount.add(cage);
    root.add(mount);
    cages[i] = cage;
    ropeAt[i] = mount.position.clone().setY(mount.position.y + H + 0.3 + R);
    sheaveAt[i] = mount.position.clone().setY(mount.position.y + H + 0.3 + R);
  });
  ropes.count = at.length;
  root.add(ropes);
  // the sheaves: one wheel, drawn at each landing, one draw for them all
  const wheel = oneSheave().children[0] as THREE.Mesh, sheaves = new THREE.InstancedMesh(wheel.geometry, wheel.material, at.length), eu = new THREE.Euler();
  ud(sheaves).live = true;
  sheaves.frustumCulled = false;
  root.add(sheaves);
  const topOf = (o: number) => new THREE.Vector3(long ? cx : cx + o, y + H + 0.3 + 2 * R, long ? cz + o : cz);
  for (let i = 0; i + 1 < at.length; i++) frame.add(rod(topOf(at[i]), topOf(at[i + 1]), 0.04, MINES.ink));
  // the dial on this landing's gantry: which landing the lift is at, its needle swinging over as it comes
  const dial = new THREE.Group(), face = solid(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 18).rotateX(Math.PI / 2), 0xe8dcc0);
  dial.add(face, solid(new THREE.TorusGeometry(0.58, 0.07, 5, 18), BRASS));
  const markAt = (i: number) => Math.PI * (0.75 - (i * 0.5) / Math.max(1, at.length - 1));
  for (let i = 0; i < at.length; i++) {
    const mark = tinted(new THREE.BoxGeometry(0.08, 0.18, 0.04), MINES.ink);
    mark.position.set(Math.cos(markAt(i)) * 0.42, Math.sin(markAt(i)) * 0.42, 0.07);
    mark.rotation.z = markAt(i) - Math.PI / 2;
    dial.add(mark);
  }
  const needle = tinted(new THREE.BoxGeometry(0.05, 0.42, 0.03).translate(0, 0.21, 0), 0xc0392b);
  needle.position.z = 0.09;
  needle.rotation.z = markAt(here) - Math.PI / 2;
  dial.add(needle);
  dial.position.set(-(L / 2 + 1.1), H - 1.2, D / 2 + 0.25);
  frame.children[here]?.add(dial);
  bakeLocal(frame);
  root.add(frame);
  // the travel: this landing's cage up from the dark, the others down to it
  // each cage's height kept by the hole (its landing's place across), across every rebuild of the stroke's pieces:
  // it travels from where it is to where this stroke has it (up to its landing, or down the shaft), eased, never
  // put anywhere at once; a new stroke's pieces go on from there
  const heights = liftHeights.get(s.hole) || new Map<number, number>();
  liftHeights.set(s.hole, heights);
  const keyOf = (i: number) => Math.round((mids.length ? mids[i] : mine) * 10); // (the landing's own place, the same at every stroke)
  let last: number | null = null, k0 = 0, gone = false, drop: number | null = null;
  const up = new THREE.Vector3();
  animate((tt) => {
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, tt - last)); // (a clock run back, held or replayed: no step, never a growing one)
    last = tt;
    // (the stroke's pieces grow in, scaled from nothing: this stays full size; shrinking out, it is not drawn)
    const k = Math.max(0.01, g.parent ? g.parent.getWorldScale(up).y : 1);
    if (k < k0 - 1e-4) gone = true;
    k0 = k;
    root.visible = !gone;
    root.scale.y = 1 / k;
    cages.forEach((c, i) => {
      const key = keyOf(i), want = i === here ? 0 : -DOWN;
      let d = heights.get(key) ?? want;
      if (!gone) {
        // (at most DOWN in 2.6 s, slowing in the last unit: accelerate, travel, decelerate)
        const gap = want - d, v = Math.min(DOWN / 1.6, 0.6 + Math.abs(gap) * 2.2) * dt;
        d = Math.abs(gap) <= v ? want : d + Math.sign(gap) * v;
        heights.set(key, d);
      }
      c.position.y = i === here && drop !== null ? drop : d;
      ropes.setMatrixAt(i, rm.makeScale(1, Math.max(0.05, H + 0.3 + R - (c.position.y + CH + 1.2)), 1).setPosition(ropeAt[i]));
      // (its sheave turning as it goes: its axle across toward the other landing)
      sheaves.setMatrixAt(i, rm.makeRotationFromEuler(eu.set(0, Math.PI / 2, c.position.y / R, "YXZ")).setPosition(sheaveAt[i]));
    });
    ropes.instanceMatrix.needsUpdate = sheaves.instanceMatrix.needsUpdate = true;
  });
  // where the tunnel lets the ball out: just off the landing a hatch in the floor, else the station on the level
  // below; every landing's seen so far drawn at every stroke, the same (a stroke's never comes and goes)
  const exits = liftExits.get(s) || new Map<number, readonly number[]>();
  liftExits.set(s, exits.set(at[here], z.vec));
  const exitAt = (o: number, [x, zz]: readonly number[]) => {
    const r = seeded("liftexit" + x.toFixed(2) + zz.toFixed(2)), lx = long ? cx : cx + o, lz = long ? cz + o : cz, b = openTo(s, t, x, zz, s.cup);
    if (Math.max(Math.abs(x - lx) - w / 2, Math.abs(zz - lz) - h / 2) < 4) return exitOf(s, t, x, zz, r, true);
    // (a station whose rock would stand a jamb on the lane: a hatch in the floor instead, as the pithead's)
    const st = mouthAt(s, t, x - headV(b).x * 2, zz - headV(b).z * 2, b, 2.4, 2.6, 2.6, r, { foot: false, y: t.height(x, zz) });
    if (st.on > 0) return exitOf(s, t, x, zz, r, true);
    root.add(st.piece);
    return null;
  };
  let ex: ReturnType<typeof exitOf> | null = null;
  for (const [o, v] of exits) {
    const e = exitAt(o, v);
    if (e) root.add(e.piece);
    if (o === at[here]) ex = e;
    else if (e && e.lid) ud(e.lid).live = false; // (another landing's lid stays shut: merged with the rest)
  }
  // a sump just off a way out: the shaft's flooded foot, framed as the shaft's own (a collar, a head over it)
  // (a stroke's pieces are handed the stroke's zones: the hole's are the terrain's)
  const sumps = new Set<Zone>();
  for (const [x, zz] of exits.values()) for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) { const q = t.zoneAt(x + i, zz + j); if (q && q.kind === "hazard" && q.skin === "sump") sumps.add(q); }
  for (const q of sumps) {
    const qb = boxOf(q), foot = new THREE.Group(), hw = Math.min(qb.hx, qb.hz);
    foot.position.set(qb.cx, t.height(qb.cx, qb.cz), qb.cz);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const c = beam(0.3, 0.3, 0.3, TIMBER_DARK);
      c.position.set(sx * (qb.hx - 0.5), 0.05, sz * (qb.hz - 0.5)); // (on the sump's rim, off the lane)
      foot.add(c);
    }
    for (const sx of [-1, 1]) foot.add(strut(new THREE.Vector3(sx * (qb.hx - 0.5), 0, 0), new THREE.Vector3(sx * (qb.hx - 0.7), 3.2, 0), 0.24, 0.24));
    const head = beam(qb.hx * 2 - 0.2, 0.26, 0.3);
    head.position.y = 3.3;
    foot.add(head);
    const pulley = solid(new THREE.TorusGeometry(Math.min(0.45, hw * 0.3), 0.06, 5, 16), RUST);
    pulley.position.y = 2.85;
    foot.add(pulley, rod(new THREE.Vector3(0, 2.4, 0), new THREE.Vector3(0, -0.6, 0), 0.03, MINES.ink));
    root.add(foot);
  }
  const [ox, oz] = z.vec, oy = t.height(ox, oz), db = headV(openTo(s, t, ox, oz, s.cup));
  const top0 = new THREE.Vector3(cx, y + BALL_R, cz), bottom = top0.clone().setY(y - DOWN + BALL_R), out = new THREE.Vector3(ox, oy + BALL_R, oz);
  const inside = ex ? ex.from.clone().setY(ex.from.y + BALL_R) : new THREE.Vector3(ox - db.x * 2.9, oy + BALL_R, oz - db.z * 2.9);
  const path = new THREE.CurvePath<THREE.Vector3>();
  path.add(new THREE.LineCurve3(top0, bottom));
  path.add(new THREE.LineCurve3(bottom, inside.clone().setY(bottom.y)));
  path.add(new THREE.LineCurve3(inside.clone().setY(bottom.y), inside));
  path.add(new THREE.LineCurve3(inside, out));
  const Ls = path.getCurveLengths(), total = Ls[Ls.length - 1], u1 = Ls[0] / total, u3 = Ls[2] / total;
  const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), to = out.clone().addScaledVector(db, 6).setY(oy + 3.2);
  const down: Ride = {
    ms: 2800,
    // the cage seen setting off, going down the shaft, then the cut to where the ball comes out
    ease: (k) => (k < 0.4 ? u1 * smoothstep(k / 0.4) : k < 0.7 ? u1 + (u3 - u1) * ((k - 0.4) / 0.3) : u3 + (1 - u3) * smoothstep((k - 0.7) / 0.3)),
    at: (k, ball) => {
      drop = k < 0 ? null : k < 0.4 ? ball.position.y - BALL_R - y : -DOWN;
      ball.visible = k < 0 || k < 0.4 || k > 0.8;
    },
    cam: (k, pos, look) => {
      if (k < 0.4) {
        pos.copy(top0).addScaledVector(side, D / 2 + 4.5).y += 4.5;
        look.set(cx, y + (drop ?? 0), cz);
        return true;
      }
      pos.copy(to);
      look.lerpVectors(inside, out, smoothstep((k - 0.62) / 0.3));
      return "cut";
    },
  };
  rides(z, path, ex ? withLid(ex, down, 0.75) : down);
  return g;
}

/** Each hole's lift cages' heights, by the landing's place across (tenths): kept across every rebuild of the stroke's pieces. */
const liftHeights = new Map<string, Map<number, number>>();
/** The lifts' ways out seen so far, by hole: a landing's (its offset across) → its exit. */
const liftExits = new WeakMap<Hole, Map<number, readonly number[]>>();

/** A baked group without its ink outline (a moving piece at the draw budget: its body alone). */
function withoutHull<O extends THREE.Object3D>(o: O): O {
  for (const c of [...o.children]) if (c instanceof THREE.Mesh && md(c.material as THREE.Material).hull) o.remove(c);
  return o;
}

/** A lift's cage (hole 8), L × D, CH high, its floor at 0: a riveted iron platform the landing's size, corner posts, a roof frame, hangers to a spreader. */
function liftCage(L: number, D: number, CH: number, FL = L, FD = D) {
  const cage = new THREE.Group();
  const floor = plate(FL, 0.14, FD, IRON); // (the floor the landing's whole opening: the lane is cut open there, FL × FD)
  floor.position.y = 0.04;
  cage.add(floor);
  // (all of it the kit's plates: one material, one outline, two draws as it moves)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pst = plate(0.16, CH, 0.16, IRON_DARK);
    pst.position.set(sx * (L / 2 - 0.1), CH / 2, sz * (D / 2 - 0.1));
    cage.add(pst);
  }
  for (const [ww, dd, x, zz] of [[L, 0.14, 0, D / 2 - 0.1], [L, 0.14, 0, -D / 2 + 0.1], [0.14, D, L / 2 - 0.1, 0], [0.14, D, -L / 2 + 0.1, 0]] as const) {
    const r0 = plate(ww, 0.16, dd, RUST);
    r0.position.set(x, CH, zz);
    cage.add(r0);
  }
  const spread = plate(L * 0.6, 0.16, 0.2, IRON_DARK);
  spread.position.y = CH + 1.2;
  cage.add(spread);
  for (const sx of [-1, 1]) {
    const hanger = plate(0.06, 1.25, 0.06, IRON_DARK);
    hanger.position.set(sx * L * 0.28, CH + 0.6, 0);
    cage.add(hanger);
  }
  return cage;
}

// ------------------------------------------------------------ dispatch

const ZONES: Record<string, (z: Zone, t: Terrain, s: Hole) => THREE.Object3D> = { geyser, cage: pithead, adit: aditPair, "ore chute": chute, hopper: chute, ladder: manway, "cart ride": cartRide, "cable car": cableCar, corkscrew, lift: liftPiece };

export function piece(kind: "post" | "wall" | "zone", item: Post | Bar | Zone, t: Terrain, s: Hole): THREE.Object3D | null | undefined {
  wood = seeded("wood" + JSON.stringify(item));
  const o = kind === "wall" && item.skin === "cart" ? cartOn(item as Bar, t)
    : kind === "zone" && ZONES[item.skin] && ((item as Zone).kind === "tunnel" || (item as Zone).kind === "loop") ? ZONES[item.skin](item as Zone, t, s)
    : undefined;
  return named(o);
}

/** The timbers' tones (slat): a stream of each piece's own, whatever was built before it. */
let wood: Rand = seeded("wood");

/** The rides' pieces are named so (the ?camlog audit tells them from the world's). */
function named<O extends THREE.Object3D | null | undefined>(o: O): O {
  if (o) o.name = "rides";
  return o;
}

/** The world's own track for a line of timed bars (worlds.ts): the carts'. */
export function track(l: Track, s: Hole, t: Terrain) {
  wood = seeded("wood" + JSON.stringify(l));
  return named(l.skin === "cart" ? cartTrack(l, s, t) : null);
}
