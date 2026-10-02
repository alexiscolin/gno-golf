// The Crystal Mines' timed bars and the hero machines they make
// (mines-pieces.ts asks here for every bar with a clock, and the stroke's
// pulse bars): the stamp battery pounding across the belt and the water
// wheel that drives it, the giant pickaxe swinging on its haft, the drill's
// cutterhead, the steam pump's pistons, the lift's cage doors, the dropping
// stalactites, the Heart's crystal gates, the strongroom's swing door, safe
// door and tripwires, and the rolling boulder.
//
// Each is drawn once for all its bars and moves itself on the timed clock
// (course.ts timedPieces: ud.clock(tick, e)), where the chain has its bars:
// the first bar of a machine carries the whole of it, the others an empty
// piece (their dashed outlines while aiming are still the course's). What
// stands still in a machine is merged in its own frame (bakeLocal), what
// moves in a few merged parts of its own.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flat, relief } from "./materials";
import { seeded } from "./common";
import { ud, md, type Hole } from "./data";
import { bakeLocal, instances } from "./bake";
import { MINES } from "./mines-kit";
import { heartCrystal, overVoid } from "./mines-zones";
import { once, darkMouth, INK_THIN, inked, paint, boulder, gem, TIMBER, TIMBER_DARK, TIMBER_LIGHT, IRON, IRON_DARK, BRASS, RUST, beam, log, rivets, plate, knobbly, strata, facets, solid, tinted, shared } from "./mines-toon";
import { mod, smoothstep, there } from "../terrain";
import type { Terrain } from "../terrain";
import type { Timing, Vec2 } from "../types";
import type { Bar } from "./worlds";

// ------------------------------------------------------------ the rigs
//
// A machine is its bars, gathered as they are built (one hole build, or one
// stroke's extras: the terrain and the zones list say which), drawn at the
// first clock tick, when all of them are known.
interface Rig {
  bars: Bar[];
  group: THREE.Group;
  drive: ((tick: number) => void) | null;
}
const rigs = new WeakMap<Terrain, WeakMap<object, Map<string, Rig>>>();
function rigOf(t: Terrain, s: Hole, key: string) {
  let byZones = rigs.get(t);
  if (!byZones) rigs.set(t, (byZones = new WeakMap()));
  let byKey = byZones.get(s.zones);
  if (!byKey) byZones.set(s.zones, (byKey = new Map<string, Rig>()));
  let r = byKey.get(key);
  const first = !r;
  if (!r) byKey.set(key, (r = { bars: [], group: new THREE.Group(), drive: null }));
  return { rig: r, first };
}

/** A bar's timing (its clock: every, on, phase). */
const clockOf = (b: Bar): Required<Timing> => ({ every: b.timing?.every || 0, on: b.timing?.on || 0, phase: b.timing?.phase || 0 });
/** The first tick of a bar's window in its period. */
const startOf = (b: Bar) => { const c = clockOf(b); return c.every ? mod(-c.phase, c.every) : 0; };
/** Whether a bar is in place at a tick. */
const isOn = (b: Bar, k: number) => { const c = clockOf(b); return there(Math.floor(k), c.every, c.on, c.phase); };
/** How far a bar is in place at a tick (0..1): in over the 0.3 of a tick before its window, out over the 0.3 after. */
const inPlace = (b: Bar, tick: number) => {
  const c = clockOf(b), E = c.every || 1, k = mod(tick + c.phase, E);
  return k < c.on ? 1 : k > E - 0.3 ? smoothstep((k - (E - 0.3)) / 0.3) : k < c.on + 0.3 ? 1 - smoothstep((k - c.on) / 0.3) : 0;
};
/** The same for one piece that stands through any of its bars' windows. */
const anyInPlace = (bars: readonly Bar[], tick: number) => {
  const up = (k: number) => bars.some((b) => isOn(b, k)), k = Math.floor(tick), f = tick - k;
  return up(k) ? 1 : up(k + 1) && f > 0.7 ? smoothstep((f - 0.7) / 0.3) : up(k - 1) && f < 0.3 ? 1 - smoothstep(f / 0.3) : 0;
};

/**
 * Where a machine that moves through its bars' places stands at any tick:
 * each tick of the period has the place of the bar placed there last (the
 * one whose window began most recently; a tick with none keeps the last),
 * and the machine moves through them on a smooth periodic curve (Catmull-Rom,
 * each place reached in the middle of its tick): no stop at every tick, a
 * dwell where the chain holds it (a pendulum slowing at the ends of its swing).
 * value(b) is a bar's place; away, where it stands through a tick with no
 * bar (by default the last place: a door with an open place of its own gives it).
 */
function keyframes(bars: readonly Bar[], value: (b: Bar) => number, away?: number) {
  const every = Math.max(...bars.map((b) => clockOf(b).every)) || 1;
  const at: number[] = [];
  for (let k = 0; k < every; k++) {
    let best: Bar | null = null, age = Infinity;
    for (const b of bars) if (isOn(b, k)) { const a = mod(k - startOf(b), every); if (a < age) (age = a), (best = b); }
    at.push(best ? value(best) : away ?? NaN);
  }
  // (a tick with no bar: the place before it)
  const first = at.findIndex((v) => !Number.isNaN(v));
  if (first < 0) return () => 0;
  for (let k = 1; k <= every; k++) if (Number.isNaN(at[(first + k) % every])) at[(first + k) % every] = at[(first + k - 1) % every];
  return (tick: number) => {
    const k = mod(tick - 0.5, every), i = Math.floor(k), u = k - i;
    const p0 = at[mod(i - 1, every)], p1 = at[i], p2 = at[(i + 1) % every], p3 = at[(i + 2) % every];
    return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  };
}

/** A machine piece: the first bar builds and drives the rig, every other bar an empty clocked piece. */
function machine(bar: Bar, t: Terrain, s: Hole, key: string, build: (bars: readonly Bar[], g: THREE.Group) => (tick: number, now: number) => void) {
  const { rig, first } = rigOf(t, s, key);
  rig.bars.push(bar);
  const piece = first ? rig.group : new THREE.Group();
  ud(piece).live = true;
  if (!first) {
    ud(piece).clock = () => {};
    return piece;
  }
  let drive: ((tick: number, now: number) => void) | null = null;
  ud(piece).clock = (tick) => {
    // (built at its first tick, when all its bars are known; what stands still in it merged)
    if (!drive) (building = s.zones), (drive = build(rig.bars, rig.group)), bakeLocal(rig.group);
    drive(tick, performance.now() / 1000);
  };
  return piece;
}

/**
 * Pieces that only slide (the pistons' heads), and what stands still with
 * them (their cylinders): all of them one mesh a material (a solid and its
 * outline: two draws, two geometries, however many pieces), a sliding piece's
 * vertices moved to where it stands (move, then done).
 */
function sliders(parts: readonly THREE.Group[], g: THREE.Group) {
  const byKey = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; at: number[] }>();
  parts.forEach((p, i) => {
    bakeLocal(p);
    p.updateMatrix();
    p.traverse((c) => {
      if (!(c instanceof THREE.Mesh)) return;
      const m = c.material as THREE.Material, k = String(md(m).hook) + m.type;
      if (!byKey.has(k)) byKey.set(k, { mat: m, geos: [], at: [] });
      const e = byKey.get(k)!, geo = (c.geometry as THREE.BufferGeometry).index ? (c.geometry as THREE.BufferGeometry).toNonIndexed() : (c.geometry as THREE.BufferGeometry);
      e.geos.push(geo.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(p.matrix, c.matrix)));
      e.at.push(i);
    });
  });
  const sets = [...byKey.values()].map(({ mat, geos, at }) => {
    // (the attributes every piece has: a door's stripe carries no uv where its lattice does)
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((q) => q.attributes[n]));
    for (const q of geos) for (const n of Object.keys(q.attributes)) if (!names.includes(n)) q.deleteAttribute(n);
    const geo = mergeGeometries(geos), pos = geo.attributes.position as THREE.BufferAttribute, base = (pos.array as Float32Array).slice();
    let n = 0;
    const ranges = geos.map((q, j) => { const r = { part: at[j], from: n, to: n + q.attributes.position.count }; n = r.to; return r; });
    pos.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    ud(mesh).live = true;
    g.add(mesh);
    return { pos, base, ranges };
  });
  return {
    move(i: number, at: THREE.Vector3) {
      for (const { pos, base, ranges } of sets)
        for (const r of ranges) {
          if (r.part !== i) continue;
          const a = pos.array as Float32Array;
          for (let v = r.from * 3; v < r.to * 3; v += 3) (a[v] = base[v] + at.x), (a[v + 1] = base[v + 1] + at.y), (a[v + 2] = base[v + 2] + at.z);
        }
    },
    done() { for (const { pos } of sets) pos.needsUpdate = true; },
  };
}

/** A bar's frame: its centre, length, thickness, the unit along it and across it. */
function frame(b: Bar) {
  const ux = Math.cos(b.ang), uz = Math.sin(b.ang);
  return { cx: b.c[0], cz: b.c[1], L: b.length, T: b.thick, ux, uz, nx: -uz, nz: ux };
}

