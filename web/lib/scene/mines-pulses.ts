// The Crystal Mines' stroke pieces (the world's extras, course.ts
// buildExtras): what the pulses lay down at a stroke, drawn by the mines,
// moving on from the last stroke's (the extras swap at once: steady) and
// showing what the next strokes bring (the engine reads them with the
// stroke's: worlds.ts ahead) — hard but fair: every stroke-clock piece says
// what it will do before it does it.
//
//   vault door  the strongroom's round doors, rolling aside into their
//               recess or back across; a dial on each frame showing the next
//               strokes, lit where the door will be shut
//   turntable   the cart turntable at the junction, its deflector turning to
//               the stroke's track; a signal arm pointing at the next one
//   rockfall    cracks and dust in the roof the stroke before, then the roof
//               down: a heap of rock, a rumble
//   dynamite    a charged wall, its fuse burning on the last stroke before it
//               blows; then blown, the rubble scattered
//   crumble     a slab cracking and shedding pebbles the stroke before, then
//               gone into the dark
//   lava tide   the lake risen over the low stones, rising and falling back
//               with the strokes; the stones it will cover next glowing
//               through their cracks, a gauge by the lake
//   bat         a flock of bats at their roost, flying to the next as the
//               stroke changes, a few stirring over the roost of the next
//   shaft/lift  the lift's landing lamps: green where the cage will stand next
//               stroke, red where the shaft will be open
// Anything else of a stroke is drawn as the course draws it (a boulder's
// bars: mines-machines.ts). What comes next and is not here yet is also
// drawn as a dashed outline, as the timed pieces are while aiming.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flat, relief, share } from "./materials";
import { animate, state } from "./state";
import { seeded } from "./common";
import { ud, type Hole } from "./data";
import { bakeLocal } from "./bake";

import { lavaMaterial, crustBy } from "./mines-lava";
import { once, darkMouth, INK_THIN, inked, paint, boulder, halo, glow, TIMBER, TIMBER_DARK, TIMBER_LIGHT, IRON, IRON_DARK, BRASS, beam, log, plate, rivets, vnoise, solid, tinted, gem, knobbly } from "./mines-toon";
import { outline, sheet, overVoid, zone } from "./mines-zones";
import { mod, boxOf, inZone, inPoly, smoothstep } from "../terrain";
import { sound } from "../feel";
import type { Terrain } from "../terrain";
import type { Extras, Post, Vec2, Wall, Zone } from "../types";

/** A bar of the stroke: its four walls as one: centre, length, thickness, angle, its unit along. */
interface PBar { skin: string; c: Vec2; L: number; T: number; ang: number; ux: number; uz: number; key: string }
function barsOf(walls: readonly Wall[], skin: string): PBar[] {
  const ws = walls.filter((w) => w.skin === skin), out: PBar[] = [];
  for (let i = 0; i + 3 < ws.length; i += 4) {
    const q = ws.slice(i, i + 4), l = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const long = l(q[0]) >= l(q[1]) ? q[0] : q[1], L = Math.max(l(q[0]), l(q[1])), T = Math.min(l(q[0]), l(q[1]));
    const cx = q.reduce((a, w) => a + w.a[0] / 4, 0), cz = q.reduce((a, w) => a + w.a[1] / 4, 0), ang = Math.atan2(long.b[1] - long.a[1], long.b[0] - long.a[0]);
    out.push({ skin, c: [cx, cz], L, T, ang, ux: Math.cos(ang), uz: Math.sin(ang), key: skin + ":" + cx.toFixed(1) + "," + cz.toFixed(1) });
  }
  return out;
}
const zonesOf = (ex: Extras | null | undefined, skin: string) => (ex ? (ex.zones || []).filter((z) => z.skin === skin) : []);
const zkey = (z: Zone) => z.skin + ":" + z.min.join() + ":" + z.max.join();

// the last stroke's extras of each hole: what this stroke's move on from
const last = new WeakMap<Hole, Extras>();

// ------------------------------------------------------------ dashed outlines of what comes

