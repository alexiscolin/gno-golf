import * as THREE from "three";
import { ISLAND } from "./common";
import type { LitScene } from "./data";
import type { Board, HoleState } from "../types";

/** The screen the camera frames: its size in CSS pixels, and what the HUD covers of it. */
export interface View {
  w: number;
  h: number;
  top: number;
  bottom: number;
  side: number;
}
/** Where the camera is: what it looks at, from how far, the picture's slide
 *  (ox, oy), its tilt (0 overview .. 1 follow), a yaw round the target, and
 *  (the Far view) the share of ORBIT it has room for. */
export interface Rig {
  target: THREE.Vector3;
  dist: number;
  ox: number;
  oy: number;
  tilt?: number;
  yaw?: number;
  orbit?: number;
}

/** The pixel ratio cap: 1.25 on a desktop (sharp on retina, 30% fewer pixels
 *  than 1.5), 1 on a phone or tablet, whose screens are dense already. */
export const maxDpr = () => (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches ? 1 : 1.25);

export function makeRenderer(canvas: HTMLCanvasElement) {
  // Light on the machine: the integrated GPU where there are two (the fans
  // stay off), no stencil buffer (nothing uses it), and a pixel ratio capped
  // where toon shading shows no difference. MSAA stays: the ink outlines need it.
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power", stencil: false });
  r.setPixelRatio(Math.min(devicePixelRatio, maxDpr()));
  return r;
}

export function makeScene(): LitScene {
  const scene = new THREE.Scene() as LitScene;
  const sky = new THREE.HemisphereLight(0xfff3df, 0x9fc4b3, 1.3);
  const sun = new THREE.DirectionalLight(0xfff6e2, 0.7);
  sun.position.set(24, 40, 6);
  scene.add(sky, sun);
  scene.userData.lights = { sky, sun };
  return scene;
}

// ------------------------------------------------------------ time of day
//
// A hole is played at one moment of the day, and keeps it: day, evening or
// night. The light changes here, and the fog's colour (a pale mist by day, a
// rosy haze at dusk, a blue murk at night); the sky behind the canvas is the page's.
const TIMES: Record<string, { sky: readonly [number, number, number]; sun: readonly [number, number, readonly [number, number, number]]; fog: number }> = {
  day:   { sky: [0xfff3df, 0x9fc4b3, 1.3], sun: [0xfff6e2, 0.7, [24, 40, 6]], fog: 0xdfe6e2 },
  dusk:  { sky: [0xffd2b0, 0x6f7fa8, 1.05], sun: [0xff9d62, 0.95, [-20, 14, 10]], fog: 0xd9b3a4 },
  night: { sky: [0x8ea2dc, 0x1f3342, 0.62], sun: [0xc4d4ff, 0.38, [10, 30, -10]], fog: 0x3e5372 },
};

/** Day for most holes, evening or night for some — stable per hole. */
export const timeOf = (id: unknown) => {
  const n = Number((String(id).match(/(\d+)$/) || [])[1]);
  const h = Number.isFinite(n) ? n : [...String(id)].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7);
  return ["day", "day", "dusk", "day", "night", "dusk"][h % 6];
};

export function setLighting(scene: LitScene, time: string) {
  const t = TIMES[time] || TIMES.day, { sky, sun } = scene.userData.lights;
  sky.color.set(t.sky[0]);
  sky.groundColor.set(t.sky[1]);
  sky.intensity = t.sky[2];
  sun.color.set(t.sun[0]);
  sun.intensity = t.sun[1];
  sun.position.set(...t.sun[2]);
  if (scene.fog) scene.fog.color.set(t.fog);
}

/** What the overview frames: the course, with a little of the garden around
 *  it. The island may run off the edges; the green is what the player needs. */
export const courseBox = (board: Board) =>
  new THREE.Box3(new THREE.Vector3(-1.5, -1, -1.5), new THREE.Vector3(board.w + 1.5, 1.5, board.h + 1.5));