// dust and sparks at a strike (a stamp's shoe, the drill's arm, a stalactite
// landing, a piston's steam): one system for the hole's machines (shared), n
// slots for each machine that asks; strike(i, at, now) starts slot i, step(now)
// runs them all once a frame whoever calls it. The first machine to ask adds
// its group.
const SLOTS = 24;
// (the build a machine is drawn for: the hole's, or a stroke's extras — each its own system, gone with it)
let building: object = {};
function strikes(_t: Terrain, g: THREE.Group, n: number, spark = true) {
  const { sys, first } = shared(building, "strikes", strikeSystem);
  if (first) g.add(sys.root);
  const base = sys.used;
  sys.used = Math.min(SLOTS, sys.used + n);
  return {
    strike: (i: number, at: THREE.Vector3, now: number) => base + i < SLOTS && sys.fire(base + i, at, now, spark),
    step: (now: number) => sys.step(now),
  };
}
function strikeSystem() {
  const root = new THREE.Group();
  ud(root).live = true;
  const dustM = new THREE.MeshToonMaterial({ color: 0xa89cb8, transparent: true, depthWrite: false, opacity: 0.7 });
  const dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), dustM, SLOTS * 5);
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06), once("spark", () => new THREE.MeshBasicMaterial({ color: 0xffe08a })), SLOTS * 8);
  dust.frustumCulled = sparks.frustumCulled = false;
  root.add(dust, sparks);
  const hits = Array.from({ length: SLOTS }, () => ({ at: new THREE.Vector3(), t: -99, spark: true, dirs: Array.from({ length: 8 }, () => new THREE.Vector3(Math.random() - 0.5, 0.5 + Math.random(), Math.random() - 0.5)) }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  let last = -1;
  return {
    root,
    used: 0,
    fire(i: number, at: THREE.Vector3, now: number, spark: boolean) { hits[i].at.copy(at); hits[i].t = now; hits[i].spark = spark; },
    step(now: number) {
      if (now === last) return; // (once a frame, whoever asks)
      last = now;
      // (only the slots in use are drawn)
      dust.count = this.used * 5;
      sparks.count = this.used * 8;
      let alpha = 0, lit = false;
      hits.forEach((h, i) => {
        const k = (now - h.t) / 0.9;
        for (let j = 0; j < 5; j++) {
          if (k < 0 || k > 1) { dust.setMatrixAt(i * 5 + j, hide); continue; }
          const a = (j / 5) * Math.PI * 2 + i, r = 0.5 + k * 1.2;
          dust.setMatrixAt(i * 5 + j, M.compose(P.set(h.at.x + Math.cos(a) * r, h.at.y + 0.15 + k * 0.5, h.at.z + Math.sin(a) * r), Q, S.setScalar(0.25 + k * 0.35)));
          alpha = Math.max(alpha, 1 - k);
        }
        for (let j = 0; j < 8; j++) {
          const q = (now - h.t) / 0.45;
          if (!h.spark || q < 0 || q > 1) { sparks.setMatrixAt(i * 8 + j, hide); continue; }
          const d = h.dirs[j];
          lit = true;
          sparks.setMatrixAt(i * 8 + j, M.compose(P.set(h.at.x + d.x * q * 2, h.at.y + 0.2 + d.y * q * 1.6 - q * q * 1.2, h.at.z + d.z * q * 2), Q, S.setScalar(1 - q)));
        }
      });
      dustM.opacity = 0.7 * alpha;
      // (between strikes nothing is drawn)
      dust.visible = alpha > 0;
      sparks.visible = lit;
      dust.instanceMatrix.needsUpdate = sparks.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------ the stamp battery
//
// Stamps in a row down the belt, each an iron stem through the guides of a
// timber frame, a cam on the turning camshaft lifting it by its tappet and
// letting it drop: it rises slowly through the ticks it is away, falls in
// the last of them, and stands on the belt through its window, dust and
// sparks flying where it strikes. The camshaft is turned by the line shaft
// from the water wheel (the wheel's axle meets it, drawn by the wheel).
const STAMP_H = 1.5; // how high a stamp's shoe is lifted
function stampBattery(bars: readonly Bar[], g: THREE.Group, t: Terrain) {
  const fs = bars.map(frame), ys = fs.map((f) => t.height(f.cx, f.cz));
  // the frame runs along the row of stamps, following the belt's fall: a bent at each stamp
  const order = fs.map((_, i) => i).sort((a, b) => fs[a].cx + fs[a].cz - (fs[b].cx + fs[b].cz));
  const first = fs[order[0]], lastF = fs[order[order.length - 1]];
  const dl = Math.hypot(lastF.cx - first.cx, lastF.cz - first.cz) || 1, ax = (lastF.cx - first.cx) / dl, az = (lastF.cz - first.cz) / dl;
  const bx = -az, bz = ax; // across the row
  const TOP = 5.2, still = new THREE.Group();
  const bent = order.map((i) => new THREE.Vector3(fs[i].cx, ys[i], fs[i].cz));
  // (the row's ends run on a little past its first and last stamps)
  const ext = (p: THREE.Vector3, q: THREE.Vector3, k: number) => p.clone().add(p.clone().sub(q).multiplyScalar(k / Math.max(0.01, p.distanceTo(q))));
  const line = [ext(bent[0], bent[1] || bent[0].clone().setX(bent[0].x + 1), 1.7), ...bent, ext(bent[bent.length - 1], bent[bent.length - 2] || bent[0].clone().setX(bent[0].x - 1), 1.7)];
  // (its posts stand off the lane, where it ends either side of the row: nothing on the lane but the stamps)
  const edge = (p: THREE.Vector3, sg: number) => { let d = 0.6; while (d < 8 && t.onGreen(p.x + bx * sg * d, p.z + bz * sg * d)) d += 0.2; return d + 0.3; };
  const sides = [-1, 1].map((sg) => Math.max(...line.map((p) => edge(p, sg)))).map((d, i) => (i ? d : -d));
  for (const p of line)
    for (const sd of sides) {
      const post = beam(0.34, TOP + 0.6, 0.34, TIMBER_DARK);
      post.position.set(p.x + bx * sd, p.y + TOP / 2 - 0.05, p.z + bz * sd);
      still.add(post);
    }
  for (let k = 0; k + 1 < line.length; k++)
    for (const sd of sides) {
      const a = line[k].clone().add(new THREE.Vector3(bx * sd, TOP - 0.3, bz * sd)), b = line[k + 1].clone().add(new THREE.Vector3(bx * sd, TOP - 0.3, bz * sd));
      still.add(strut(a, b, 0.36, 0.4, TIMBER));
    }
  // a pair of tie beams across over each stamp, either side of its stem, carrying its guide between them
  // (nothing of the frame in the stem's way: it slides in its guide's ring)
  const along = (p: THREE.Vector3, u: number, v: number, y: number) => p.clone().add(new THREE.Vector3(ax * u + bx * v, y, az * u + bz * v));
  // the camshaft: beside the stems (its cams' lobes pass them), just under the ties, its cams under the tappets
  const CAM = 0.62, SH = TOP - 0.68;
  for (const p of bent)
    for (const u of [-0.34, 0.34]) {
      still.add(strut(along(p, u, sides[0], TOP - 0.3), along(p, u, sides[1], TOP - 0.3), 0.34, 0.36, TIMBER));
      // the camshaft's bearing under the tie: an iron ring round the shaft, bolted up into it
      const ring = solid(new THREE.TorusGeometry(0.24, 0.07, 6, 12).rotateY(Math.PI / 2).rotateY(-Math.atan2(az, ax)), IRON_DARK);
      ring.position.copy(along(p, u, CAM, SH));
      still.add(ring);
    }
  // the guides the stems slide in: an iron ring round each stem between its ties, strapped to them
  bent.forEach((p) => {
    const guide = solid(new THREE.TorusGeometry(0.22, 0.07, 6, 14).rotateX(Math.PI / 2), IRON_DARK);
    guide.position.copy(along(p, 0, 0, TOP - 0.36)); // (under the tappet at its lowest)
    still.add(guide);
    const strap = plate(0.4, 0.08, 0.12, IRON_DARK);
    for (const v of [-0.26, 0.26]) {
      const sp = strap.clone();
      sp.position.copy(along(p, 0, v, TOP - 0.36));
      sp.rotation.y = -Math.atan2(az, ax);
      still.add(sp);
    }
  });
  bakeLocal(still);
  // the camshaft along the row beside the stems, a cam for each stamp set round it by its phase
  const s0 = along(line[0], 0, CAM, SH), s1 = along(line[line.length - 1], 0, CAM, SH), slen = s0.distanceTo(s1);
  const shaft = new THREE.Group(), turning = new THREE.Group();
  turning.add(solid(new THREE.CylinderGeometry(0.16, 0.16, slen + 1.2, 10).rotateZ(Math.PI / 2), IRON)); // (out past the frame's ends)
  order.forEach((i) => {
    const u = along(bent[order.indexOf(i)], 0, CAM, SH).distanceTo(s0) - slen / 2;
    // (a disc across the shaft, its lobe off its axis: it turns about the shaft, lifting the tappet over it)
    const cam = solid(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 10, 1).scale(1, 1, 0.55).translate(0, 0, 0.22).rotateZ(Math.PI / 2), IRON_DARK);
    cam.position.set(u, 0, 0);
    cam.rotation.x = (startOf(bars[i]) / (clockOf(bars[i]).every || 1)) * Math.PI * 2;
    turning.add(cam);
  });
  bakeLocal(turning);
  shaft.add(turning);
  shaft.position.copy(s0.clone().add(s1).multiplyScalar(0.5));
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), s1.clone().sub(s0).normalize());
  ud(shaft).live = ud(turning).live = true;
  g.add(still, shaft);
  // (a pulley on the end the wheel's belt comes to)
  const dirS = s1.clone().sub(s0).normalize();
  belted(t, g, [s0.clone().addScaledVector(dirS, -0.5), s1.clone().addScaledVector(dirS, 0.5)], (k) => {
    const pul = pulley();
    pul.position.x = (k ? 1 : -1) * (slen / 2 + 0.5);
    turning.add(pul);
  });
  // the stamps: stem, tappet, boss and the shoe on the bar's footprint
  // (one stamp, drawn as many: instanced)
  const f0 = fs[0], stamps = [0].map(() => {
    const st = new THREE.Group();
    const shoe = plate(f0.L * 0.96, 0.7, f0.T * 0.96, 0x6a6f7e);
    shoe.position.y = 0.35;
    const boss = solid(new THREE.CylinderGeometry(0.42, 0.5, 0.8, 12), IRON_DARK);
    boss.position.y = 1.05;
    const stem = solid(new THREE.CylinderGeometry(0.13, 0.13, TOP + 0.4, 8), 0x8b90a0);
    stem.position.y = 1.4 + (TOP + 0.4) / 2;
    const tappet = solid(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 12), BRASS);
    tappet.position.y = TOP - 0.08; // (resting on its cam's lobe, over its guide)
    st.add(shoe, boss, stem, tappet);
    st.add(rivets([0, 1, 2, 3].map((q) => new THREE.Vector3(Math.cos(q * 1.57) * 0.42, 1.05, Math.sin(q * 1.57) * 0.42)), 0.05));
    return st;
  });
  const copies = instances(stamps[0], fs.length);
  g.add(copies.group);
  const turn = fs.map((_, i) => new THREE.Euler(0, -bars[i].ang, 0)), at = new THREE.Vector3();
  const fx = strikes(t, g, bars.length);
  const wasOn = bars.map(() => false);
  return (tick: number, now: number) => {
    bars.forEach((b, i) => {
      const c = clockOf(b), k = mod(tick + c.phase, c.every || 1), away = (c.every || 1) - c.on;
      let h = 0;
      if (k >= c.on) {
        // kicked up by its cam as its window ends, clear of the ball at once (over the ball's top within 0.3 of a
        // tick, as the chain has the bar gone), lifted on to the top slowly, and dropped in the last 0.3 of a tick
        // before its window: down on the belt only while the bar stands
        const a = k - c.on, r = (c.every || 1) - k;
        h = Math.min(smoothstep(a / 0.3), r > 0.3 ? 1 : 1 - ((0.3 - r) / 0.3) ** 2) * (1.2 + (STAMP_H - 1.2) * smoothstep(a / Math.max(1, away * 0.6)));
      }
      copies.set(i, at.set(fs[i].cx, ys[i] + Math.max(0, h), fs[i].cz), turn[i]);
      const on = k < c.on;
      if (on && !wasOn[i]) fx.strike(i, new THREE.Vector3(fs[i].cx, ys[i] + 0.1, fs[i].cz), now);
      wasOn[i] = on;
    });
    copies.done();
    turning.rotation.x = -(tick / (clockOf(bars[0]).every || 1)) * Math.PI * 2;
    fx.step(now);
  };
}
/** A square timber from point p to point q, w thick. */
const strutOf = (p: THREE.Vector3, q: THREE.Vector3, w: number, color: number) => strut(p, q, w, w, color);
/** A timber from point p to point q: w wide, h deep, its colour. */
function strut(p: THREE.Vector3, q: THREE.Vector3, w: number, h: number, color: number) {
  const b = beam(p.distanceTo(q) + w * 0.4, h, w, color);
  b.position.copy(p).add(q).multiplyScalar(0.5);
  b.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), q.clone().sub(p).normalize());
  return b;
}