const dashM = () => share(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.4, depthWrite: false }));
let dashMat: THREE.LineDashedMaterial | null = null;
/** Outlines, dashed round each as its own line would be, all one line (one draw). */
function dashed(loops: readonly (readonly Vec2[])[], t: Terrain) {
  const xyz: number[] = [], dist: number[] = [];
  for (const pts of loops) {
    let d = 0;
    pts.forEach(([x, z], k) => {
      const [x1, z1] = pts[(k + 1) % pts.length], y = t.height(x, z) + 0.06, y1 = t.height(x1, z1) + 0.06;
      xyz.push(x, y, z, x1, y1, z1);
      dist.push(d, (d += Math.hypot(x1 - x, y1 - y, z1 - z)));
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
  geo.setAttribute("lineDistance", new THREE.Float32BufferAttribute(dist, 1));
  return new THREE.LineSegments(geo, (dashMat ||= dashM()));
}
const corners = (b: PBar): Vec2[] => {
  const nx = -b.uz, nz = b.ux, hl = b.L / 2, ht = b.T / 2;
  return [[b.c[0] - b.ux * hl - nx * ht, b.c[1] - b.uz * hl - nz * ht], [b.c[0] + b.ux * hl - nx * ht, b.c[1] + b.uz * hl - nz * ht], [b.c[0] + b.ux * hl + nx * ht, b.c[1] + b.uz * hl + nz * ht], [b.c[0] - b.ux * hl + nx * ht, b.c[1] - b.uz * hl + nz * ht]];
};

// ------------------------------------------------------------ the vault doors
//
// A round vault door in its frame of stone and steel across the corridor:
// shut, it stands in its frame (the bar); open, it has rolled aside along
// its track into a recess beside the corridor. On the frame's lintel a dial
// shows the next three strokes, a lamp each: red where it will be shut.
function vaultDoor(b: PBar, t: Terrain, s: Hole, shut: boolean, was: boolean | null, next: readonly boolean[], t0: number) {
  const g = new THREE.Group(), y0 = t.height(b.c[0], b.c[1]);
  const R = b.L / 2 + 0.15, W = b.T * 0.9;
  // which way it rolls aside: the end of its axis that is off the lane
  let side = 1;
  const off = (sg: number) => [1.2, 1.6, 2.2].filter((u) => !t.onGreen(b.c[0] + b.ux * sg * b.L * u, b.c[1] + b.uz * sg * b.L * u)).length;
  if (off(-1) > off(1)) side = -1;
  const frame = new THREE.Group();
  // the gantry it hangs from: a steel beam over its whole travel, on two
  // posts off the lane (pushed out till they are), and its groove in the floor
  const out = (u0: number, sg: number) => {
    let u = u0;
    while (u < u0 + 3 && t.onGreen(b.c[0] + b.ux * sg * u, b.c[1] + b.uz * sg * u)) u += 0.25;
    return u + 0.5; // (its foot's half clear of the lane too)
  };
  const near = out(R + 0.3, -side), far = out(R + b.L + 0.9 + R, side), span = near + far, mid = (far - near) / 2;
  const top = plate(0.5, 0.45, span + 0.5, 0x5a6070);
  top.position.set(0, 2 * R + 0.55, side * mid);
  frame.add(top);
  // (where it stands on nothing, over the void: a post runs on down into the dark, and no track is laid)
  const ground = (u: number) => { const x = b.c[0] + b.ux * side * u, z = b.c[1] + b.uz * side * u; return t.onGreen(x, z) && !overVoid(s, x, z); };
  const lane = (u: number) => t.onGreen(b.c[0] + b.ux * side * u, b.c[1] + b.uz * side * u);
  for (const u of [-near, far]) {
    // (none standing on the lane: where the lane runs on past its travel, that end of the beam goes on into the rock)
    if (lane(u)) continue;
    const held = ground(u), tall = 2 * R + 0.8 + (held ? 0 : 8);
    const post = plate(0.45, tall, 0.45, 0x4a4f5c);
    post.position.set(0, 2 * R + 0.8 - tall / 2, side * u);
    frame.add(post);
    if (!held) continue;
    const foot = plate(0.9, 0.2, 0.9, IRON_DARK);
    foot.position.set(0, 0.1, side * u);
    frame.add(foot);
  }
  frame.add(rivets(Array.from({ length: 12 }, (_, k) => new THREE.Vector3(0.26, 2 * R + 0.55, side * (-near + (span * (k + 0.5)) / 12))), 0.05));
  // the door's seat: a steel ring sunk in the floor where it stands shut
  const seat = solid(new THREE.TorusGeometry(R + 0.12, 0.16, 8, 36, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), 0x7d8394);
  seat.position.y = -0.12; // (sunk: its crown flush with the floor at the corridor's sides)
  frame.add(seat);
  for (let u = -near, from = NaN; u <= far + 0.25; u += 0.25) {
    // the track in runs, over the ground only
    const on = u <= far && ground(u);
    if (on && Number.isNaN(from)) from = u;
    if ((!on || u + 0.25 > far) && !Number.isNaN(from)) {
      const to = on ? u : u - 0.25;
      if (to - from > 0.2) {
        const track = plate(W + 0.3, 0.05, to - from + 0.25, 0x2a2440);
        track.position.set(0, 0.03, side * (from + to) / 2);
        frame.add(track);
      }
      from = NaN;
    }
  }
  // the dial: three lamps on the lintel, the next strokes, red where it will be shut
  const dial = new THREE.Group();
  const face = solid(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateZ(Math.PI / 2), 0xe8dcc0);
  dial.add(face);
  next.forEach((sh, k) => {
    const lamp = gem(new THREE.SphereGeometry(0.12, 8, 6), sh ? 0xff4a3a : 0x6fe07a); // (lit from within: the world's glowing material)
    lamp.position.set(0.1, 0.22 * Math.cos(((k - 1) * Math.PI) / 3.5) - 0.02, 0.24 * Math.sin(((k - 1) * Math.PI) / 3.5));
    lamp.scale.setScalar(k === 0 ? 1.25 : 0.9);
    dial.add(lamp);
  });
  const hand = plate(0.06, 0.4, 0.06, 0x2a2440);
  hand.position.set(0.1, 0.18, 0);
  dial.add(hand);
  dial.position.set(0.35, 2 * R + 0.55, 0);
  frame.add(dial);
  // its pocket where it parks rolled aside: iron cheek plates either face of it and a dark back, its bay
  const park = side * (b.L + 0.6);
  for (const f of [-1, 1]) {
    const cheek = plate(0.1, 2 * R + 0.2, 2 * R + 0.3, 0x4a4f5c);
    cheek.position.set(f * (W / 2 + 0.16), R + 0.1, park);
    frame.add(cheek);
  }
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.3, 2 * R + 0.2), darkMouth());
  bay.position.set(0, R + 0.1, park + side * (R + 0.16));
  bay.rotation.y = side > 0 ? Math.PI : 0;
  frame.add(bay);
  frame.position.set(b.c[0], y0, b.c[1]);
  frame.rotation.y = -b.ang + Math.PI / 2;
  g.add(frame);
  // the door: a great disc of steel, its bolts, the spoked wheel, the brass dial
  const door = new THREE.Group();
  door.add(solid(new THREE.CylinderGeometry(R, R, W, 24).rotateZ(Math.PI / 2), 0x8a90a0));
  door.add(solid(new THREE.CylinderGeometry(R * 0.8, R * 0.8, W + 0.1, 24).rotateZ(Math.PI / 2), 0x9aa0ae));
  for (const f of [-1, 1]) {
    // on each face: a spoked brass wheel, its hub, a ring of bolts
    for (let k = 0; k < 3; k++) {
      const sp = plate(0.1, R * 1.1, 0.14, BRASS);
      sp.position.set(f * (W / 2 + 0.1), 0, 0);
      sp.rotation.x = (k / 3) * Math.PI;
      door.add(sp);
    }
    door.add(solid(new THREE.TorusGeometry(R * 0.55, 0.06, 6, 24).rotateY(Math.PI / 2).translate(f * (W / 2 + 0.16), 0, 0), BRASS));
    door.add(solid(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16).rotateZ(Math.PI / 2).translate(f * (W / 2 + 0.16), 0, 0), 0xe0c070));
    const bolts = rivets(Array.from({ length: 16 }, (_, k) => new THREE.Vector3(0, Math.sin((k / 16) * Math.PI * 2) * R * 0.9, Math.cos((k / 16) * Math.PI * 2) * R * 0.9)), 0.07);
    bolts.position.x = f * (W / 2 + 0.02);
    bolts.rotation.y = f > 0 ? 0 : Math.PI;
    door.add(bolts);
  }
  const roll = new THREE.Group();
  roll.add(door);
  // what carries it: a trolley running under the gantry's beam, a yoke down either face to the door's hub pins
  const yoke = new THREE.Group(), YX = W / 2 + 0.36, beamY = R + 0.55 - 0.225;
  // (its crossbar over the door's top, the trolley between it and the beam)
  const trolley = plate(0.6, beamY - R - 0.23, 0.9, 0x4a4f5c);
  trolley.position.set(0, (beamY + R + 0.23) / 2, 0);
  const crossbar = plate(2 * YX + 0.12, 0.16, 0.2, IRON_DARK);
  crossbar.position.set(0, R + 0.15, 0);
  yoke.add(trolley, crossbar);
  for (const f of [-1, 1]) {
    const arm = plate(0.12, R + 0.15, 0.2, IRON_DARK);
    arm.position.set(f * YX, (R + 0.15) / 2, 0);
    yoke.add(arm, solid(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10).rotateZ(Math.PI / 2).translate(f * (YX - 0.1), 0, 0), IRON));
  }
  roll.add(yoke);
  roll.position.set(b.c[0], y0 + R, b.c[1]);
  roll.rotation.y = -b.ang + Math.PI / 2;
  g.add(roll);
  const aside = b.L + 0.6; // how far it rolls to clear the way
  const place = (k: number) => {
    const d = side * aside * (1 - k);
    roll.position.set(b.c[0] + b.ux * d, y0 + R, b.c[1] + b.uz * d);
    door.rotation.x = (side * d) / R; // rolling
  };
  const from = was == null ? (shut ? 1 : 0) : was ? 1 : 0, to = shut ? 1 : 0;
  place(from);
  if (from !== to) {
    // (live only while it rolls: standing still, it merges with the stroke's pieces)
    bakeLocal(door);
    ud(roll).live = ud(door).live = true;
    let rang = false;
    animate((tt) => {
      const k = smoothstep((tt - t0 - 0.2) / 1.6);
      place(from + (to - from) * k);
      if (!rang && k > 0) (rang = true), sound("rumble", 0.35);
    });
  }
  return g;
}

// ------------------------------------------------------------ the turntable