/** What the Far view frames: the lane itself (its rails, pieces, tee and
 *  cup), not the whole board, which a narrow or an L-shaped lane fills only
 *  in part, with the same margin. Given the ground's height, its floor and
 *  top follow the relief (a hill, a sunk pond) under it. */
export function laneBox(s: Pick<HoleState, "board" | "walls" | "posts" | "zones" | "start" | "cup">, height?: (x: number, z: number) => number) {
  const b = new THREE.Box3(), p = new THREE.Vector3();
  const add = (x: number, z: number) => b.expandByPoint(p.set(Math.min(Math.max(x, 0), s.board.w), 0, Math.min(Math.max(z, 0), s.board.h)));
  for (const w of s.walls) add(w.a[0], w.a[1]), add(w.b[0], w.b[1]);
  for (const q of s.posts) add(q.c[0] - q.r, q.c[1] - q.r), add(q.c[0] + q.r, q.c[1] + q.r);
  for (const z of s.zones) add(z.min[0], z.min[1]), add(z.max[0], z.max[1]);
  add(s.start[0], s.start[1]), add(s.cup[0], s.cup[1]);
  if (b.isEmpty()) return courseBox(s.board);
  let y0 = 0, y1 = 0;
  // the relief under the lane, sampled every unit (a hole is 60 by 40 at most: a few thousand calls, once per hole or resize)
  if (height)
    for (let x = b.min.x; x <= b.max.x + 0.5; x++)
      for (let z = b.min.z; z <= b.max.z + 0.5; z++) {
        const y = height(Math.min(x, b.max.x), Math.min(z, b.max.z));
        if (Number.isFinite(y)) (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
      }
  b.min.set(b.min.x - 1.5, y0 - 1, b.min.z - 1.5);
  b.max.set(b.max.x + 1.5, y1 + 1.5, b.max.z + 1.5);
  return b;
}

/** Where the island sits in the world. */
export const islandBox = (board: Board) =>
  new THREE.Box3(new THREE.Vector3(-ISLAND.x, -ISLAND.soil, -ISLAND.back),
                 new THREE.Vector3(board.w + ISLAND.x, 4, board.h + ISLAND.front));

/** Portrait screens look down the long axis instead of across it. */
const isPortrait = (w: number, h: number) => h > w * 1.05;

// the two viewing directions, made once: applyRig runs every frame
const LOOK_PORTRAIT = new THREE.Vector3(-0.7, 0.9, 0).normalize(), LOOK_WIDE = new THREE.Vector3(0, 0.72, 0.8).normalize();
// following the gnome the camera sits a few degrees lower (about 36° over
// the ground instead of 42°): closer to the grass, the cup still in view.
// A rig's tilt (0 overview, 1 follow) blends the two, eased like the rest.
const LOOK_PORTRAIT_LOW = new THREE.Vector3(-0.78, 0.8, 0).normalize(), LOOK_WIDE_LOW = new THREE.Vector3(0, 0.6, 0.83).normalize();
const _dir = new THREE.Vector3(), _yawed = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const lookDir = (w: number, h: number, tilt = 0) => {
  const hi = isPortrait(w, h) ? LOOK_PORTRAIT : LOOK_WIDE, lo = isPortrait(w, h) ? LOOK_PORTRAIT_LOW : LOOK_WIDE_LOW;
  return tilt <= 0 ? hi : _dir.copy(hi).lerp(lo, Math.min(1, tilt)).normalize();
};

/** Where the camera is: what it looks at, from how far, and how the picture is
 *  slid so that point lands in the middle of the space the HUD leaves free. */
export function applyRig(camera: THREE.PerspectiveCamera, rig: Rig, view: Pick<View, "w" | "h">) {
  camera.aspect = view.w / view.h;
  const dir = lookDir(view.w, view.h, rig.tilt || 0);
  // a yaw (the Far view's mouse orbit) swings the camera round the target, a few degrees
  camera.position.copy(rig.target).addScaledVector(rig.yaw ? _yawed.copy(dir).applyAxisAngle(UP, rig.yaw) : dir, rig.dist);
  camera.lookAt(rig.target);
  camera.setViewOffset(view.w, view.h, rig.ox, rig.oy, view.w, view.h);
  camera.updateMatrixWorld();
  // the far plane follows the rig: the scene reaches ~220 past the target, and
  // a tight far keeps the depth buffer precise (no shimmer on flat ground)
  const far = Math.max(120, rig.dist + 220);
  if (Math.abs(camera.far - far) > 5) camera.far = far;
  camera.updateProjectionMatrix();
}

// The lens the rig modes draw with (engine/camera.ts: 30° for classic and far).
// The framing is solved through a camera of its own with that lens, never the
// live one: that one may be mid third person (58° and more) when a hole loads
// or the window is resized, and a rig solved through it came out twice too close.
const RIG_FOV = 30;
const _lens = new THREE.PerspectiveCamera(RIG_FOV, 1, 3, 260);

/**
 * The overview: the whole island inside the free part of the screen, whatever
 * its shape. The distance is searched, not guessed — a guess is right for one
 * aspect ratio and cuts the garden off on every other one. `fill` below 1
 * leaves a margin round it; `tilt` lowers the view toward the follow angle.
 */
export function overviewRig(box: THREE.Box3, view: View, { fill = 1, tilt = 0 } = {}): Rig {
  const { w, h, top, bottom, side } = view;
  const target = box.getCenter(new THREE.Vector3());
  const fw = (w - 2 * side) * fill, fh = (h - top - bottom) * fill;
  const rig: Rig = { target, dist: 0, ox: 0, oy: 0, tilt };
  let lo = 5, hi = 480; // no overview is further off than this (a long town hole on a phone: ~250)
  for (let i = 0; i < 32; i++) {
    rig.dist = (lo + hi) / 2;
    const r = frameOf(box, view, rig);
    if (r.x1 - r.x0 <= fw && r.y1 - r.y0 <= fh) hi = rig.dist; else lo = rig.dist;
  }
  rig.dist = hi;
  const r = frameOf(box, view, rig);
  return Object.assign(rig, { ox: (r.x0 + r.x1) / 2 - w / 2, oy: (r.y0 + r.y1) / 2 - (top + (h - top - bottom) / 2) });
}

// where the box's 8 corners land on screen, in CSS pixels, for a rig (its
// slide included), or null when one is behind the lens
const _corner = new THREE.Vector3();
function frameOf(box: THREE.Box3, view: Pick<View, "w" | "h">, rig: Rig) {
  applyRig(_lens, rig, view);
  const r = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, behind: false };
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const q = _corner.set(x, y, z).project(_lens);
        if (q.z >= 1) r.behind = true;
        const px = ((q.x + 1) / 2) * view.w, py = ((1 - q.y) / 2) * view.h;
        r.x0 = Math.min(r.x0, px); r.x1 = Math.max(r.x1, px);
        r.y0 = Math.min(r.y0, py); r.y1 = Math.max(r.y1, py);
      }
  return r;
}