// ------------------------------------------------------------ the water wheel
//
// The great wheel over the plank: an overshot wheel on its axle between two
// timber trestles, its buckets clearing the plank, its long paddles sweeping
// it — one of them down across the plank through each bar's window, the wheel
// turning on the clock to put it there. Water pours onto it from the flume
// and sheets off the buckets into the race.
function waterWheel(bars: readonly Bar[], g: THREE.Group, t: Terrain) {
  const fs = bars.map(frame);
  // the paddles' footprints lie along the plank; the axle crosses it
  const xs = fs.map((f) => f.cx), zs = fs.map((f) => f.cz);
  const along = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs); // the plank's way
  const ps = fs.map((f) => (along ? f.cx : f.cz)), mid = (Math.min(...ps) + Math.max(...ps)) / 2;
  const cx = along ? mid : fs[0].cx, cz = along ? fs[0].cz : mid, y0 = t.height(fs[0].cx, fs[0].cz);
  const width = Math.max(...fs.map((f) => f.L)); // across the plank: a paddle's length
  // its turn from the bars: the paddle's run along the plank a tick (in bar
  // order) is the rim's speed; a paddle comes by once a period, so the wheel
  // has a whole number of them and the radius that makes it so
  const order = bars.slice().sort((p, q) => startOf(p) - startOf(q)), every = clockOf(bars[0]).every || 1;
  const ps0 = order.map((b) => (along ? b.c[0] : b.c[1])), run = order.length > 1 ? (ps0[ps0.length - 1] - ps0[0]) / Math.max(1, startOf(order[order.length - 1]) - startOf(order[0])) : 1;
  const paddles = Math.max(2, Math.round((Math.PI * 2 * 6.4) / (Math.abs(run) * every)));
  const R = (paddles * Math.abs(run) * every) / (Math.PI * 2), AX = y0 + R - 0.05;
  // the tick a paddle is straight down: where the bars' run crosses the axle
  const k0 = startOf(order[0]) + (clockOf(order[0]).on || 1) / 2 + ((along ? cx : cz) - ps0[0]) / run;
  const wheel = new THREE.Group(), buckets = 12;
  // the wheel: two rims, their spokes, the axle hub, buckets between the rims
  // (the rims and buckets well in from the paddles' tips: nothing of them sweeping low over the plank, only the
  // paddles, where and when their bars stand)
  const RIM = R - 1.8;
  for (const side of [-1, 1]) {
    const rim = solid(new THREE.TorusGeometry(RIM, 0.14, 6, 40), TIMBER);
    rim.position.z = (side * width) / 2;
    wheel.add(rim);
    for (let k = 0; k < 8; k++) {
      const sp = beam(RIM - 0.05, 0.16, 0.14, TIMBER_DARK);
      sp.position.set(Math.cos((k / 8) * Math.PI * 2) * (RIM - 0.05) / 2, Math.sin((k / 8) * Math.PI * 2) * (RIM - 0.05) / 2, (side * width) / 2);
      sp.rotation.z = (k / 8) * Math.PI * 2;
      wheel.add(sp);
    }
  }
  for (let k = 0; k < buckets; k++) {
    const a = (k / buckets) * Math.PI * 2, b = beam(0.9, 0.12, width, TIMBER_LIGHT);
    b.position.set(Math.cos(a) * RIM, Math.sin(a) * RIM, 0);
    b.rotation.z = a + 0.5;
    wheel.add(b);
  }
  // the long paddles that sweep the plank: one for each pass (the period over the sweep's turn)
  const hub = solid(new THREE.CylinderGeometry(0.55, 0.55, width + 0.6, 12).rotateX(Math.PI / 2), IRON_DARK);
  wheel.add(hub);
  for (let k = 0; k < paddles; k++) {
    const p = new THREE.Group();
    const blade = plate(0.25, 1.35, width * 0.96, 0x7a5a3a);
    blade.position.set(0, -(R - 0.68), 0);
    const arm = beam(0.22, R - 1.3, 0.22, TIMBER_DARK);
    arm.position.set(0, -(R - 1.3) / 2, 0);
    p.add(blade, arm);
    p.rotation.z = (k / paddles) * Math.PI * 2;
    wheel.add(p);
  }
  // its axle through the bearings on the trestles and on out, a pulley at each end (the belt to the stamps' camshaft)
  wheel.add(solid(new THREE.CylinderGeometry(0.18, 0.18, width + 3.1, 10).rotateX(Math.PI / 2), IRON));
  bakeLocal(wheel);
  const axle = new THREE.Group();
  axle.add(wheel);
  axle.position.set(cx, AX, cz);
  axle.rotation.y = along ? 0 : Math.PI / 2;
  ud(axle).live = ud(wheel).live = true;
  g.add(axle);
  // the trestles either side, the flume over the top, the water pouring
  const still = new THREE.Group();
  for (const side of [-1, 1]) {
    const off = side * (width / 2 + 0.9);
    for (const lean of [-1, 1]) {
      const leg = beam(0.36, AX - y0 + 1.2, 0.36, TIMBER_DARK);
      leg.position.set(lean * 1.2, (AX - y0) / 2 - 0.4, off);
      leg.rotation.z = lean * 0.3;
      still.add(leg);
    }
    const bearing = plate(0.8, 0.6, 0.6, IRON_DARK);
    bearing.position.set(0, AX - y0, off);
    still.add(bearing);
  }
  // the flume over its top (its trough's underside clear of the wheel's), on a cross beam carried by two posts
  // outside the wheel's width: nothing of it in the wheel's way
  const flume = new THREE.Group(), FY = AX - y0 + R + 0.35, FX = -R * 0.4, FW = width / 2 + 0.9;
  const trough = beam(3.2, 0.5, width * 0.8, TIMBER);
  trough.position.set(FX, FY, 0);
  const water = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.06, width * 0.7), flat(0x6fc6e0, { emissive: 0x2f7fa0, emissiveIntensity: 0.4 }));
  water.position.set(FX, FY + 0.22, 0);
  const cross = beam(0.3, 0.3, 2 * FW + 0.3, TIMBER_DARK);
  cross.position.set(FX - 1.3, FY - 0.4, 0);
  flume.add(trough, water, cross);
  for (const sd of [-1, 1]) {
    const post = beam(0.3, FY - 0.25, 0.3, TIMBER_DARK);
    post.position.set(FX - 1.3, (FY - 0.25) / 2 - 0.3, sd * FW);
    flume.add(post);
  }
  still.add(flume);
  bakeLocal(still);
  still.position.set(cx, y0, cz);
  still.rotation.y = along ? 0 : Math.PI / 2;
  g.add(still);
  // water sheeting off onto the wheel: a falling ribbon, streaming
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.6, 3, 1, 6), new THREE.MeshBasicMaterial({ color: 0x8fd8ee, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); // (its own: its opacity waves)
  sheet.position.set(cx - (along ? R * 0.4 - 1.5 : 0), AX + R - 1.2, cz - (along ? 0 : R * 0.4 - 1.5));
  sheet.rotation.y = along ? Math.PI / 2 : 0;
  ud(sheet).live = true;
  g.add(sheet);
  // its turn through the bars' places: at each tick a bar stands, a paddle's blade over that bar (where the chain
  // has it), between them and round to the next pass turning on smoothly (Catmull-Rom through the ticks' middles,
  // the angle unwound: the next paddle comes a paddle's turn on)
  const angOf = (b: Bar) => (along ? 1 : -1) * Math.asin(Math.max(-0.95, Math.min(0.95, (along ? b.c[0] - cx : b.c[1] - cz) / (R - 0.68))));
  const v: number[] = [];
  for (let k = 0; k < every; k++) {
    let best: Bar | null = null, age = Infinity;
    for (const b of bars) if (isOn(b, k)) { const a = mod(k - startOf(b), every); if (a < age) (age = a), (best = b); }
    v.push(best ? angOf(best) : NaN);
  }
  const known = v.map((x, k) => (Number.isNaN(x) ? -1 : k)).filter((k) => k >= 0), step = (Math.PI * 2) / paddles;
  const dir = known.length > 1 && v[known[known.length - 1]] < v[known[0]] ? -1 : 1;
  // (a gap: turned on evenly from the last place to the next, the next pass a paddle's turn on)
  for (let j = 0; j < known.length; j++) {
    const a = known[j], b = j + 1 < known.length ? known[j + 1] : known[0] + every, va = v[a], vb = j + 1 < known.length ? v[b] : v[known[0]] + dir * step;
    for (let k = a + 1; k < b; k++) v[k % every] = va + ((vb - va) * (k - a)) / (b - a) - (k >= every ? dir * step : 0);
  }
  const V = (n: number) => v[mod(n, every)] + Math.floor(n / every) * dir * step;
  const turnAt = (tick: number) => {
    if (!known.length) return (tick - k0) * (run / R) * (along ? 1 : -1);
    // (eased from each tick's place to the next, never past either: a spline through them overshot, a paddle
    // sweeping the plank a tick before its window)
    const tt = tick - 0.5, i = Math.floor(tt), u = tt - i, p1 = V(i), p2 = V(i + 1);
    return p1 + (p2 - p1) * smoothstep(u);
  };
  const ends = [-1, 1].map((sd) => new THREE.Vector3(0, 0, sd * (width / 2 + 1.45)).applyAxisAngle(new THREE.Vector3(0, 1, 0), along ? 0 : Math.PI / 2).add(new THREE.Vector3(cx, AX, cz)));
  belted(t, g, ends, (k) => {
    const pul = pulley();
    pul.rotation.y = Math.PI / 2;
    pul.position.z = (k ? 1 : -1) * (width / 2 + 1.45);
    wheel.add(pul);
  });
  return (tick: number) => {
    wheel.rotation.z = turnAt(tick);
    (sheet.material).opacity = 0.45 + 0.1 * Math.sin(tick * 3);
  };
}

// ------------------------------------------------------------ the belt from the wheel to the stamps
//
// The water wheel drives the stamps' camshaft: a pulley on the end of each
// shaft nearest the other, a leather belt between them (a quarter-turn belt
// where the shafts cross), taut, its two runs from the pulleys' tops and
// bottoms. Whichever of the two is built second draws it (one a hole).
const PULLEY = 0.8;
/** A belt pulley, its axis along x: an iron rim on its spokes round a hub (one mesh and its ink). */
function pulley() {
  const parts = [paint(new THREE.CylinderGeometry(PULLEY, PULLEY, 0.34, 20, 1, true).rotateZ(Math.PI / 2).toNonIndexed(), (_x, _y, _z, c) => c.set(IRON_DARK))];
  for (let k = 0; k < 4; k++) parts.push(paint(new THREE.BoxGeometry(0.08, PULLEY * 2, 0.1).rotateX((k / 4) * Math.PI).toNonIndexed(), (_x, _y, _z, c) => c.set(IRON)));
  parts.push(paint(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 10).rotateZ(Math.PI / 2).toNonIndexed(), (_x, _y, _z, c) => c.set(IRON)));
  for (const q of parts) q.deleteAttribute("uv");
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  return inked(geo, relief(), INK_THIN);
}
type Belted = { root: THREE.Group; ends: { p: THREE.Vector3[]; attach: (k: number) => void }[] };
/** A shaft's two ends (world) and how to put a pulley on one of them: the belt drawn once both are known. */
function belted(t: Terrain, g: THREE.Group, p: THREE.Vector3[], attach: (k: number) => void) {
  const { sys } = shared<Belted>(t, "belt", () => ({ root: new THREE.Group(), ends: [] }));
  sys.ends.push({ p, attach });
  if (sys.ends.length !== 2) return;
  const [A, B] = sys.ends;
  let best = [0, 0], d = Infinity;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const e = A.p[i].distanceTo(B.p[j]); if (e < d) (d = e), (best = [i, j]); }
  A.attach(best[0]);
  B.attach(best[1]);
  const a = A.p[best[0]], b = B.p[best[1]];
  // (both runs one mesh, no ink: a band this thin needs none)
  const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
  const runs = [PULLEY + 0.02, -PULLEY - 0.02].map((dy) => new THREE.BoxGeometry(len, 0.035, 0.3).applyQuaternion(q).translate(mid.x, mid.y + dy, mid.z));
  g.add(tinted(mergeGeometries(runs), 0x3a2a22));
}