/** The cart turntable: a timber platter on its iron ring, the deflector (the bar) across it, turned to the stroke's track; a signal arm at its side pointing at the next. */
function turntable(bars: readonly PBar[], now: PBar | undefined, was: PBar | undefined, next: PBar | undefined, t: Terrain, s: Hole, t0: number) {
  const g = new THREE.Group();
  const cx = bars.reduce((a, b) => a + b.c[0], 0) / bars.length, cz = bars.reduce((a, b) => a + b.c[1], 0) / bars.length;
  // as wide as its deflector swings, but never out past the lane (a deck over the void would be a lie)
  let fit = Infinity;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    let d = 0.2;
    while (d < 12 && t.onGreen(cx + Math.cos(a) * d, cz + Math.sin(a) * d) && !overVoid(s, cx + Math.cos(a) * d, cz + Math.sin(a) * d)) d += 0.1;
    fit = Math.min(fit, d);
  }
  // (never out past the room there is: a platter out over the void would be a lie, however short its deflector)
  const R = Math.max(0.3, Math.min(Math.max(...bars.map((b) => Math.hypot(b.c[0] - cx, b.c[1] - cz) + b.L / 2)) + 0.3, fit - 0.1)), y0 = t.height(cx, cz);
  // the platter: a ring of iron, the boards across, a brass kingpin
  const plat = new THREE.Group();
  // (flush with the lane: its ring and kingpin a hair over the boards, the ball rolls over them)
  plat.add(solid(new THREE.TorusGeometry(R, 0.14, 6, 40).rotateX(Math.PI / 2).translate(0, -0.06, 0), IRON_DARK));
  const boards: THREE.BufferGeometry[] = [];
  for (let k = -Math.floor(R / 0.5); k <= Math.floor(R / 0.5); k++) {
    const x = k * 0.5, w = 2 * Math.sqrt(Math.max(0, R * R - x * x)) - 0.1;
    if (w < 0.2) continue;
    const geo = new THREE.BoxGeometry(0.46, 0.06, w).translate(x, 0.03, 0);
    paint(geo, (_x, _y, _z, c) => c.set([TIMBER, TIMBER_LIGHT, TIMBER_DARK][(k + 30) % 3]));
    boards.push(geo);
  }
  plat.add(new THREE.Mesh(mergeGeometries(boards), relief()));
  plat.add(solid(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 12).translate(0, 0.04, 0), BRASS));
  // the gap round the platter where it turns in its pit (dark, a hair over the lane)
  // (never out over the void past the lane: as wide as the room round the platter allows)
  const gapOut = Math.min(R + 0.3, fit - 0.05);
  if (gapOut > R + 0.17) {
    const gap = new THREE.Mesh(new THREE.RingGeometry(R + 0.14, gapOut, 40).rotateX(-Math.PI / 2), once("pit gap", () => new THREE.MeshBasicMaterial({ color: 0x120c18 })));
    gap.position.set(cx, y0 + 0.02, cz);
    g.add(gap);
  }
  // what turns it: a motor off the lane by the rim, its shaft to a pinion at the platter's ring
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, mxp = cx + Math.cos(a) * (R + 1.1), mzp = cz + Math.sin(a) * (R + 1.1);
    if (t.onGreen(mxp, mzp) || overVoid(s, mxp, mzp)) continue;
    const motor = new THREE.Group();
    const box = plate(0.7, 0.55, 0.6, 0x4a4f5c);
    box.position.set(0, 0.28, 0);
    const shaft = solid(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8).rotateZ(Math.PI / 2).translate(-0.8, 0.1, 0), IRON);
    const pinion = solid(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10).translate(-1.2, 0.08, 0), BRASS);
    motor.add(box, shaft, pinion);
    motor.position.set(mxp, t.height(mxp, mzp), mzp);
    motor.rotation.y = -a;
    g.add(motor);
    break;
  }
  const turn = new THREE.Group();
  turn.add(plat);
  // the deflector: a buffer beam with its rails, across the platter where the bar is
  const defl = new THREE.Group();
  // (as long as its bar: a collider, drawn where the chain has it)
  const bw = now || bars[0], BL = bw.L, shift = 0;
  const beamM = beam(BL, 0.55, bw.T * 0.9, 0xb8433a);
  beamM.position.y = 0.32;
  const stripe = tinted(new THREE.BoxGeometry(BL * 0.98, 0.08, bw.T * 0.92).translate(0, 0.5, 0), 0xf1d24a);
  defl.add(beamM, stripe);
  // (its offset from the platter's middle, as the bar has it)
  const off = (b: PBar) => [(b.c[0] - cx) * Math.cos(b.ang) + (b.c[1] - cz) * Math.sin(b.ang), -(b.c[0] - cx) * Math.sin(b.ang) + (b.c[1] - cz) * Math.cos(b.ang)] as const;
  turn.add(defl);
  turn.position.set(cx, y0 + 0.02, cz);
  g.add(turn);
  const set = (a: number, o: readonly [number, number]) => {
    turn.rotation.y = -a;
    defl.position.set(o[0] + shift, 0, o[1]);
  };
  const to = now || bars[0], from = was || to;
  set(from.ang, off(from));
  if (from.key !== to.key) {
    // (live only while it turns: standing still, it merges with the stroke's pieces)
    bakeLocal(plat), bakeLocal(defl);
    ud(turn).live = ud(plat).live = ud(defl).live = true;
    // the shorter way round, a line being a line (half turns)
    let d = to.ang - from.ang;
    d = mod(d + Math.PI / 2, Math.PI) - Math.PI / 2;
    let rang = false;
    animate((tt) => {
      const k = smoothstep((tt - t0 - 0.2) / 1.4);
      set(from.ang + d * k, [off(from)[0] + (off(to)[0] - off(from)[0]) * k, off(from)[1] + (off(to)[1] - off(from)[1]) * k]);
      if (!rang && k > 0) (rang = true), sound("rumble", 0.2);
    });
  }
  // the signal: a post at the platter's rim, its arm pointing along the next track, its lamp
  if (next) {
    const sig = new THREE.Group();
    const pole = log(0.08, 2.6, IRON);
    sig.add(pole);
    const arm = plate(1.3, 0.2, 0.08, next.key === to.key ? 0x5fd06a : 0xe0524b);
    arm.position.set(0.65, 2.4, 0);
    sig.add(arm);
    const lamp = halo(0.5, next.key === to.key ? 0x6fe07a : 0xff6a4a, 0.5);
    lamp.position.set(0, 2.6, 0);
    sig.add(lamp);
    // off the lane at the rim, the arm along the next deflector's way
    let best: [number, number] = [cx + R + 0.6, cz];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = cx + Math.cos(a) * (R + 0.8), z = cz + Math.sin(a) * (R + 0.8);
      if (!t.onGreen(x, z)) { best = [x, z]; break; }
    }
    sig.position.set(best[0], t.height(best[0], best[1]), best[1]);
    sig.rotation.y = -next.ang;
    g.add(sig);
  }
  return g;
}

// ------------------------------------------------------------ the rockfall and the dynamite

/** The roof over a bar: a crag of cracked rock hanging from the vault, its underside CRAG over the floor; fallen, a pale scar in it where the rock came away. */
const CRAG = 8.7;
function crag(b: PBar, y0: number, scar: boolean) {
  const rand = seeded("crag" + b.key), g = new THREE.Group();
  const rock = boulder(rand, b.L * 0.6 + 0.6, 3, b.T * 0.8 + 0.5, 1);
  rock.position.set(b.c[0], y0 + CRAG + 2.7, b.c[1]);
  rock.rotation.y = -b.ang;
  g.add(rock);
  if (scar) {
    const bare = solid(knobbly(new THREE.IcosahedronGeometry(1, 1), rand, 0.2, 1.4).scale(b.L * 0.4 + 0.3, 0.5, b.T * 0.5 + 0.2), 0xa89cb8);
    bare.position.set(b.c[0], y0 + CRAG + 0.25, b.c[1]);
    bare.rotation.y = -b.ang;
    g.add(bare);
  }
  return g;
}

/** A heap of fallen roof over a bar's footprint: boulders piled on it, rubble round it; the crag it came down from over it. */
function heap(b: PBar, t: Terrain, fall: boolean, t0: number) {
  const g = new THREE.Group(), rand = seeded("heap" + b.key), y0 = t.height(b.c[0], b.c[1]);
  g.add(crag(b, y0, true));
  const n = Math.max(3, Math.round(b.L / 0.8));
  const rocks: { m: THREE.Object3D; y: number; d: number }[] = [];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n - 0.5, s = b.T * (0.45 + rand() * 0.3);
    const r = boulder(rand, s * 1.1, s * 0.8, s, 1);
    // (inside the bar's ends: the rock is where the chain has it, not over the drop past its end)
    const v = Math.max(-(b.L / 2 - s), Math.min(b.L / 2 - s, u * b.L)), x = b.c[0] + b.ux * v, z = b.c[1] + b.uz * v, y = y0 + s * 0.55;
    r.position.set(x, y, z);
    r.rotation.y = rand() * 6;
    g.add(r);
    rocks.push({ m: r, y, d: rand() * 0.25 });
    if (rand() < 0.5) {
      const top = boulder(rand, s * 0.6, s * 0.5, s * 0.6, 0);
      top.position.set(x + (rand() - 0.5) * 0.3, y + s * 0.8, z + (rand() - 0.5) * 0.3);
      g.add(top);
      rocks.push({ m: top, y: y + s * 0.8, d: rand() * 0.3 + 0.1 });
    }
  }
  if (fall) {
    // down from the crag, one after another, a rumble and dust
    for (const r of rocks) (ud(r.m).live = true), r.m.position.setY(y0 + CRAG + 0.4);
    // (its own material, faded as it settles: never the halos' shared one, every halo in the mines dimmed with it)
    const dust = glow(new THREE.IcosahedronGeometry(b.L * 0.7, 1), 0xa89cb8, 0.5);
    dust.position.set(b.c[0], y0 + 0.8, b.c[1]);
    dust.visible = false;
    g.add(dust);
    let rang = false;
    animate((tt) => {
      for (const r of rocks) {
        const k = Math.min(1, Math.max(0, (tt - t0 - 0.3 - r.d) / 0.45)), top = y0 + CRAG + 0.4;
        r.m.position.setY(top + (r.y - top) * k * k);
      }
      const k = (tt - t0 - 0.75) / 1.4;
      dust.visible = k > 0 && k < 1;
      if (dust.visible) (dust.scale.setScalar(0.6 + k), ((dust.material).opacity = 0.5 * (1 - k)));
      if (!rang && tt - t0 > 0.6) (rang = true), sound("rumble");
    });
  }
  return g;
}