/** The Far view's mouse orbit at its widest: this much yaw, this much tilt either way. */
export const ORBIT = { yaw: (24 * Math.PI) / 180, tilt: 0.35 };
/** The least share of ORBIT the mouse always has (±8° of yaw). */
const FAR_MIN_ORBIT = 0.35;
/** The Far view's pitch: halfway from the overview's to the follow camera's (a 3/4 view). */
const FAR_TILT = 0.5;
// the mouse's reach: the centre, the four corners and the four edges' middles
const LEANS = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * The Far view: the whole hole (`box`, laneBox) inside the free part of the
 * screen, from the mouse orbit's one end to the other, as close as that
 * allows. For a distance, every pose the mouse can lean the camera to is
 * projected (the box's 8 corners through the real lens and pitch); their
 * union must fit the free width with no sideways slide (the live camera
 * slides up or down only) and the free height, which the slide `oy` then
 * centres it in. The distance is the least that fits, with FAR_MIN_ORBIT of
 * the orbit (none on a screen with no mouse); `orbit`, the share of ORBIT
 * the mouse then gets, is as much as still fits at that distance.
 */
export function farRig(box: THREE.Box3, view: View, mouse = typeof matchMedia === "undefined" || matchMedia("(any-pointer: fine)").matches): Rig & { orbit: number; tilt: number } {
  const { w, h, top, bottom, side } = view;
  const rig = { target: box.getCenter(new THREE.Vector3()), dist: 0, ox: 0, oy: 0, tilt: FAR_TILT, orbit: 0 };
  const t: Rig = { ...rig, target: rig.target };
  // the union of the poses' frames at rig.dist with orbit share k, unslid
  const span = (k: number) => {
    const u = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, behind: false };
    t.dist = rig.dist;
    for (const [a, b] of LEANS) {
      t.yaw = a * k * ORBIT.yaw;
      t.tilt = FAR_TILT + b * k * ORBIT.tilt;
      const r = frameOf(box, view, t);
      u.x0 = Math.min(u.x0, r.x0); u.x1 = Math.max(u.x1, r.x1);
      u.y0 = Math.min(u.y0, r.y0); u.y1 = Math.max(u.y1, r.y1);
      u.behind ||= r.behind;
    }
    return u;
  };
  const fits = (k: number) => {
    const u = span(k);
    return !u.behind && u.x0 >= side && u.x1 <= w - side && u.y1 - u.y0 <= h - top - bottom;
  };
  const k0 = mouse ? FAR_MIN_ORBIT : 0;
  let lo = 5, hi = 480;
  for (let i = 0; i < 32; i++) {
    rig.dist = (lo + hi) / 2;
    if (fits(k0)) hi = rig.dist; else lo = rig.dist;
  }
  rig.dist = hi;
  // more orbit where the screen has room for it (a wide hole on a tall screen)
  let a = k0, b = mouse ? 1 : 0;
  if (fits(b)) a = b;
  else for (let i = 0; i < 10; i++) {
    const mid = (a + b) / 2;
    if (fits(mid)) a = mid; else b = mid;
  }
  // the slide centres the orbit's span in the free height (the picture's
  // slide moves every pose alike: the one oy suits them all)
  const u = span(a);
  return Object.assign(rig, { orbit: a, oy: (u.y0 + u.y1) / 2 - (top + (h - top - bottom) / 2) });
}