// ------------------------------------------------------------ the giant pickaxe
//
// One pickaxe, as big as a tree, hung by its haft from a beam in the vault,
// swinging as a pendulum across the approach: its head is where the chain
// has a bar at every tick (keyframes), eased as a pendulum eases, a clank
// and sparks off its point where it turns.
function pickaxe(bars: readonly Bar[], g: THREE.Group, t: Terrain) {
  const fs = bars.map(frame);
  // the swing's line: from the first head to the farthest
  let a = fs[0], b = fs[0], far = 0;
  for (const p of fs) for (const q of fs) { const d = Math.hypot(p.cx - q.cx, p.cz - q.cz); if (d > far) (far = d), (a = p), (b = q); }
  const dx = (b.cx - a.cx) / (far || 1), dz = (b.cz - a.cz) / (far || 1), mx = (a.cx + b.cx) / 2, mz = (a.cz + b.cz) / 2;
  const PIVOT = 11, y0 = t.height(mx, mz);
  const along = keyframes(bars, (q) => (q.c[0] - mx) * dx + (q.c[1] - mz) * dz);
  // the pivot: an axle across the swing on two timber A-frames standing off
  // the lane either side (their feet where the lane ends), braced, bolted
  const nx = -dz, nz = dx, still = new THREE.Group();
  const edge = (sg: number) => {
    let d = 1;
    while (d < 12 && t.onGreen(mx + nx * sg * d, mz + nz * sg * d)) d += 0.25;
    return d + 0.9;
  };
  const e0 = edge(-1), e1 = edge(1), axleC = (e1 - e0) / 2;
  for (const [sg, d] of [[-1, e0], [1, e1]] as const) {
    const top = new THREE.Vector3(0, PIVOT + 0.3, sg * d);
    for (const lean of [-1, 1]) still.add(strutOf(new THREE.Vector3(lean * 2.4, -0.4, sg * (d + 0.6)), top, 0.42, TIMBER_DARK));
    still.add(strutOf(new THREE.Vector3(-1.5, 3.2, sg * (d + 0.4)), new THREE.Vector3(1.5, 3.2, sg * (d + 0.4)), 0.28, TIMBER));
    const cap = plate(1, 0.9, 1, IRON);
    cap.position.copy(top);
    still.add(cap);
  }
  const axle = solid(new THREE.CylinderGeometry(0.3, 0.3, e0 + e1 + 0.8, 12).rotateX(Math.PI / 2).translate(0, PIVOT + 0.3, axleC), IRON_DARK);
  still.add(axle);
  bakeLocal(still);
  still.position.set(mx, y0, mz);
  still.rotation.y = -Math.atan2(dz, dx);
  g.add(still);
  // the pickaxe: hung on the axle by an iron eye round it, the haft from the eye down, its head (the bar) across the
  // swing, the head's foot at the floor at the bottom of its swing (nothing of it through the lane)
  const L = PIVOT + 0.3 - 0.28; // (the head's blades at the ball's height at the bottom of its swing, their foot at the floor)
  const pick = new THREE.Group();
  pick.add(solid(new THREE.TorusGeometry(0.42, 0.13, 8, 16).rotateY(Math.PI / 2), IRON_DARK));
  const haft = log(0.28, L - 1.3, TIMBER);
  haft.position.y = -L + 0.8;
  pick.add(haft);
  for (const h of [0.6, 0.35 * L, 0.7 * L]) {
    const band = solid(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 12), IRON_DARK);
    band.position.y = -h;
    pick.add(band);
  }
  const head = new THREE.Group();
  const f0 = fs[0], span = f0.L;
  // a big iron head: two heavy blades as long and as thick as its bar at the ball's height (what the ball strikes),
  // a point and a chisel at their ends, its eye banded round the haft over them
  // (its blades along its swing, as its bars lie: each bar is the head's place at a tick, long along the swing)
  const T = Math.min(f0.T * 0.95, 1.2), blades: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) blades.push(new THREE.BoxGeometry(T, 0.46, span / 2 - 0.2).translate(0, 0, (side * (span / 2 - 0.2)) / 2).toNonIndexed());
  blades.push(new THREE.ConeGeometry(Math.min(0.3, T / 2), 0.4, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).translate(0, 0, span / 2 - 0.02).toNonIndexed(), new THREE.BoxGeometry(T * 1.05, 0.52, 0.2).translate(0, 0, -span / 2 + 0.1).toNonIndexed());
  for (const q of blades) q.deleteAttribute("uv");
  const bg = mergeGeometries(blades);
  bg.computeVertexNormals();
  head.add(solid(bg, 0x8a90a2));
  const eye = plate(Math.min(0.8, f0.T), 0.9, 0.9, 0x70778a);
  eye.position.y = 0.68;
  head.add(eye);
  head.add(rivets([new THREE.Vector3(0, 0.5, 0.36), new THREE.Vector3(0, 0.86, 0.36), new THREE.Vector3(0, 0.5, -0.36), new THREE.Vector3(0, 0.86, -0.36)].map((v) => v.clone().setX(Math.min(0.8, f0.T) / 2 + 0.02)), 0.06));
  bakeLocal(pick);
  bakeLocal(head);
  const swing = new THREE.Group();
  swing.add(pick, head);
  ud(head).live = true;
  swing.position.set(mx, y0 + PIVOT + 0.3, mz); // (on the axle's line)
  swing.rotation.y = -Math.atan2(dz, dx) - Math.PI / 2; // swinging along the line (its local z)
  ud(swing).live = ud(pick).live = true;
  g.add(swing);
  const fx = strikes(t, g, 1);
  let prev = 0, dir = 0;
  return (tick: number, now: number) => {
    // (its head down at the ball's height only while a bar stands, level, over it; lifted over the ball as it
    // travels between them (rising in the 0.3 of a tick before a window, lifting in the 0.3 after); the haft from
    // the axle to its eye, run out through the eye as the head swings out)
    const e = anyInPlace(bars, tick);
    // (its foot 0.04 over the floor where the head is, not the swing's middle: the floor rises and falls under it)
    const s = along(tick), gy = t.height(mx + dx * s, mz + dz * s) - y0, Lh = L - gy - 0.02 - (1 - e) * 1.4, th = Math.atan(s / Lh);
    head.position.set(0, -Lh, -s);
    pick.rotation.x = th;
    pick.scale.y = Math.hypot(Lh, s) / L;
    // where it turns at an end: a spark off its point
    const d = Math.sign(s - prev);
    if (d && dir && d !== dir && Math.abs(s) > far * 0.35) fx.strike(0, new THREE.Vector3(mx + dx * s, y0 + 0.3, mz + dz * s), now);
    if (d) dir = d;
    prev = s;
    fx.step(now);
  };
}