/** Cracks in the crag over a bar and dust trickling from them, pebbles dropping: the roof will come down next stroke. */
function cracking(b: PBar, t: Terrain) {
  const g = new THREE.Group(), y0 = t.height(b.c[0], b.c[1]), rand = seeded("crk" + b.key);
  ud(g).live = true;
  g.add(crag(b, y0, false));
  // cracks glowing dull across its underside, where it will break away
  const lines: THREE.Vector3[] = [];
  for (let k = 0; k < 6; k++) {
    let x = b.c[0] + b.ux * (rand() - 0.5) * b.L, z = b.c[1] + b.uz * (rand() - 0.5) * b.L, a = rand() * 6;
    for (let s = 0; s < 4; s++) {
      const nx = x + Math.cos(a) * 0.4, nz = z + Math.sin(a) * 0.4;
      lines.push(new THREE.Vector3(x, y0 + CRAG - 0.02, z), new THREE.Vector3(nx, y0 + CRAG - 0.02, nz));
      (x = nx), (z = nz), (a += (rand() - 0.5) * 1.2);
    }
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x1a1320 })));
  // dust streaming down in thin veils, pebbles dropping
  const n = 10, peb = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.06, 0), flat(0x8a7f98), n);
  peb.frustumCulled = false;
  g.add(peb);
  const drops = Array.from({ length: n }, () => ({ x: b.c[0] + b.ux * (rand() - 0.5) * b.L, z: b.c[1] + b.uz * (rand() - 0.5) * b.L, ph: rand() * 3, T: 1 + rand() }));
  const veil = glow(new THREE.CylinderGeometry(0.08, 0.3, 8, 6, 1, true).translate(0, 4, 0), 0xb8aec8, 0.35);
  veil.position.set(b.c[0], y0, b.c[1]);
  g.add(veil);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  animate((tt) => {
    drops.forEach((d, i) => {
      const k = ((tt + d.ph) % d.T) / d.T;
      peb.setMatrixAt(i, M.compose(P.set(d.x, y0 + 8 * (1 - k * k), d.z), Q, S));
    });
    peb.instanceMatrix.needsUpdate = true;
    veil.scale.set(1 + 0.2 * Math.sin(tt * 3), 1, 1 + 0.2 * Math.sin(tt * 3));
  });
  return g;
}

/** The charged wall: rock shored with timber, a bundle of dynamite in its face, the fuse to a plunger; lit, the spark runs down it. */
function charge(b: PBar, t: Terrain, sh: Hole, lit: boolean) {
  const g = new THREE.Group(), rand = seeded("dyn" + b.key), y0 = t.height(b.c[0], b.c[1]);
  const wall = new THREE.Group();
  for (let k = 0; k < Math.max(2, Math.round(b.L / 1.1)); k++) {
    const u = (k + 0.5) / Math.max(2, Math.round(b.L / 1.1)) - 0.5, s = b.T * 0.6;
    const r = boulder(rand, (b.L / Math.max(2, Math.round(b.L / 1.1))) * 0.7, 0.8, s, 1);
    // (all along its bar: a collider, drawn where the chain has it, over the void too)
    r.position.set(u * b.L, 0.75, 0);
    wall.add(r);
  }
  // shoring timbers leaning on it, and the bundle: red sticks bound with wire
  for (const u of [-0.35, 0.35]) {
    const prop = beam(0.2, 1.8, 0.2, TIMBER_DARK);
    prop.position.set(u * b.L, 0.9, b.T * 0.45);
    prop.rotation.x = -0.25;
    wall.add(prop);
  }
  const bundle = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const st = solid(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8).translate(((k % 3) - 1) * 0.19, 0, (Math.floor(k / 3) - 0.5) * 0.18), 0xd8402f);
    bundle.add(st);
  }
  bundle.add(tinted(new THREE.TorusGeometry(0.33, 0.03, 4, 12).rotateX(Math.PI / 2), IRON));
  bundle.position.set(0, 0.9, b.T * 0.35);
  bundle.rotation.x = Math.PI / 2 - 0.3;
  wall.add(bundle);
  // the warning sign nailed to the shoring
  const sign = plate(0.6, 0.45, 0.05, 0xf1d24a);
  sign.position.set(b.L * 0.35, 1.25, b.T * 0.5 + 0.1);
  sign.rotation.x = -0.25;
  wall.add(sign);
  wall.position.set(b.c[0], y0, b.c[1]);
  wall.rotation.y = -b.ang;
  g.add(wall);
  // the fuse: a line off the bundle along the floor to its coil past the wall's end (the end with ground past it,
  // not the void; at the end itself if neither has)
  const past = (sg: number) => !overVoid(sh, b.c[0] + b.ux * sg * (b.L / 2 + 0.9), b.c[1] + b.uz * sg * (b.L / 2 + 0.9));
  const sg = past(1) ? 1 : past(-1) ? -1 : 0, end = sg ? b.L * 0.5 + 0.8 : b.L * 0.4;
  const fz = b.T * 0.35 + 0.1, pts = [new THREE.Vector3(0, 0.75, fz), new THREE.Vector3(0.3 * (sg || 1), 0.1, fz + 0.1), new THREE.Vector3(b.L * 0.45 * (sg || 1), 0.06, fz * 0.5), new THREE.Vector3(end * (sg || 1), 0.05, sg ? 0 : fz * 0.5)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 24, 0.035, 4), fuse = tinted(tube, 0x2a2020);
  // its coil at the far end, where it was lit
  const coil = tinted(new THREE.TorusGeometry(0.22, 0.035, 4, 14).rotateX(Math.PI / 2).translate(pts[3].x, 0.04, pts[3].z), 0x2a2020), coil2 = tinted(new THREE.TorusGeometry(0.14, 0.035, 4, 12).rotateX(Math.PI / 2).translate(pts[3].x, 0.1, pts[3].z), 0x2a2020);
  const fz0 = new THREE.Group();
  fz0.add(fuse, coil, coil2);
  fz0.position.copy(wall.position);
  fz0.rotation.y = wall.rotation.y;
  g.add(fz0);
  if (lit) {
    // the spark burning once down the fuse toward the charge, slower and slower as it nears it (it blows next
    // stroke), the fuse burnt away behind it
    const spark = halo(0.35, 0xffc04a, 0.9);
    ud(spark).live = true;
    ud(fuse).live = true;
    fz0.add(spark);
    const P = new THREE.Vector3(), rings = tube.index ? tube.index.count / 24 : 0;
    let t1 = -1;
    animate((tt) => {
      if (t1 < 0) t1 = tt;
      const k = 1 - 0.9 * (1 - Math.exp(-(tt - t1) / 10));
      curve.getPoint(k * 0.95, P);
      spark.position.copy(P);
      spark.scale.setScalar(0.7 + 0.3 * Math.sin(tt * 30));
      if (rings) tube.setDrawRange(0, Math.floor(k * 0.95 * 24) * rings);
    });
  }
  return g;
}