/** Close on a point — the ball — centred in the free part of the screen. */
// pass `out` (a rig from an earlier call) to reuse it: called every frame,
// it then allocates nothing
export function focusRig(point: THREE.Vector3, overview: Pick<Rig, "dist">, view: View, cup: THREE.Vector3 | null = null, out: Rig | null = null): Rig {
  const T = (v: THREE.Vector3) => (out ? out.target.copy(v) : v.clone());
  const R = (r: Rig) => ((r.tilt = 1), out ? Object.assign(out, { dist: r.dist, ox: r.ox, oy: r.oy, tilt: 1 }) : r);
  // with a cup given, frame the ball and the cup together: the target sits
  // between them, nearer the ball, and the camera backs off as they part —
  // you aim seeing where you aim
  if (cup) {
    const gap = Math.hypot(cup.x - point.x, cup.z - point.z);
    return R({
      // close on the gnome, as before, leaning a little toward the cup so its
      // direction shows; "Whole course" is there to see everything
      target: T(point).lerp(cup, Math.min(0.22, 6 / Math.max(gap, 1))),
      dist: Math.max(overview.dist * 0.5, 18) + Math.min(gap * 0.12, 5),
      ox: 0,
      oy: view.h / 2 - (view.top + (view.h - view.top - view.bottom) / 2),
    });
  }
  return R({
    target: T(point),
    dist: Math.max(overview.dist * 0.5, 18),
    ox: 0,
    oy: view.h / 2 - (view.top + (view.h - view.top - view.bottom) / 2),
  });
}