// ------------------------------------------------------------ the drill head
//
// The tunnel-boring machine's cutterhead, standing across the bored drift
// and rocking on its hub: an open wheel of spokes and cutter discs high over
// the lane (the ball passes under it), and one long toothed cutter arm that
// reaches the floor. The arm is where the chain's spokes are: it sweeps down
// the north half of the drift while the north spokes stand, then the south
// (keyframes on the spokes' own windows), the other half open. Its portal
// stands on legs off the lane, its gearbox and rams in the rock at the side.
function drillHead(bars: readonly Bar[], g: THREE.Group, t: Terrain, hub?: Bar) {
  const fs = bars.map(frame);
  const xs = fs.map((f) => f.cx), zs = fs.map((f) => f.cz);
  const across = Math.max(...zs) - Math.min(...zs) >= Math.max(...xs) - Math.min(...xs); // the spokes in a row across the drift: along z
  const mx = hub ? hub.c[0] : (Math.min(...xs) + Math.max(...xs)) / 2, mz = hub ? hub.c[1] : (Math.min(...zs) + Math.max(...zs)) / 2, y0 = t.height(mx, mz);
  // (where its shoe is at each tick: over all the spokes standing then, as long as they are together — two in a row
  // standing at once, one shoe over both)
  const spanOf = (b: Bar) => { const v = b.walls.flatMap((w) => [w.a, w.b]).map((p) => (across ? p[1] - mz : p[0] - mx)); return [Math.min(...v), Math.max(...v)] as const; };
  const every = Math.max(...bars.map((b) => clockOf(b).every)) || 1, cen: number[] = [], ext: number[] = [];
  for (let k = 0; k < every; k++) {
    const on = bars.filter((b) => isOn(b, k)).map(spanOf);
    cen.push(on.length ? (Math.min(...on.map((q) => q[0])) + Math.max(...on.map((q) => q[1]))) / 2 : NaN);
    ext.push(on.length ? Math.max(...on.map((q) => q[1])) - Math.min(...on.map((q) => q[0])) : NaN);
  }
  const f0i = cen.findIndex((v) => !Number.isNaN(v));
  for (let k = 1; k <= every && f0i >= 0; k++) { const i = (f0i + k) % every, j = (f0i + k - 1) % every; if (Number.isNaN(cen[i])) (cen[i] = cen[j]), (ext[i] = ext[j]); }
  const cr = (arr: number[], tick: number) => { const k = mod(tick - 0.5, every), i = Math.floor(k), u = k - i, p0 = arr[mod(i - 1, every)], p1 = arr[i], p2 = arr[(i + 1) % every], p3 = arr[(i + 2) % every]; return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u); };
  const off = (tick: number) => (f0i < 0 ? 0 : cr(cen, tick)), len = (tick: number) => (f0i < 0 ? 1 : Math.max(0.9, ext[mod(Math.floor(tick), every)]));
  const reach = Math.max(...fs.map((f) => Math.abs(across ? f.cz - mz : f.cx - mx))) + 0.5;
  const H = Math.max(3.4, reach * 1.6), L = H - 0.05; // the hub's height; the arm's length (its tip at the floor, straight down)
  const Rw = H - 1.6; // the wheel's rim: its lowest point well over the ball
  // the portal: two legs off the lane either side, a heavy beam across over the wheel (clear over its rim as it rocks)
  const still = new THREE.Group(), side = (sg: number) => { let d = 0.5; while (d < 10 && t.onGreen(mx + (across ? 0 : sg * d), mz + (across ? sg * d : 0))) d += 0.25; return d + 0.6; };
  const e0 = side(-1), e1 = side(1), TOP = H + Rw + 0.8;
  for (const [sg, d] of [[-1, e0], [1, e1]] as const) {
    const leg = plate(0.8, TOP, 1.1, 0xd9a33a);
    leg.position.set(0, TOP / 2, sg * d);
    still.add(leg);
    const foot = plate(1.3, 0.3, 1.5, 0x4a4f5c);
    foot.position.set(0, 0.15, sg * d);
    still.add(foot);
  }
  const top = plate(1, 0.9, e0 + e1 + 1.2, 0xd9a33a);
  top.position.set(0, TOP, (e1 - e0) / 2);
  still.add(top);
  // the gearbox beside the wheel, hung from the beam, driving it by its axle (out of the plane the wheel turns in:
  // nothing of the wheel sweeps through it)
  const GX = 1.4, box = plate(0.9, 1.2, 1.2, 0x5a6070);
  box.position.set(GX, H, 0);
  still.add(box);
  still.add(rivets(Array.from({ length: 8 }, (_, k) => new THREE.Vector3(GX + 0.46, H - 0.4 + (k % 2) * 0.8, (Math.floor(k / 2) - 1.5) * 0.3)), 0.06));
  const hanger = plate(0.3, TOP - H - 0.6, 0.4, 0xd9a33a), bracket = plate(GX + 0.5, 0.3, 0.4, 0xd9a33a);
  hanger.position.set(GX, (TOP + H + 0.6) / 2, 0);
  bracket.position.set((GX + 0.5) / 2 - 0.25, TOP - 0.3, 0);
  still.add(hanger, bracket);
  // (from the hub's face out: the spokes meet in the hub, where the axle would stand in their way)
  const axle = solid(new THREE.CylinderGeometry(0.16, 0.16, GX - 0.5, 8).rotateZ(Math.PI / 2).translate((GX + 0.5) / 2, H, 0), 0xc9ccd6);
  still.add(axle);
  bakeLocal(still);
  still.position.set(mx, y0, mz);
  still.rotation.y = across ? 0 : Math.PI / 2;
  g.add(still);
  // the head: an open wheel (rim, spokes, cutter discs) and the long cutter arm, rocking together
  const head = new THREE.Group();
  head.add(solid(new THREE.TorusGeometry(Rw, 0.2, 8, 36).rotateY(Math.PI / 2), 0xd9a33a));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, sp = plate(0.3, Rw, 0.34, 0x6a6f7e);
    sp.position.set(0, Math.cos(a) * Rw * 0.5, Math.sin(a) * Rw * 0.5);
    sp.rotation.x = a;
    head.add(sp);
    const disc = solid(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12).rotateZ(Math.PI / 2).translate(0.25, Math.cos(a) * Rw * 0.72, Math.sin(a) * Rw * 0.72), 0xb8bcc8);
    head.add(disc);
  }
  head.add(solid(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 16).rotateZ(Math.PI / 2), 0xd9a33a));
  // the cutter arm: a steel blade widening to its toothed foot, straight down from the hub
  const arm = plate(0.5, L - 0.6, 0.55, 0x8a90a2);
  arm.position.set(0, -(L - 0.6) / 2, 0);
  head.add(arm);
  bakeLocal(head);
  // its shoe and teeth apart from the rest: stretched along the swing over as many spokes as stand at once
  const shoeG = new THREE.Group(), shoe = plate(0.7, 0.75, 1, 0x9aa0ae);
  shoe.position.set(0, 0.43, 0);
  shoeG.add(shoe);
  const teeth: THREE.BufferGeometry[] = [];
  for (let k = -2; k <= 2; k++) teeth.push(new THREE.ConeGeometry(0.12, 0.28, 4).rotateX(Math.PI).translate(0, 0, k * 0.2));
  shoeG.add(solid(mergeGeometries(teeth), 0xd8dce6));
  bakeLocal(shoeG);
  shoeG.position.y = -L + 0.02;
  ud(shoeG).live = true;
  head.add(shoeG);
  const pivot = new THREE.Group();
  pivot.add(head);
  pivot.position.set(mx, y0 + H, mz);
  pivot.rotation.y = across ? 0 : Math.PI / 2;
  ud(pivot).live = ud(head).live = true;
  g.add(pivot);
  // the hub's foot (the bar that always stands): a split bearing block the arm swings through
  // (either side of the arm's shoe, clear of it)
  for (const sd of [-0.52, 0.52]) {
    const half = plate(0.25, 0.95, 1, 0x6a6f7e);
    half.position.set(mx + (across ? sd : 0), y0 + 0.47, mz + (across ? 0 : sd));
    g.add(half);
  }
  // its race in the floor under the boots, the way the arm sweeps: an iron-lined trench, flush (the lane is open over its boots)
  const race = beam(0.95, 0.3, reach * 2 + 0.5, IRON_DARK);
  race.position.set(mx, y0 - 0.13, mz);
  race.rotation.y = across ? 0 : Math.PI / 2;
  g.add(race);
  const fx = strikes(t, g, 1);
  let prev = 0;
  return (tick: number, now: number) => {
    const o = off(tick);
    // the arm's foot over the spokes' place: the head turned so, its shoe as long as they are
    head.rotation.x = -Math.asin(Math.max(-0.95, Math.min(0.95, o / L)));
    shoeG.scale.z = len(tick);
    if (Math.abs(o) > reach * 0.6 && Math.abs(prev) <= reach * 0.6) fx.strike(0, new THREE.Vector3(mx + (across ? 0 : o), y0, mz + (across ? o : 0)), now);
    prev = o;
    fx.step(now);
  };
}

// ------------------------------------------------------------ the steam pump engine
//
// Each piston: a riveted steam cylinder off the lane, its rod driving the
// head (the bar) across the lane through its window and drawing it back, a
// puff of steam out of the cylinder's cock each stroke; each cylinder fed by
// its steam pipe up out of the dark under its gantry (a steam ram: the steam
// drives it, no crank).
function pistons(bars: readonly Bar[], g: THREE.Group, t: Terrain) {
  const fs = bars.map(frame);
  const units = fs.map((f, i) => {
    // which way it draws back: off the lane, along its long way or across it
    const cand: [number, number, number][] = [];
    for (const [ax, az, d] of [[f.ux, f.uz, f.L], [f.nx, f.nz, f.T]] as const)
      for (const sg of [1, -1]) {
        let off = 0;
        for (const u of [0.6, 1, 1.4]) if (!t.onGreen(f.cx + ax * sg * d * u, f.cz + az * sg * d * u)) off++;
        cand.push([ax * sg, az * sg, off * 10 + d]); // most off the lane, then the longer way
      }
    cand.sort((p, q) => q[2] - p[2]);
    const [bx, bz] = cand[0], depth = Math.abs(bx * f.ux + bz * f.uz) > 0.5 ? f.L : f.T;
    const y0 = t.height(f.cx, f.cz), H = 1.15;
    // the head: an iron ram's face, riveted, a buffer of timber on its front
    const head = new THREE.Group();
    const block = plate(f.L * 0.96, H, f.T * 0.96, 0x6e7484);
    block.position.y = H / 2;
    block.rotation.y = -bars[i].ang;
    head.add(block);
    const pad = beam(Math.abs(bx) > 0.5 ? 0.18 : f.L * 0.9, H * 0.7, Math.abs(bx) > 0.5 ? f.T * 0.9 : 0.18, TIMBER_LIGHT);
    pad.position.set(-bx * (depth / 2 + 0.05), H / 2, -bz * (depth / 2 + 0.05));
    head.add(pad);
    // (its rod on into the barrel even at full thrust, and the barrel long enough to take it all drawn back)
    const RL = depth + 1.6 + 0.2 + 0.4;
    const rod = solid(new THREE.CylinderGeometry(0.16, 0.16, RL, 10).rotateZ(Math.PI / 2).rotateY(-Math.atan2(bz, bx)).translate(bx * RL / 2, H / 2, bz * RL / 2), 0xc9ccd6);
    head.add(rod);
    // the cylinder, off the lane behind it, on its bed, with its gauge and pipe
    const cyl = new THREE.Group(), CL = Math.max(2.2, depth + 0.4 + 0.8);
    const barrel = solid(new THREE.CylinderGeometry(0.8, 0.8, CL, 16).rotateZ(Math.PI / 2), 0x5b6070);
    cyl.add(barrel);
    for (const e of [-CL / 2, CL / 2]) {
      const flange = solid(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 16).rotateZ(Math.PI / 2).translate(e, 0, 0), IRON_DARK);
      cyl.add(flange);
      cyl.add(rivets(Array.from({ length: 8 }, (_, q) => new THREE.Vector3(e + (e > 0 ? 0.09 : -0.09), Math.cos(q * 0.785) * 0.86, Math.sin(q * 0.785) * 0.86)), 0.045));
    }
    const gauge = solid(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14).rotateX(Math.PI / 2).translate(0, 0.95, 0.3), BRASS);
    const pipe = solid(new THREE.TorusGeometry(0.6, 0.09, 6, 12, Math.PI).translate(0, 0.6, 0), RUST);
    // its feed: a steam pipe out of the barrel's side and down past the bed into the dark
    cyl.add(solid(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 6).rotateX(Math.PI / 2).translate(-0.6, 0.3, 0.88), RUST), solid(new THREE.CylinderGeometry(0.09, 0.09, 9, 6).translate(-0.6, 0.3 - 4.5, 1.05), RUST));
    const bed = beam(CL + 0.6, 0.5, 1.8, 0x4f4866);
    bed.position.y = -0.85;
    cyl.add(gauge, pipe, bed);
    // its gantry: timber legs down into the dark under the bed, braced crosswise, iron-strapped, a walkway plank
    const drop = 9, legs: THREE.BufferGeometry[] = [];
    for (const lx of [-CL / 2, CL / 2]) for (const lz of [-0.75, 0.75]) legs.push(new THREE.BoxGeometry(0.32, drop, 0.32).translate(lx, -1.1 - drop / 2, lz));
    for (const lz of [-0.75, 0.75]) for (let k = 0; k < 3; k++) for (const sg of [1, -1]) legs.push(new THREE.BoxGeometry(Math.hypot(CL, 2.4), 0.18, 0.18).rotateZ(sg * Math.atan2(2.4, CL)).translate(0, -2.4 - k * 2.6, lz));
    const legG = mergeGeometries(legs);
    paint(legG, (_x, y, _z, c) => c.set(TIMBER_DARK).multiplyScalar(Math.max(0.25, 1 + y / 9)));
    cyl.add(inked(legG, relief(), INK_THIN));
    for (const lz of [-0.75, 0.75]) {
      const strap = plate(CL + 0.4, 0.14, 0.36, IRON_DARK);
      strap.position.set(0, -1.3, lz);
      cyl.add(strap);
    }
    const back = depth + 1.6 + CL / 2 + 0.2;
    cyl.position.set(f.cx + bx * back, y0 + H / 2 + 0.1, f.cz + bz * back);
    cyl.rotation.y = -Math.atan2(bz, bx);
    return { head, cyl, bx, bz, depth, f, y0, cock: new THREE.Vector3(f.cx + bx * (back + CL / 2), y0 + 1.3, f.cz + bz * (back + CL / 2)) };
  });
  // the heads and the cylinders: one mesh a material for all of them, each head slid to its place
  const heads = sliders([...units.map((u) => u.head), ...units.map((u) => u.cyl)], g), at = new THREE.Vector3();
  // steam out of each cylinder's cock as it strokes
  const puffs = strikes(t, g, bars.length, false);
  const was = bars.map(() => false);
  return (tick: number, now: number) => {
    units.forEach((u, i) => {
      const b = bars[i], c = clockOf(b), k = mod(tick + c.phase, c.every || 1);
      // out through its window (a quick thrust in the tick before), back after it
      const e = k < c.on ? 1 : k > (c.every || 1) - 0.4 ? smoothstep((k - ((c.every || 1) - 0.4)) / 0.4) : k < c.on + 0.6 ? 1 - smoothstep((k - c.on) / 0.6) : 0;
      const pull = (1 - e) * (u.depth + 0.4);
      heads.move(i, at.set(u.f.cx + u.bx * pull, u.y0, u.f.cz + u.bz * pull));
      const on = k < c.on;
      if (on !== was[i]) puffs.strike(i, u.cock, now);
      was[i] = on;
    });
    heads.done();
    puffs.step(now);
  };
}