/** The charge blown: a flash, rock flung and falling back as rubble where the wall stood, smoke. */
function blown(b: PBar, t: Terrain, s: Hole, fresh: boolean, t0: number) {
  const g = new THREE.Group(), rand = seeded("blown" + b.key), y0 = t.height(b.c[0], b.c[1]);
  // the rubble left: small stones scattered off the lane's line (along the wall's foot), the way through clear
  const bits: { m: THREE.Object3D; to: THREE.Vector3; v: THREE.Vector3 }[] = [];
  for (let k = 0; k < 14; k++) {
    const sz = 0.12 + rand() * 0.2;
    // (never on the lane: rubble in the way would be a lie; a few tries, else none)
    let to: THREE.Vector3 | null = null;
    for (let q = 0; q < 6 && !to; q++) {
      const sd = rand() < 0.5 ? -1 : 1, u = (rand() - 0.5) * 1.3;
      const p = new THREE.Vector3(b.c[0] + b.ux * u * b.L - b.uz * sd * (b.T + 0.4 + rand() * 0.8), 0, b.c[1] + b.uz * u * b.L + b.ux * sd * (b.T + 0.4 + rand() * 0.8));
      if (!t.onGreen(p.x, p.z) && !overVoid(s, p.x, p.z)) to = p;
    }
    if (!to) continue;
    const r = boulder(rand, sz, sz * 0.7, sz, 0);
    to.y = t.height(to.x, to.z) + sz * 0.4;
    r.position.copy(to);
    g.add(r);
    bits.push({ m: r, to, v: new THREE.Vector3((to.x - b.c[0]) * 2.2, 6 + rand() * 4, (to.z - b.c[1]) * 2.2) });
  }
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(b.L * 0.7, 20).rotateX(-Math.PI / 2), once("scorch", () => new THREE.MeshBasicMaterial({ color: 0x1a1016, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })));
  scorch.position.set(b.c[0], y0 + 0.04, b.c[1]);
  g.add(scorch);
  if (fresh) {
    for (const q of bits) ud(q.m).live = true;
    const flash = glow(new THREE.IcosahedronGeometry(1, 1), 0xffd27a, 0.95);
    (flash.material).depthTest = false;
    flash.position.set(b.c[0], y0 + 1, b.c[1]);
    g.add(flash);
    const smoke = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshToonMaterial({ color: 0x4a4458, transparent: true, depthWrite: false }));
    smoke.position.copy(flash.position);
    g.add(smoke);
    let boomed = false;
    animate((tt) => {
      const k = tt - t0 - 0.2;
      if (!boomed && k > 0) (boomed = true), sound("blast");
      flash.visible = k > 0 && k < 0.5;
      if (flash.visible) (flash.scale.setScalar(1 + k * 8), ((flash.material).opacity = 0.95 * (1 - k / 0.5)));
      smoke.visible = k > 0.05 && k < 2.5;
      if (smoke.visible) (smoke.scale.setScalar(1 + k * 1.5), smoke.position.setY(y0 + 1 + k * 1.2), ((smoke.material).opacity = 0.8 * (1 - k / 2.5)));
      for (const q of bits) {
        const f = Math.max(0, Math.min(1, k / 1.1));
        // thrown up out of the wall's middle and landing where it lies
        q.m.position.set(b.c[0] + (q.to.x - b.c[0]) * f, q.to.y + Math.max(0, 3.5 * Math.sin(Math.PI * f)), b.c[1] + (q.to.z - b.c[1]) * f);
      }
    });
  }
  return g;
}

// ------------------------------------------------------------ slabs that crumble

/** Where a slab has fallen: the lane broken open over the dark, jagged lips of rock and splintered planks round it, darkness going down. */
function brokenHole(z: Zone, t: Terrain, s: Hole, fresh: boolean, t0: number) {
  const g = new THREE.Group(), pts = outline(z, s), rand = seeded("hole" + zkey(z));
  const deep = new THREE.Color(0x05040a), lip = new THREE.Color(0x2a2440);
  // the dark down there, seen through the break: black in the middle, the rock's lip showing at its edge
  // (a stroke's hole is not cut in the lane: its dark lies over it, a hair up)
  const geo = sheet(pts, 0.35, (x, zz) => t.height(x, zz) + 0.045, (_x, _z, d, c) => c.copy(lip).lerp(deep, smoothstep(d / 0.6)), (x, zz) => !overVoid(s, x, zz));
  g.add(new THREE.Mesh(geo, once("broken hole", () => new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }))));
  // the broken edge: chunks of rock round the rim, leaning in
  const chunks: THREE.BufferGeometry[] = [];
  for (let k = 0; k < pts.length; k += 3) {
    const [x, zz] = pts[k];
    if (overVoid(s, x, zz) || !t.onGreen(x, zz)) continue;
    const r = 0.12 + rand() * 0.18, geo2 = new THREE.DodecahedronGeometry(r, 0).scale(1, 0.6, 1).rotateY(rand() * 6).translate(x, t.height(x, zz) + r * 0.3, zz);
    paint(geo2, (_x, y, _z, c) => c.set(0x5a5270).multiplyScalar(0.8 + 0.4 * y));
    chunks.push(geo2);
  }
  if (chunks.length) g.add(inked(mergeGeometries(chunks), relief(), INK_THIN));
  if (fresh) {
    // the slab dropping away into the dark, turning as it goes
    // (a slab of rock 0.3 thick, its top the lane's)
    const { cx, cz } = boxOf(z), y0 = t.height(cx, cz);
    const slab = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x - cx, zz - cz))), { depth: 0.3, bevelEnabled: false }).rotateX(Math.PI / 2);
    paint(slab, (x, y, zz, c) => c.set(y < -0.05 ? 0x4f486a : vnoise(x * 2, zz * 2) > 0.5 ? 0x7b6e8c : 0x6a5f7a));
    const m = new THREE.Mesh(slab, relief(THREE.DoubleSide));
    ud(m).live = true;
    const piv = new THREE.Group();
    piv.add(m);
    piv.position.set(cx, y0 + 0.03, cz);
    ud(piv).live = true;
    g.add(piv);
    let rang = false;
    animate((tt) => {
      const k = Math.max(0, tt - t0 - 0.3);
      piv.position.y = y0 + 0.03 - 4.9 * k * k;
      piv.rotation.set(k * 0.8, 0, k * 0.5);
      piv.visible = k < 1.4;
      if (!rang && k > 0) (rang = true), sound("drop");
    });
  }
  return g;
}