// ------------------------------------------------------------ gates and doors

/** The lift's cage doors: a lattice of flat iron dropping from a lintel between two posts through its window, rising after it; one lattice drawn as many (instanced, stretched to each door). */
function cageDoors(bars: readonly Bar[], g: THREE.Group, t: Terrain) {
  const H = 1.7, UP = 2.45, stills: THREE.Group[] = []; // (drawn up, the door's foot 2.45 over the floor and its head over 4)
  for (const bar of bars) {
    const f = frame(bar), y0 = t.height(f.cx, f.cz), still = new THREE.Group();
    // (the lintel over the door drawn up: all of it clear over the ball, 4 up)
    for (const sd of [-1, 1]) {
      const post = plate(0.22, UP + H + 0.4, 0.22, IRON_DARK);
      post.position.set((sd * (f.L + 0.2)) / 2, (UP + H + 0.4) / 2, 0);
      still.add(post);
    }
    const lintel = plate(f.L + 0.5, 0.3, 0.4, IRON);
    lintel.position.y = UP + H + 0.3;
    const pulley = solid(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12).rotateX(Math.PI / 2).translate(0, UP + H + 0.6, 0), BRASS);
    // (and a second over the post its counterweight hangs by, the chain along the lintel between them)
    const xw = (f.L + 0.2) / 2 + 0.26, pulley2 = solid(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12).rotateX(Math.PI / 2).translate(xw - 0.22, UP + H + 0.6, 0), BRASS);
    const run = plate(xw - 0.22, 0.05, 0.05, IRON_DARK);
    run.position.set((xw - 0.22) / 2, UP + H + 0.82, 0);
    still.add(lintel, pulley, pulley2, run);
    still.position.set(f.cx, y0, f.cz);
    still.rotation.y = -bar.ang;
    stills.push(still);
  }
  // the lattice, a unit long: verticals, a cross over each pair of bays, rails top and bottom, a warning stripe
  const ls: THREE.BufferGeometry[] = [], n = 8;
  // (flat iron with its thickness: a door stretched to its bar keeps a bar's width in view, not a paper strip)
  for (let k = 0; k <= n; k++) ls.push(new THREE.BoxGeometry(0.018, H, 0.07).translate(-0.5 + k / n, H / 2, 0));
  for (let k = 0; k + 1 < n; k += 2) for (const sg of [1, -1]) ls.push(new THREE.BoxGeometry(0.016, Math.hypot(2 / n, H), 0.05).rotateZ(sg * Math.atan2(2 / n, H)).translate(-0.5 + (k + 1) / n, H / 2, 0.035));
  for (const hy of [0.08, H - 0.08]) ls.push(new THREE.BoxGeometry(1, 0.12, 0.08).translate(0, hy, 0));
  const lattice = mergeGeometries(ls), stripe = new THREE.BoxGeometry(1, 0.12, 0.1).translate(0, 0.14, 0);
  // each door stretched to its bar, all of them and their frames one mesh a material (sliders), a door slid up and down in it
  const doors = bars.map((b) => {
    const f = frame(b), d = new THREE.Group();
    d.add(solid(lattice.clone(), 0x7d8394), tinted(stripe.clone(), 0xf1d24a));
    d.position.set(f.cx, t.height(f.cx, f.cz), f.cz);
    d.rotation.y = -b.ang;
    d.scale.set(f.L, 1, 1);
    return d;
  });
  // what raises each door: a chain from the pulley over it down to its top rail, over the lintel to the post's pulley
  // and down to a counterweight outside the post, going down as the door goes up (all of them: two instanced draws)
  const base = bars.map((b) => { const f = frame(b); return { m: new THREE.Matrix4().compose(new THREE.Vector3(f.cx, t.height(f.cx, f.cz), f.cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b.ang), new THREE.Vector3(1, 1, 1)), xw: (f.L + 0.2) / 2 + 0.26 }; });
  // (the chains and the weights one instanced box: one draw, one geometry)
  const chains = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), flat(IRON_DARK), bars.length * 3);
  chains.frustumCulled = false;
  ud(chains).live = true;
  g.add(chains);
  const CS = new THREE.Vector3(0.045, 1, 0.045), WS = new THREE.Vector3(0.26, 0.5, 0.26);
  const CM = new THREE.Matrix4(), CL = new THREE.Matrix4(), TOP = UP + H + 0.6, NOQ = new THREE.Quaternion();
  const cage = new THREE.Group(), parts = sliders([...doors, ...stills], cage), at = new THREE.Vector3();
  g.add(cage);
  return (tick: number) => {
    bars.forEach((b, i) => {
      const e = inPlace(b, tick);
      const lift = (1 - e) * UP, B = base[i], wy = TOP - 1.4 - lift; // (the weight down as the door goes up)
      parts.move(i, at.set(0, lift, 0));
      chains.setMatrixAt(i * 3, CM.multiplyMatrices(B.m, CL.compose(at.set(-0.22, H + lift, 0), NOQ, CS.setY(TOP - H - lift))));
      chains.setMatrixAt(i * 3 + 1, CM.multiplyMatrices(B.m, CL.compose(at.set(B.xw, wy + 0.5, 0), NOQ, CS.setY(TOP - wy - 0.5))));
      chains.setMatrixAt(i * 3 + 2, CM.multiplyMatrices(B.m, CL.compose(at.set(B.xw, wy, 0), NOQ, WS)));
    });
    parts.done();
    chains.instanceMatrix.needsUpdate = true;
  };
}

/** The Heart's crystal gates: slabs of crystal rising out of their slots through their windows, sinking after; over them, where the Heart's floor is, the Heart itself floating. */
function crystalGates(bars: readonly Bar[], g: THREE.Group, t: Terrain, s: Hole) {
  const rand = seeded("cg" + bars[0].c.join()), fs = bars.map(frame);
  // one gate, a unit long, drawn as many (instanced): each stretched to its bar
  const tpl = new THREE.Group(), n = 3;
  for (let k = 0; k < n; k++) {
    const u = -0.5 + (k + 0.5) / n, h = 1.3 + rand() * 0.8;
    const slab = gem(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1.5)], 6).scale(0.55 / n, h, 0.5), k === 1 ? MINES.amethyst : MINES.cyan);
    slab.position.set(u, -0.1, 0);
    slab.rotation.z = (rand() - 0.5) * 0.15;
    tpl.add(slab);
  }
  const copies = instances(tpl, fs.length);
  g.add(copies.group);
  const turn = bars.map((b) => new THREE.Euler(0, -b.ang, 0)), at = new THREE.Vector3(), sc = new THREE.Vector3();
  fs.forEach((f, i) => {
    const slot = plate(f.L + 0.3, 0.06, f.T + 0.3, 0x2a2440);
    slot.position.set(f.cx, t.height(f.cx, f.cz) + 0.06, f.cz); // (its top over the ice it is set in, up to 0.077)
    slot.rotation.y = -bars[i].ang;
    g.add(slot);
  });
  // the Heart over the crystal floor nearest the gates (the chamber they close)
  const cx = fs.reduce((a, f) => a + f.cx, 0) / fs.length, cz = fs.reduce((a, f) => a + f.cz, 0) / fs.length;
  const floor = s.zones.filter((q) => q.skin === "ice" || q.skin === "heart").sort((p, q) => Math.hypot((p.min[0] + p.max[0]) / 2 - cx, (p.min[1] + p.max[1]) / 2 - cz) - Math.hypot((q.min[0] + q.max[0]) / 2 - cx, (q.min[1] + q.max[1]) / 2 - cz))[0];
  if (floor && !s.zones.some((q) => q.skin === "heart")) {
    // on its rim across from the gates (its middle is the lane, and the cup)
    const hx = (floor.min[0] + floor.max[0]) / 2, hz = (floor.min[1] + floor.max[1]) / 2, rx = (floor.max[0] - floor.min[0]) / 2, rz = (floor.max[1] - floor.min[1]) / 2;
    // (on out past the rim till all of it is off the lane and off the void: the ball never runs into it)
    const dx = hx - cx, dz = hz - cz, l = Math.hypot(dx, dz) || 1, clear = (x: number, zz: number) => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]].every(([a, b]) => !t.onGreen(x + a, zz + b) && !overVoid(s, x + a, zz + b));
    let k = 1.02;
    while (k < 3 && !clear(hx + (dx / l) * rx * k, hz + (dz / l) * rz * k)) k += 0.05;
    const px = hx + (dx / l) * rx * k, pz = hz + (dz / l) * rz * k;
    if (k < 3) g.add(heartCrystal(px, pz, t.height(px, pz), 1.6));
  }
  return (tick: number) => {
    bars.forEach((b, i) => {
      const e = inPlace(b, tick);
      const f = fs[i];
      // (whole, rising up out of its slot and sinking back down into it: not squashed; gone when right down)
      copies.set(i, at.set(f.cx, t.height(f.cx, f.cz) - (1 - e) * 3.3, f.cz), turn[i], e > 0.01 ? sc.set(f.L, 1, f.T + 0.2) : sc.set(0, 0, 0));
    });
    copies.done();
  };
}

/** The tripwires: brass wires between their stanchions, raised taut through their windows and trembling, lying slack in their grooves after; one wire drawn as many (instanced). */
function tripwires(bars: readonly Bar[], g: THREE.Group, t: Terrain) {
  for (const bar of bars) {
    const f = frame(bar), still = new THREE.Group();
    for (const sd of [-1, 1]) {
      const post = solid(new THREE.CylinderGeometry(0.1, 0.13, 1.1, 10).translate(0, 0.55, 0), BRASS);
      post.position.x = (sd * (f.L + 0.15)) / 2;
      const knob = solid(new THREE.SphereGeometry(0.16, 10, 8), 0xe8c060);
      knob.position.set((sd * (f.L + 0.15)) / 2, 1.15, 0);
      still.add(post, knob);
    }
    const groove = plate(f.L, 0.04, 0.2, 0x3a3450);
    groove.position.y = 0.02;
    still.add(groove);
    // what hauls the wire up: a ratchet drum on the one post, its pawl and crank; each post slotted for the wire's
    // riders (a dark slot up its side, the lane's way)
    const px = (f.L + 0.15) / 2, drum = solid(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 12).rotateX(Math.PI / 2).translate(px, 0.7, -0.2), IRON_DARK);
    const crank = solid(new THREE.BoxGeometry(0.04, 0.26, 0.04).translate(px, 0.82, -0.3), IRON);
    still.add(drum, crank);
    for (const sd of [-1, 1]) still.add(tinted(new THREE.BoxGeometry(0.04, 0.6, 0.02).translate((sd * (f.L + 0.15)) / 2 - sd * 0.1, 0.35, 0), 0x241c30));
    still.position.set(f.cx, t.height(f.cx, f.cz), f.cz);
    still.rotation.y = -bar.ang;
    g.add(still);
  }
  const wire = new THREE.Group();
  wire.add(inked(new THREE.CylinderGeometry(0.04, 0.04, 1, 6).rotateZ(Math.PI / 2), flat(0xf2c85a, { emissive: 0x8a5a10, emissiveIntensity: 0.6 }), INK_THIN));
  const wires = instances(wire, bars.length), fs = bars.map(frame), at = new THREE.Vector3(), e3 = new THREE.Euler();
  g.add(wires.group);
  // its bells, hung from it while it is taut, lying in the groove with it when it is slack (none into the floor), and
  // its riders sliding up the posts' slots with it (unstretched: their own instances)
  const bell = new THREE.Group();
  bell.add(solid(new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(Math.PI), BRASS));
  const bells = instances(bell, bars.length * 3);
  const rider = new THREE.Group();
  rider.add(solid(new THREE.TorusGeometry(0.14, 0.04, 6, 12).rotateX(Math.PI / 2), BRASS));
  const riders = instances(rider, bars.length * 2);
  g.add(bells.group, riders.group);
  const one = new THREE.Vector3(1, 1, 1), flat0 = new THREE.Euler();
  return (tick: number) => {
    bars.forEach((b, i) => {
      const e = inPlace(b, tick);
      e3.set(e > 0.9 ? 0.05 * Math.sin(tick * 40) : 0, -b.ang, 0, "YXZ");
      const f = fs[i], y = t.height(f.cx, f.cz) + 0.05 + e * 0.4;
      wires.set(i, at.set(f.cx, y, f.cz), e3, new THREE.Vector3(f.L, 1, 1));
      [-0.25, 0, 0.25].forEach((u, q) => bells.set(i * 3 + q, at.set(f.cx + f.ux * u * f.L, y - 0.02 - 0.08 * e, f.cz + f.uz * u * f.L), flat0, one));
      [-1, 1].forEach((sd, q) => riders.set(i * 2 + q, at.set(f.cx + (f.ux * sd * (f.L + 0.15)) / 2, y, f.cz + (f.uz * sd * (f.L + 0.15)) / 2), flat0, one));
    });
    wires.done();
    bells.done();
    riders.done();
  };
}