/** A slab about to go: cracks across it, grit trickling out of them, a tremble. */
function cracked(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), pts = outline(z, s), rand = seeded("crk" + zkey(z));
  ud(g).live = true;
  const lines: THREE.Vector3[] = [];
  const { cx, cz, w, h } = boxOf(z), r = Math.min(w, h) / 2;
  for (let k = 0; k < 7; k++) {
    // from the middle out to the rim: the break line it will fall along
    let x = cx, zz = cz, a = (k / 7) * Math.PI * 2 + rand() * 0.5;
    while (inZone(z, x, zz) && Math.hypot(x - cx, zz - cz) < r * 1.1) {
      const nx = x + Math.cos(a) * 0.35, nz = zz + Math.sin(a) * 0.35;
      lines.push(new THREE.Vector3(x, t.height(x, zz) + 0.06, zz), new THREE.Vector3(nx, t.height(nx, nz) + 0.06, nz));
      (x = nx), (zz = nz), (a += (rand() - 0.5) * 0.7);
    }
  }
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x120c18 }));
  g.add(line);
  // a ring round its edge where it is parting from the lane, and pebbles falling through it
  g.add(dashed([pts], t));
  const n = 8, peb = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.05, 0), flat(0x8a7f98), n);
  peb.frustumCulled = false;
  g.add(peb);
  const drops = Array.from({ length: n }, (_, i) => ({ p: pts[Math.floor((i / n) * pts.length)], ph: rand() * 2 }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  animate((tt) => {
    drops.forEach((d, i) => {
      const k = ((tt + d.ph) % 1.6) / 1.6;
      peb.setMatrixAt(i, M.compose(P.set(d.p[0], t.height(d.p[0], d.p[1]) + 0.05 - 3 * k * k, d.p[1]), Q, S));
    });
    peb.instanceMatrix.needsUpdate = true;
    line.position.x = 0.01 * Math.sin(tt * 43);
  });
  return g;
}

/** Rotten planks over a pit (a crumble that comes and goes): the deck when it holds, stubs round the hole when it gives. */
function planks(z: Zone, t: Terrain, s: Hole, gone: boolean, fresh: boolean, t0: number) {
  const g = new THREE.Group(), rand = seeded("plk" + zkey(z));
  const { cx, cz } = boxOf(z);
  const deck: THREE.BufferGeometry[] = [];
  for (let x = z.min[0] + 0.25; x < z.max[0]; x += 0.5) {
    // each plank across, cut to the outline; gone: only its ends at the rim, splintered
    let lo = Infinity, hi = -Infinity;
    for (let zz = z.min[1]; zz <= z.max[1]; zz += 0.1) if (inZone(z, x, zz)) (lo = Math.min(lo, zz)), (hi = Math.max(hi, zz));
    if (!(hi > lo)) continue;
    const tone = [0x8a6a44, 0x7a5a38, 0x6a4c30][Math.floor(rand() * 3)];
    // (run on 0.2 past the pit's edges onto the ledgers)
    (lo -= 0.2), (hi += 0.2);
    const parts: [number, number][] = gone ? [[lo, lo + 0.5 + rand() * 0.5], [hi - 0.5 - rand() * 0.5, hi]] : [[lo, hi]];
    for (const [a, b] of parts) {
      const geo = new THREE.BoxGeometry(0.44, 0.08, b - a).translate(x, t.height(x, (a + b) / 2) + 0.04, (a + b) / 2);
      paint(geo, (_x, _y, _z, c) => c.set(tone));
      deck.push(geo);
    }
  }
  // the ledgers the planks rest on, along the pit's edges under their ends
  for (const e of [z.min[1] - 0.1, z.max[1] + 0.1]) {
    const L = z.max[0] - z.min[0] + 0.3, geo = new THREE.BoxGeometry(L, 0.1, 0.22).translate(cx, t.height(cx, e) - 0.02, e);
    paint(geo, (_x, _y, _z, c) => c.set(TIMBER_DARK));
    deck.push(geo);
  }
  if (deck.length) g.add(inked(mergeGeometries(deck), relief(), INK_THIN));
  if (gone) g.add(brokenHole(z, t, s, false, t0));
  if (fresh && gone) {
    // the planks giving way: boards falling into the dark
    const falling = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const p = beam(0.44, 0.08, 1.2 + rand(), 0x7a5a38);
      p.position.set(cx + (rand() - 0.5) * (z.max[0] - z.min[0]) * 0.6, t.height(cx, cz), cz + (rand() - 0.5) * (z.max[1] - z.min[1]) * 0.6);
      falling.add(p);
    }
    ud(falling).live = true;
    g.add(falling);
    let rang = false;
    animate((tt) => {
      const k = Math.max(0, tt - t0 - 0.3);
      falling.position.y = -4.9 * k * k;
      falling.children.forEach((c, i) => (c.rotation.set(k * (1 + i * 0.3), 0, k * 0.7)));
      falling.visible = k < 1.4;
      if (!rang && k > 0) (rang = true), sound("drop");
    });
  }
  return g;
}

// ------------------------------------------------------------ the lava tide

/** The tide over the low stones: lava risen over them, rising in if it was not there, sinking away if it goes. */
function tide(z: Zone, t: Terrain, s: Hole, rising: number, t0: number) {
  const g = new THREE.Group(), pts = z.poly && z.poly.length > 2 ? z.poly.map(([x, y]): [number, number] => [x, y]) : outline(z, s);
  // (one level, as a lake's: over the highest of the stones it covers, flat; a skirt of it down its edge to the
  // ground, so nothing shows under it where the stones fall away)
  const keep = (x: number, zz: number) => !overVoid(s, x, zz) && !s.zones.some((q) => q.skin === "causeway" && inZone(q, x, zz)); // (the causeway's stones stand out of it)
  let top = -Infinity;
  for (let x = z.min[0]; x <= z.max[0]; x += 0.25) for (let zz = z.min[1]; zz <= z.max[1]; zz += 0.25) if (inPoly(x, zz, pts) && keep(x, zz)) top = Math.max(top, t.height(x, zz));
  const level = (Number.isFinite(top) ? top : t.height(boxOf(z).cx, boxOf(z).cz)) + 0.13;
  const geo = sheet(pts, 0.4, () => level, undefined, keep);
  const d = geo.userData.d as Float32Array;
  crustBy(geo, () => 0);
  const cr = geo.attributes.lavaCrust as THREE.BufferAttribute;
  for (let i = 0; i < cr.count; i++) cr.setX(i, 0.7 * (1 - smoothstep(d[i] / 0.8)));
  const skirt: number[] = [];
  for (let k = 0; k < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
    if (!keep((ax + bx) / 2, (az + bz) / 2)) continue;
    const ay = t.height(ax, az) - 0.3, by = t.height(bx, bz) - 0.3;
    // (both faces: whichever way the outline runs, its outside shows)
    skirt.push(ax, level, az, bx, level, bz, bx, by, bz, ax, level, az, bx, by, bz, ax, ay, az);
    skirt.push(ax, level, az, bx, by, bz, bx, level, bz, ax, level, az, ax, ay, az, bx, by, bz);
  }
  const sk = new THREE.BufferGeometry();
  sk.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
  sk.computeVertexNormals();
  crustBy(sk, () => 0.6);
  const parts = [geo.index ? geo.toNonIndexed() : geo, sk].map((q) => { for (const k of Object.keys(q.attributes)) if (k !== "position" && k !== "lavaCrust") q.deleteAttribute(k); q.computeVertexNormals(); return q; });
  const m = new THREE.Mesh(mergeGeometries(parts), lavaMaterial());
  ud(m).live = true;
  g.add(m);
  // rising in (1) from under the stones, or sinking away (-1), or standing (0)
  const set = (k: number) => {
    m.position.y = -0.5 * (1 - k);
    m.visible = k > 0.02;
  };
  set(rising >= 0 ? (rising > 0 ? 0 : 1) : 1);
  if (rising) {
    let rang = false;
    animate((tt) => {
      const k = smoothstep((tt - t0 - 0.2) / 1.5);
      set(rising > 0 ? k : 1 - k);
      if (!rang && k > 0) (rang = true), sound("hiss");
    });
  }
  return g;
}

/** Where the tide will rise next stroke: hairline cracks in the stones glowing through, pulsing (the lake below breathing in). */
function seep(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), rand = seeded("seep" + zkey(z));
  const lines: THREE.Vector3[] = [];
  for (let k = 0; k < 9; k++) {
    let x = z.min[0] + rand() * (z.max[0] - z.min[0]), zz = z.min[1] + rand() * (z.max[1] - z.min[1]), a = rand() * 6;
    for (let q = 0; q < 5; q++) {
      const nx = x + Math.cos(a) * 0.45, nz = zz + Math.sin(a) * 0.45;
      if (!inZone(z, x, zz) || !inZone(z, nx, nz) || overVoid(s, nx, nz)) break;
      lines.push(new THREE.Vector3(x, t.height(x, zz) + 0.07, zz), new THREE.Vector3(nx, t.height(nx, nz) + 0.07, nz));
      (x = nx), (zz = nz), (a += (rand() - 0.5) * 1.3);
    }
  }
  const mat = new THREE.LineBasicMaterial({ color: 0xff8a2a, transparent: true, fog: false });
  const m = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), mat);
  ud(m).live = true;
  g.add(m);
  animate((tt) => (mat.opacity = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(tt * 2.4))));
  return g;
}