/** The stalactites: hanging in the vault, trembling a few ticks before their windows, dropping to stand in the floor through them, crumbling after; grown back by their next turn. One spike drawn as many (instanced), a stump in the vault over each. */
function stalactites(bars: readonly Bar[], g: THREE.Group, t: Terrain) {
  // (its thick end closed: a fallen one seen from above is rock, not a hollow)
  const rand = seeded("st" + bars[0].c.join()), H = 3.8, VAULT = 9.5, fs = bars.map(frame), R = Math.max(fs[0].L, fs[0].T) * 0.66, pts: THREE.Vector2[] = [new THREE.Vector2(0.01, 0.12)];
  for (let k = 0; k <= 8; k++) {
    const v = k / 8;
    pts.push(new THREE.Vector2(k === 8 ? 0.01 : Math.max(0.04, R * (1 - v) ** 0.9 * (1 + 0.08 * Math.sin(v * 17))), -v * H));
  }
  // (its profile from the tip up: a lathe turned from bottom to top faces out; the other way round it was drawn inside out)
  const geo = knobbly(new THREE.LatheGeometry(pts.reverse(), 7), rand, 0.06, 2.6, true);
  paint(geo, (x, y, z, c) => strata(-y, x, z, H, c).lerp(new THREE.Color(0xc9bfd8), Math.max(0, -y / H - 0.5)));
  const spike = facets(geo, relief());
  const spikes = instances(spike, bars.length);
  g.add(spikes.group);
  for (const f of fs) {
    // the rock it hangs from, going up out of sight into the vault (nothing floats)
    const stump = boulder(rand, R * 1.3, 5, R * 1.3, 1);
    stump.position.set(f.cx, t.height(f.cx, f.cz) + VAULT + 4.7, f.cz);
    g.add(stump);
  }
  const fx = strikes(t, g, bars.length);
  const was = bars.map(() => false), at = new THREE.Vector3(), e3 = new THREE.Euler(), sc = new THREE.Vector3();
  return (tick: number, now: number) => {
    bars.forEach((b, i) => {
      const c = clockOf(b), every = c.every || 1, k = mod(tick + c.phase, every), f = fs[i], y0 = t.height(f.cx, f.cz);
      const until = k >= c.on ? every - k : 0; // ticks before it falls
      // (a stroke's own, no clock: fallen for the whole stroke, as the chain has it standing)
      const down = !c.every || k < c.on;
      let y = VAULT;
      sc.set(1, 1, 1);
      e3.set(0, 0, 0);
      if (down) {
        // fallen: driven point-first deep into the floor, its thick end standing
        // where the chain has it (as wide as its bar at the ball's height)
        const fall = c.every ? Math.min(1, k / 0.25) : 1;
        y = VAULT * (1 - fall * fall) + H * 0.24 * fall * fall;
      } else if (k < c.on + 0.4) {
        // crumbling: sinking in pieces into the floor (gone within the 0.4 of a tick the chain gives a piece going)
        const u = (k - c.on) / 0.4;
        y = H * 0.24 - u * H * 0.4;
        sc.set(1 + u * 0.4, 1 - u * 0.6, 1 + u * 0.4);
      } else {
        // hanging again: a new one let down out of the rock it hangs from (not grown by scaling), trembling when it is
        // about to fall
        y = VAULT + H * (1 - smoothstep(Math.min(1, (k - c.on - 0.4) / 2)));
        const shake = until <= 3 ? (1 - until / 3) * 0.06 : 0;
        e3.set(Math.sin(tick * 37 + i) * shake, 0, Math.cos(tick * 41 + i) * shake);
      }
      spikes.set(i, at.set(f.cx, y0 + y, f.cz), e3, sc);
      const on = down;
      if (on && !was[i] && c.every) fx.strike(i, new THREE.Vector3(f.cx, y0, f.cz), now);
      was[i] = on;
    });
    spikes.done();
    fx.step(now);
  };
}

/** The strongroom's swing door: a riveted iron door on its hinge, swung through the bars' places (keyframes). */
function swingDoor(bars: readonly Bar[], g: THREE.Group, t: Terrain, s: Hole) {
  const fs = bars.map(frame);
  // the hinge: the end the doors' axes share (the point nearest all of them)
  const ends = fs.flatMap((f) => [[f.cx + (f.ux * f.L) / 2, f.cz + (f.uz * f.L) / 2], [f.cx - (f.ux * f.L) / 2, f.cz - (f.uz * f.L) / 2]] as Vec2[]);
  let hinge = ends[0], best = Infinity;
  for (const e of ends) { const d = ends.reduce((a, q) => a + Math.min(9, Math.hypot(q[0] - e[0], q[1] - e[1])), 0); if (d < best) (best = d), (hinge = e); }
  const y0 = t.height(hinge[0], hinge[1]), L = fs[0].L, T = fs[0].T;
  const angleOf = (b: Bar) => { const f = frame(b); return Math.atan2(f.cz - hinge[1], f.cx - hinge[0]); };
  // (open, where no bar stands: swung a quarter turn to the side most off the lane, flat against the rock)
  // (off the lane onto ground, not out over the void; folded right back if neither side is clear)
  const a0 = angleOf(bars[0]), offLane = (a: number) => [0.3, 0.6, 0.9].filter((u) => { const x = hinge[0] + Math.cos(a) * L * u, z = hinge[1] + Math.sin(a) * L * u; return !t.onGreen(x, z) && !overVoid(s, x, z); }).length;
  const open = [a0 + Math.PI / 2, a0 - Math.PI / 2, a0 + Math.PI * 0.95, a0 - Math.PI * 0.95].sort((p, q) => offLane(q) - offLane(p))[0];
  // (lane all round its hinge: it does not swing open onto it, it sinks into its slot in the floor while no bar stands)
  const sinks = offLane(open) === 0, angle = keyframes(bars, angleOf, sinks ? undefined : open);
  const door = new THREE.Group();
  // (its leaf from its knuckles out: the knuckles turn round the hinge's pin, nothing of the door through it)
  const leaf = plate(L - 0.16, 1.9, T * 0.9, 0x5f6576);
  leaf.position.set(L / 2 + 0.08, 0.95, 0);
  door.add(leaf);
  const wheel = solid(new THREE.TorusGeometry(0.35, 0.05, 6, 16).translate(L * 0.7, 1, T / 2 + 0.08), BRASS);
  door.add(wheel);
  door.add(rivets(Array.from({ length: 10 }, (_, k) => new THREE.Vector3(0.2 + (k % 5) * (L - 0.4) / 4, k < 5 ? 0.2 : 1.7, T / 2)), 0.05));
  for (const hy of [0.4, 1.5]) {
    const knuckle = solid(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 10).translate(0, hy, 0), IRON_DARK);
    door.add(knuckle);
  }
  bakeLocal(door);
  ud(door).live = true;
  door.position.set(hinge[0], y0, hinge[1]);
  g.add(door);
  // the hinge's pin, the knuckles turning round it (and sliding down it, a door that sinks), a cap on its top
  const post = solid(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8).translate(0, 1.2, 0), IRON_DARK);
  post.add(solid(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10).translate(0, 2.34, 0), IRON_DARK));
  post.position.set(hinge[0], y0, hinge[1]);
  g.add(post);
  // a door that sinks: its slot in the floor under each of its places, dark, a hair over the lane
  if (sinks)
    for (const f of fs) {
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(L, T * 0.9 + 0.06).rotateX(-Math.PI / 2), darkMouth());
      slot.position.set(hinge[0] + Math.cos(Math.atan2(f.cz - hinge[1], f.cx - hinge[0])) * (L / 2 + 0.08), y0 + 0.02, hinge[1] + Math.sin(Math.atan2(f.cz - hinge[1], f.cx - hinge[0])) * (L / 2 + 0.08));
      slot.rotation.y = -Math.atan2(f.cz - hinge[1], f.cx - hinge[0]);
      g.add(slot);
    }
  return (tick: number) => {
    door.rotation.y = -angle(tick);
    if (sinks) {
      // standing through a bar's window (rising in the 0.3 of a tick before it, sinking in the 0.3 after)
      const e = anyInPlace(bars, tick);
      door.position.y = y0 - (1 - e) * 2.05;
    }
  };
}