/** The tide gauge: an iron post by the lake, marked low, mid and high, a float at the level now and an arrow at the next. */
/** The nearest spot on the bank beside a zone: off the lane and off the void, clear of both for half a unit round it. */
function bankBy(z: Zone, t: Terrain, s: Hole): Vec2 {
  const { cx, cz, w, h } = boxOf(z), r0 = Math.max(w, h) / 2;
  const clear = (x: number, zz: number) => [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([dx, dz]) => !t.onGreen(x + dx, zz + dz) && !overVoid(s, x + dx, zz + dz));
  for (let r = r0 + 0.8; r < r0 + 12; r += 0.5)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, x = cx + Math.cos(a) * r, zz = cz + Math.sin(a) * r;
      if (clear(x, zz)) return [x, zz];
    }
  return [z.max[0] + 1, cz];
}
function gauge(at: Vec2, t: Terrain, now: number, next: number, was = now, t0 = -99) {
  const g = new THREE.Group(), y0 = t.height(at[0], at[1]);
  const post = plate(0.2, 2.6, 0.2, IRON);
  post.position.y = 1.3;
  g.add(post);
  const marks = [0x6fe07a, 0xf1d24a, 0xff5a3a];
  marks.forEach((c, k) => {
    const m = plate(0.5, 0.08, 0.24, c);
    m.position.y = 0.5 + k * 0.8;
    g.add(m);
  });
  const float = solid(new THREE.SphereGeometry(0.2, 10, 8), 0xd8402f);
  float.position.set(0.25, 0.5 + was * 0.8, 0);
  // (riding up or down its post with the tide, not jumping to its mark)
  if (was !== now) {
    ud(float).live = true;
    animate((tt) => void (float.position.y = 0.5 + (was + (now - was) * smoothstep((tt - t0 - 0.2) / 1.6)) * 0.8));
  }
  const arrow = gem(new THREE.ConeGeometry(0.16, 0.36, 4).rotateZ(Math.PI / 2).translate(-0.35, 0.5 + next * 0.8, 0), 0xffd27a);
  g.add(float, arrow);
  const lamp = halo(0.5, marks[next], 0.5);
  lamp.position.set(-0.35, 0.5 + next * 0.8, 0);
  g.add(lamp);
  g.position.set(at[0], y0, at[1]);
  return g;
}

// ------------------------------------------------------------ bats

/** A flock of bats round each roost of the stroke, flying in from where they roosted last stroke, swirling low where the chain has its post (the ball bounces off the swarm); a few stirring high over the next roost. */
function bats(now: readonly Post[], was: readonly Post[] | null, next: readonly Post[], t: Terrain, t0: number) {
  const out = new THREE.Group(), g = new THREE.Group();
  ud(g).live = true;
  out.add(g);
  // their roost's floor: a low bed of rock filling the post's circle (the lane is open there), merged with the stroke's pieces
  for (const p of now) {
    // (a slab sitting on the lane, its underside at the lane: nothing of it crossing the floor)
    const slab = knobbly(new THREE.CylinderGeometry(p.r, p.r * 1.04, 0.07, 12, 1).translate(0, 0.035, 0), seeded("roost" + p.c.join()), 0.02, 3);
    const bed = solid(slab, 0x4f486a);
    bed.position.set(p.c[0], t.height(p.c[0], p.c[1]) + 0.005, p.c[1]);
    out.add(bed);
  }
  const per = 5, n = now.length * per + next.length * 2;
  if (!n) return out;
  // a bat: a fuzzy body, two ears, two scalloped wings (the wings folded and spread by their scale)
  const body = new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.9, 1.2);
  const ears = [-1, 1].map((sd) => new THREE.ConeGeometry(0.05, 0.14, 4).translate(sd * 0.07, 0.17, 0.06));
  const wing = (sd: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(sd * 0.5, 0.12);
    sh.quadraticCurveTo(sd * 0.42, -0.02, sd * 0.36, -0.08);
    sh.quadraticCurveTo(sd * 0.25, 0.02, sd * 0.18, -0.1);
    sh.quadraticCurveTo(sd * 0.1, 0, 0, -0.08);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 0.02, 0.05);
  };
  const geo = mergeGeometries([body, ...ears].map((q) => q.toNonIndexed()).concat([wing(-1).toNonIndexed(), wing(1).toNonIndexed()]).map((q) => (q.deleteAttribute("uv"), q)));
  const mat = once("bat", () => flat(0x5a4a74, { emissive: 0x2a1a3a, emissiveIntensity: 0.4 }));
  const flock = new THREE.InstancedMesh(geo, mat, n);
  const eyes = new THREE.InstancedMesh(mergeGeometries([0.05, -0.05].map((x) => new THREE.SphereGeometry(0.035, 6, 4).translate(x, 0.05, 0.16))), once("bat eyes", () => new THREE.MeshBasicMaterial({ color: 0xffd060, fog: false })), n);
  for (const m of [flock, eyes]) (m.frustumCulled = false), g.add(m);
  const rand = seeded("bats" + now.map((p) => p.c.join()).join());
  const list = [
    ...now.flatMap((p, i) => Array.from({ length: per }, (_, k) => ({ home: p, from: was && was[i] ? was[i] : p, r: p.r * (0.3 + rand() * 0.7), h: 0.5 + rand() * 0.5, ph: rand() * 6, sp: 2 + rand() * 1.5, stir: false, k }))),
    ...next.flatMap((p) => Array.from({ length: 2 }, (_, k) => ({ home: p, from: p, r: 0.8 + rand() * 0.5, h: 3.5 + rand(), ph: rand() * 6, sp: 1.2, stir: true, k }))),
  ];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  animate((tt) => {
    list.forEach((b, i) => {
      // on their way from the last roost, then circling this one, a flap a beat
      const f = smoothstep((tt - t0 - b.k * 0.1) / 1.6);
      const hx = b.from.c[0] + (b.home.c[0] - b.from.c[0]) * f, hz = b.from.c[1] + (b.home.c[1] - b.from.c[1]) * f;
      const a = tt * b.sp + b.ph, y = t.height(hx, hz) + b.h + Math.sin(tt * 3 + b.ph) * 0.12 + (f < 1 ? Math.sin(Math.PI * f) * 2 : 0);
      P.set(hx + Math.cos(a) * b.r, y, hz + Math.sin(a) * b.r);
      E.set(0.2, -a - Math.PI, Math.sin(a) * 0.3);
      const flap = 0.35 + 0.65 * Math.abs(Math.sin(tt * 16 + b.ph));
      M.compose(P, Q.setFromEuler(E), S.set(flap * 2.2, 2.2, 2.2)); // (chunky: read from the Far view)
      flock.setMatrixAt(i, M);
      eyes.setMatrixAt(i, M);
    });
    flock.instanceMatrix.needsUpdate = eyes.instanceMatrix.needsUpdate = true;
  });
  return out;
}
/** A roost on the hole itself (not a pulse): the flock there, still. */
export function batPost(p: Post, t: Terrain, _s: Hole) {
  return bats([p], null, [], t, -99);
}

// ------------------------------------------------------------ the lift's landings

/** A lamp by each landing: green where the cage stands this stroke (get in), red where the shaft is open (you fall);
 *  the arrow under it says where the cage goes next: up to this landing, or away from it. */
function landingLamps(landings: readonly Zone[], now: Extras, next: Extras | null, t: Terrain, s: Hole) {
  const g = new THREE.Group();
  const at = (q: Extras | null, z: Zone) => zonesOf(q, "lift").map(zkey).some((k) => k.split(":").slice(1).join() === zkey(z).split(":").slice(1).join());
  for (const z of landings) {
    const here = at(now, z), coming = next ? at(next, z) : here;
    // (on the bank by it: off the lane, off the void, off the shaft)
    const [x, zz] = bankBy(z, t, s), y0 = t.height(x, zz);
    const post = new THREE.Group();
    const pole = log(0.08, 2.2, IRON_DARK);
    const box = plate(0.5, 0.7, 0.3, 0x2a2440);
    box.position.y = 2.3;
    // (the lamp lit from within, the world's glowing crystal: no halo of its own, a draw less a stroke)
    const lamp = gem(new THREE.SphereGeometry(0.2, 8, 6), here ? 0x6fe07a : 0xff4a3a);
    lamp.position.set(0, 2.35, 0.17);
    post.add(pole, box, lamp);
    // an arrow under it, up or down: where the cage goes
    const arrow = solid(new THREE.ConeGeometry(0.12, 0.25, 3).rotateX(coming ? 0 : Math.PI).translate(0, 2.05, 0.17), 0xf2ead8);
    post.add(arrow);
    post.position.set(x, y0, zz);
    g.add(post);
  }
  return g;
}

/** An open shaft at a landing (a pulse): the lane is cut open there (engine.ts reads a stroke's hazards ahead: Hole.pulseZones), the shaft drawn as the hole's own are, a chain slung across its mouth. */
function openShaft(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group(), pit = zone(z, t, s);
  if (pit) g.add(pit);
  const x0 = z.min[0], x1 = z.max[0], zc = (z.min[1] + z.max[1]) / 2, y = t.height(x0, zc) + 0.7;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, y, zc), new THREE.Vector3((x0 + x1) / 2, y - 0.3, zc), new THREE.Vector3(x1, y, zc));
  g.add(solid(new THREE.TubeGeometry(curve, 16, 0.04, 4), 0xd8b040));
  // on two short posts on the collar, either side of the mouth
  for (const x of [x0, x1]) {
    const p = log(0.07, 0.8, IRON_DARK);
    p.position.set(x, t.height(x, zc) - 0.05, zc);
    g.add(p);
  }
  return g;
}

// ------------------------------------------------------------ the stroke

const MINE = new Set(["vault door", "turntable", "rockfall", "dynamite", "crumble", "lava tide", "bat", "shaft"]);

export function extras(ex: Extras, s: Hole, t: Terrain): { group: THREE.Object3D; skins: Set<string> } | null {
  const g = new THREE.Group();
  ud(g).live = true;
  ud(g).steady = true; // swapped at once: everything here moves on from the last stroke itself
  const t0 = performance.now() / 1000;
  const prev = last.get(s) || null, next = (ex.ahead && ex.ahead[0]) || null, after = (ex.ahead && ex.ahead[1]) || null;
  last.set(s, ex);
  const all = [ex, prev, next, after].filter((q): q is Extras => !!q);

  // the vault doors: every door seen in these strokes, shut or rolled aside
  const doorSlots = new Map<string, PBar>();
  for (const q of all) for (const b of barsOf(q.walls, "vault door")) doorSlots.set(b.key, b);
  const shutIn = (q: Extras | null, k: string) => !!q && barsOf(q.walls, "vault door").some((b) => b.key === k);
  for (const [k, b] of doorSlots) g.add(vaultDoor(b, t, s, shutIn(ex, k), prev ? shutIn(prev, k) : null, [shutIn(next, k), shutIn(after, k)], t0));

  // the turntable
  const tt = all.flatMap((q) => barsOf(q.walls, "turntable"));
  if (tt.length) {
    const uniq = [...new Map(tt.map((b) => [b.key, b])).values()];
    g.add(turntable(uniq, barsOf(ex.walls, "turntable")[0], prev ? barsOf(prev.walls, "turntable")[0] : undefined, next ? barsOf(next.walls, "turntable")[0] : undefined, t, s, t0));
  }

  // the rockfall: down now (fallen this stroke if it was not there), or cracking before it comes
  for (const b of barsOf(ex.walls, "rockfall")) g.add(heap(b, t, !!prev && !barsOf(prev.walls, "rockfall").some((q) => q.key === b.key), t0));
  if (next) for (const b of barsOf(next.walls, "rockfall")) if (!barsOf(ex.walls, "rockfall").some((q) => q.key === b.key)) g.add(cracking(b, t));

  // the dynamite: standing (its fuse lit if it goes next stroke), or blown
  for (const b of barsOf(ex.walls, "dynamite")) g.add(charge(b, t, s, !!next && !barsOf(next.walls, "dynamite").some((q) => q.key === b.key)));
  if (prev) for (const b of barsOf(prev.walls, "dynamite")) if (!barsOf(ex.walls, "dynamite").some((x) => x.key === b.key)) g.add(blown(b, t, s, true, t0));

  // crumbling slabs and rotten planks
  const crumbleNow = zonesOf(ex, "crumble"), crumbleWas = zonesOf(prev, "crumble"), crumbleNext = zonesOf(next, "crumble");
  // (a slab once fallen stays fallen; one there, then not, is a deck of rotten planks that gives way on its strokes)
  const seq = [prev, ex, next, after];
  const comesAndGoes = (z: Zone) => {
    let seen = false;
    for (const q of seq) {
      if (!q) continue;
      const here = zonesOf(q, "crumble").some((w) => zkey(w) === zkey(z));
      if (seen && !here) return true;
      seen ||= here;
    }
    return false;
  };
  const crumbleAll = [...new Map([...crumbleNow, ...crumbleNext, ...crumbleWas, ...zonesOf(after, "crumble")].map((z) => [zkey(z), z])).values()];
  for (const z of crumbleAll) {
    const isNow = crumbleNow.some((w) => zkey(w) === zkey(z)), wasThere = crumbleWas.some((w) => zkey(w) === zkey(z)), isNext = crumbleNext.some((w) => zkey(w) === zkey(z));
    if (comesAndGoes(z)) g.add(planks(z, t, s, isNow, isNow && !!prev && !wasThere, t0));
    else if (isNow) g.add(brokenHole(z, t, s, !!prev && !wasThere, t0));
    else if (isNext) g.add(cracked(z, t, s));
  }

  // the lava tide: in now (risen if it was not), going (sinking if it was and is not), seeping where it comes next
  const tideNow = zonesOf(ex, "lava tide"), tideWas = zonesOf(prev, "lava tide"), tideNext = zonesOf(next, "lava tide");
  for (const z of tideNow) g.add(tide(z, t, s, prev && !tideWas.some((w) => zkey(w) === zkey(z)) ? 1 : 0, t0));
  for (const z of tideWas) if (!tideNow.some((w) => zkey(w) === zkey(z))) g.add(tide(z, t, s, -1, t0));
  for (const z of tideNext) if (!tideNow.some((w) => zkey(w) === zkey(z))) g.add(seep(z, t, s));
  if (tideNow.length || tideNext.length || tideWas.length) {
    const stone = s.zones.find((q) => q.skin === "causeway");
    const level = (n: number) => (n >= 4 ? 2 : n >= 2 ? 1 : 0);
    if (stone) g.add(gauge(bankBy(stone, t, s), t, level(tideNow.length), level(tideNext.length), prev ? level(tideWas.length) : level(tideNow.length), t0));
  }

  // the bats
  const roost = ex.posts.filter((p) => p.skin === "bat");
  if (roost.length || (next && next.posts.some((p) => p.skin === "bat")))
    g.add(bats(roost, prev ? prev.posts.filter((p) => p.skin === "bat") : null, next ? next.posts.filter((p) => p.skin === "bat").filter((p) => !roost.some((r) => r.c.join() === p.c.join())) : [], t, prev ? t0 : -99));

  // the lift's landings, and the open shaft where it is not
  const landings = [...new Map(all.flatMap((q) => [...zonesOf(q, "lift"), ...zonesOf(q, "shaft")]).map((z) => [z.min.join() + ":" + z.max.join(), z])).values()];
  if (landings.length && zonesOf(ex, "lift").length) g.add(landingLamps(landings, ex, next, t, s));
  for (const z of zonesOf(ex, "shaft")) g.add(openShaft(z, t, s));

  // what comes next and is not here: its dashed outline
  if (next) {
    const loops: (readonly Vec2[])[] = [];
    for (const b of next.walls.length ? ["vault door", "rockfall", "boulder"].flatMap((k) => barsOf(next.walls, k)) : [])
      if (!barsOf(ex.walls, b.skin).some((q) => q.key === b.key)) loops.push(corners(b));
    for (const z of next.zones || []) if ((z.skin === "shaft" || z.skin === "lava tide") && !(ex.zones || []).some((w) => zkey(w) === zkey(z))) loops.push(z.poly && z.poly.length > 2 ? z.poly : outline(z, s));
    if (loops.length) {
      // (shown while the player aims, as the timed pieces' are: course.ts ghosts)
      const line = dashed(loops, t), before = state.ghosts;
      line.visible = false;
      ud(line).live = true;
      state.ghosts = (on) => { if (before) before(on); line.visible = on; };
      g.add(line);
    }
  }
  return { group: g, skins: MINE };
}