/** The safe door: a great round slab rolling in its groove across the corridor, through the bars' places (keyframes). */
function safeDoor(bars: readonly Bar[], g: THREE.Group, t: Terrain, s: Hole) {
  const fs = bars.map(frame);
  let a = fs[0], b = fs[0], far = 0;
  for (const p of fs) for (const q of fs) { const d = Math.hypot(p.cx - q.cx, p.cz - q.cz); if (d > far) (far = d), (a = p), (b = q); }
  const dx = (b.cx - a.cx) / (far || 1), dz = (b.cz - a.cz) / (far || 1), mx = (a.cx + b.cx) / 2, mz = (a.cz + b.cz) / 2, y0 = t.height(mx, mz);
  // (its disc exactly as wide along its travel as the bar is, as thick as the bar across: nothing drawn where nothing stands)
  const f0 = fs[0], alongLen = Math.abs(f0.ux * dx + f0.uz * dz) > 0.5 ? f0.L : f0.T, acrossLen = alongLen === f0.L ? f0.T : f0.L;
  // (where no bar stands it has rolled on past the last one, at the end of its groove most off the lane)
  const past = far / 2 + alongLen + 0.2, offLane = (sg: number) => [0.8, 1, 1.2].filter((k) => { const x = mx + dx * sg * past * k, z = mz + dz * sg * past * k; return !t.onGreen(x, z) && !overVoid(s, x, z); }).length;
  // (no clear ground either end: it waits at the last bar's place)
  const aside = offLane(1) >= offLane(-1) ? 1 : -1, clear = Math.max(offLane(1), offLane(-1)) > 0, along = keyframes(bars, (q) => (q.c[0] - mx) * dx + (q.c[1] - mz) * dz, clear ? aside * past : undefined);
  const R = alongLen / 2, W = acrossLen * 0.9;
  const disc = new THREE.Group();
  disc.add(solid(new THREE.CylinderGeometry(R, R, W, 28).rotateX(Math.PI / 2), 0x6e7484));
  disc.add(solid(new THREE.TorusGeometry(R * 0.8, 0.07, 6, 28).translate(0, 0, W / 2 + 0.02), BRASS));
  const dial = solid(new THREE.CylinderGeometry(R * 0.25, R * 0.25, 0.14, 16).rotateX(Math.PI / 2).translate(0, 0, W / 2 + 0.06), 0xd9d2c0);
  disc.add(dial);
  for (let k = 0; k < 4; k++) {
    const spoke = plate(R * 0.9, 0.12, 0.08, BRASS);
    spoke.position.set(0, 0, W / 2 + 0.1);
    spoke.rotation.z = (k / 4) * Math.PI;
    disc.add(spoke);
  }
  disc.add(rivets(Array.from({ length: 16 }, (_, k) => new THREE.Vector3(Math.cos((k / 16) * Math.PI * 2) * R * 0.92, Math.sin((k / 16) * Math.PI * 2) * R * 0.92, W / 2)), 0.05));
  bakeLocal(disc);
  const roll = new THREE.Group();
  roll.add(disc);
  roll.rotation.y = -Math.atan2(dz, dx);
  ud(roll).live = ud(disc).live = true;
  g.add(roll);
  // its groove in the floor, brass-edged
  // (from past the first bar to where it rolls aside)
  // (its ends drawn in only as far as there is ground: never out over the void)
  let g0 = -aside * (far / 2 + R + 0.2), g1 = aside * ((clear ? past : far / 2) + R + 0.2);
  const ground = (u: number) => !overVoid(s, mx + dx * u, mz + dz * u);
  while (Math.abs(g0) > 0.5 && !ground(g0)) g0 -= Math.sign(g0) * 0.25;
  while (Math.abs(g1) > 0.5 && !ground(g1)) g1 -= Math.sign(g1) * 0.25;
  const groove = plate(Math.abs(g1 - g0), 0.05, W + 0.3, 0x2a2440);
  groove.position.set(mx + dx * (g0 + g1) / 2, y0 + 0.02, mz + dz * (g0 + g1) / 2);
  groove.rotation.y = -Math.atan2(dz, dx);
  g.add(groove);
  // the rack down its middle the disc's rim engages (its teeth brass, flush in the groove): what drives it along
  const teeth: THREE.BufferGeometry[] = [];
  for (let u = Math.min(g0, g1) + 0.15; u < Math.max(g0, g1) - 0.1; u += 0.22) teeth.push(new THREE.BoxGeometry(0.1, 0.03, 0.18).rotateY(-Math.atan2(dz, dx)).translate(mx + dx * u, t.height(mx + dx * u, mz + dz * u) + 0.055, mz + dz * u));
  if (teeth.length) g.add(tinted(mergeGeometries(teeth), BRASS));
  return (tick: number) => {
    const s = along(tick);
    // (no clear ground to roll aside to: it sinks into its groove while no bar stands, rising in the 0.3 of a tick
    // before one and sinking in the 0.3 after)
    let down = 0;
    if (!clear) {
      const e = anyInPlace(bars, tick);
      down = (1 - e) * (2 * R + 0.1);
    }
    // (on the floor where it is: its height taken along its path, not the middle's)
    roll.position.set(mx + dx * s, t.height(mx + dx * s, mz + dz * s) + R - 0.05 - down, mz + dz * s);
    roll.visible = down < 2 * R;
    disc.rotation.z = -s / R;
  };
}

/** The boulder rolling along its bars: a great drum of rock as long and as wide as its bars, rolling out of a drift's mouth off the lane, from bar to bar through their windows, and away into the drift at the other end. */
function rollingBoulder(bars: readonly Bar[], g: THREE.Group, t: Terrain, s: Hole) {
  const order = bars.slice().sort((p, q) => startOf(p) - startOf(q));
  // (a drum, not a ball: a round rock would cover a third of a long bar; this one covers it, its axis along the bar)
  const f0 = frame(order[0]), rand = seeded("boulder" + bars[0].c.join()), R = f0.T / 2, LB = f0.L * 0.97;
  const drum = knobbly(new THREE.CylinderGeometry(R, R, LB, 14, 4).rotateX(Math.PI / 2), rand, 0.08, 1.6);
  const seed = rand() * 9;
  paint(drum, (x, y, z, c) => strata(y + 1, x, z, 2.4, c, seed));
  const rock = facets(drum, relief()), spin = new THREE.Group(), roll = new THREE.Group();
  spin.add(rock);
  roll.add(spin);
  bakeLocal(spin);
  ud(roll).live = ud(spin).live = true;
  g.add(roll);
  const ang = keyframes(bars, (b) => b.ang);
  const fx = strikes(t, g, 1, false);
  // where it is: at each bar's place through that bar's window, rolling on between them (keyframes: as the chain has it)
  const kx = keyframes(bars, (b) => b.c[0]), kz = keyframes(bars, (b) => b.c[1]);
  const last = { x: kx(0), z: kz(0) };
  // the drifts it comes out of and goes into: on along its way past its first and last bars, off the lane (a dark
  // mouth in a ring of rock, facing the lane)
  const every = clockOf(order[0]).every || 1, b0 = order[0], b1 = order[order.length - 1];
  const s0 = startOf(b0), e1 = startOf(b1) + (clockOf(b1).on || 1);
  const mouth = (a: Bar, from: Bar): THREE.Vector3 | null => {
    let ax = a.c[0] - from.c[0], az = a.c[1] - from.c[1];
    const l = Math.hypot(ax, az) || 1;
    (ax /= l), (az /= l);
    if (a === from) (ax = Math.cos(a.ang)), (az = Math.sin(a.ang));
    // (the whole of its mouth off the lane and off the void: its middle and either end of it, across its way; on
    // along its way (a drum rolls only across its axis); none within 6: no drift)
    const RR = LB / 2 + 0.4, bad = (x: number, zz: number) => t.onGreen(x, zz) || overVoid(s, x, zz);
    let dx = ax, dz = az, d = Infinity;
    for (const [cx, cz] of [[ax, az]]) {
      let e = 0.5;
      while (e < 6 && [0, RR, -RR].some((w) => bad(a.c[0] + cx * e - cz * w, a.c[1] + cz * e + cx * w))) e += 0.25;
      if (e < 6 && e < d) (d = e), (dx = cx), (dz = cz);
    }
    if (!Number.isFinite(d)) return null;
    const p = new THREE.Vector3(a.c[0] + dx * (d + 0.2), 0, a.c[1] + dz * (d + 0.2));
    p.y = t.height(p.x, p.z);
    // (a drift as wide as the drum is long: a dark mouth under a lintel of rock, a rock either side)
    const m = new THREE.Group(), hole = new THREE.Mesh(new THREE.PlaneGeometry(LB + 0.3, 2 * R + 0.3), darkMouth());
    hole.position.set(0, R + 0.15, 0.02);
    const lintel = boulder(rand, LB / 2 + 0.6, 0.5, 0.6, 1);
    lintel.position.y = 2 * R + 0.55;
    m.add(hole, lintel);
    for (const sd of [-1, 1]) {
      const side = boulder(rand, 0.55, R + 0.5, 0.6, 1);
      side.position.set(sd * (LB / 2 + 0.55), R + 0.2, 0);
      m.add(side);
    }
    m.position.copy(p).addScaledVector(new THREE.Vector3(dx, 0, dz), 0.4);
    m.rotation.y = Math.atan2(-dx, -dz); // (facing back along its way, to the lane)
    g.add(m);
    return p;
  };
  const inAt = mouth(b0, order[1] || b0), outAt = mouth(b1, order[order.length - 2] || b1);
  return (tick: number, now: number) => {
    // (out of its drift in the tick before its first window, into the other in the tick after its last; in the dark
    // between)
    const k = mod(tick, every), before = mod(k - (s0 - 1), every), after = mod(k - e1, every), span = mod(e1 - s0, every) || every;
    // (between its bars only a tick either side of one's window: where the chain has none it is not on the lane)
    const kk = Math.floor(tick), rolling = mod(k - s0, every) < span && [kk - 1, kk, kk + 1].some((q) => bars.some((b) => isOn(b, q)));
    roll.visible = rolling || before < 1 || after < 1;
    if (!roll.visible) return;
    let x = kx(tick), z = kz(tick);
    if (!rolling && (before < 1 ? !inAt : !outAt)) return void (roll.visible = false);
    if (!rolling && before < 1 && inAt) { const u = smoothstep(before); (x = inAt.x + (b0.c[0] - inAt.x) * u), (z = inAt.z + (b0.c[1] - inAt.z) * u); }
    else if (!rolling && after < 1 && outAt) { const u = smoothstep(after); (x = b1.c[0] + (outAt.x - b1.c[0]) * u), (z = b1.c[1] + (outAt.z - b1.c[1]) * u); }
    roll.position.set(x, t.height(x, z) + R * 0.95, z);
    // (its axis along its bars, rolling about it the way it goes)
    const a = ang(tick), dx = x - last.x, dz = z - last.z;
    roll.rotation.y = Math.PI / 2 - a;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4 && d < 3) spin.rotation.z -= (dx * Math.sin(a) - dz * Math.cos(a)) / R;
    last.x = x;
    last.z = z;
    if (d > 0.05) fx.strike(0, new THREE.Vector3(x, t.height(x, z), z), now - 0.5);
    fx.step(now);
  };
}

// ------------------------------------------------------------ dispatch

/** A timed or pulse bar of the mines; undefined for one it does not draw. */
export function bar(b: Bar, t: Terrain, s: Hole): THREE.Object3D | undefined {
  switch (b.skin) {
    case "stamp": return machine(b, t, s, "stamp", (bs, g) => stampBattery(bs, g, t));
    case "paddle": return machine(b, t, s, "paddle", (bs, g) => waterWheel(bs, g, t));
    case "pickaxe": return machine(b, t, s, "pickaxe", (bs, g) => pickaxe(bs, g, t));
    case "drill": {
      // the hub is an untimed bar: the head stands on it (the boots are the timed ones)
      if (!b.timing) { hubs.set(s.zones, b); return new THREE.Group(); }
      return machine(b, t, s, "drill", (bs, g) => drillHead(bs, g, t, hubs.get(s.zones)));
    }
    case "piston": return machine(b, t, s, "piston", (bs, g) => pistons(bs, g, t));
    case "swing door": return machine(b, t, s, "swing door", (bs, g) => swingDoor(bs, g, t, s));
    case "safe door": return machine(b, t, s, "safe door", (bs, g) => safeDoor(bs, g, t, s));
    case "boulder": return b.timing ? machine(b, t, s, "boulder", (bs, g) => rollingBoulder(bs, g, t, s)) : undefined;
    case "cage door": return machine(b, t, s, "cage door", (bs, g) => cageDoors(bs, g, t));
    case "crystal gate": return machine(b, t, s, "crystal gate", (bs, g) => crystalGates(bs, g, t, s));
    case "tripwire": return machine(b, t, s, "tripwire", (bs, g) => tripwires(bs, g, t));
    case "stalactite": return machine(b, t, s, "stalactite", (bs, g) => stalactites(bs, g, t));
    default: return undefined;
  }
}
const hubs = new WeakMap<object, Bar>();

