import * as THREE from "three";
import { ISLAND } from "./common";
import type { LitScene } from "./data";
import type { Board } from "../types";

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
// night. The light changes here; the sky behind the canvas is the page's.
const TIMES: Record<string, { sky: readonly [number, number, number]; sun: readonly [number, number, readonly [number, number, number]] }> = {
  day:   { sky: [0xfff3df, 0x9fc4b3, 1.3], sun: [0xfff6e2, 0.7, [24, 40, 6]] },
  dusk:  { sky: [0xffd2b0, 0x6f7fa8, 1.05], sun: [0xff9d62, 0.95, [-20, 14, 10]] },
  night: { sky: [0x8ea2dc, 0x1f3342, 0.62], sun: [0xc4d4ff, 0.38, [10, 30, -10]] },
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
}

/** What the overview frames: the course, with a little of the garden around
 *  it. The island may run off the edges; the green is what the player needs. */
export const courseBox = (board: Board) =>
  new THREE.Box3(new THREE.Vector3(-1.5, -1, -1.5), new THREE.Vector3(board.w + 1.5, 1.5, board.h + 1.5));

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

/**
 * The overview: the whole island inside the free part of the screen, whatever
 * its shape. The distance is searched, not guessed — a guess is right for one
 * aspect ratio and cuts the garden off on every other one. `fill` below 1
 * leaves a margin round it; `tilt` lowers the view toward the follow angle.
 */
export function overviewRig(camera: THREE.PerspectiveCamera, box: THREE.Box3, view: View, { fill = 1, tilt = 0 } = {}): Rig {
  const { w, h, top, bottom, side } = view;
  const target = box.getCenter(new THREE.Vector3());
  const fw = (w - 2 * side) * fill, fh = (h - top - bottom) * fill;
  const rig: Rig = { target, dist: 0, ox: 0, oy: 0, tilt };
  let lo = 5, hi = 480; // no overview is further off than this (a long town hole on a phone: ~250)
  for (let i = 0; i < 32; i++) {
    rig.dist = (lo + hi) / 2;
    const r = frameOf(camera, box, view, rig);
    if (r.x1 - r.x0 <= fw && r.y1 - r.y0 <= fh) hi = rig.dist; else lo = rig.dist;
  }
  rig.dist = hi;
  const r = frameOf(camera, box, view, rig);
  return Object.assign(rig, { ox: (r.x0 + r.x1) / 2 - w / 2, oy: (r.y0 + r.y1) / 2 - (top + (h - top - bottom) / 2) });
}

// where the box's corners land on screen, in CSS pixels, for a rig
const _corner = new THREE.Vector3();
function frameOf(camera: THREE.PerspectiveCamera, box: THREE.Box3, view: Pick<View, "w" | "h">, rig: Rig) {
  applyRig(camera, rig, view);
  const r = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const q = _corner.set(x, y, z).project(camera);
        const px = ((q.x + 1) / 2) * view.w, py = ((1 - q.y) / 2) * view.h;
        r.x0 = Math.min(r.x0, px); r.x1 = Math.max(r.x1, px);
        r.y0 = Math.min(r.y0, py); r.y1 = Math.max(r.y1, py);
      }
  return r;
}

/** The Far view's mouse orbit at its widest: this much yaw, this much tilt either way. */
export const ORBIT = { yaw: (6 * Math.PI) / 180, tilt: 0.35 };

/**
 * The Far view: the whole hole with a margin round it, a little lower than
 * the overview (a 3/4 view), and `orbit`, the share of ORBIT the mouse may
 * swing it with the whole box still inside the free part of the screen — the
 * margin is what leaves it the room.
 */
export function farRig(camera: THREE.PerspectiveCamera, box: THREE.Box3, view: View): Rig & { orbit: number; tilt: number } {
  const rig = overviewRig(camera, box, view, { fill: 0.86, tilt: 0.5 });
  const { w, h, top, bottom, side } = view;
  const t: Rig = { ...rig, ox: 0 }; // (the live camera slides the picture up or down, never sideways)
  const fits = (k: number) =>
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, b]) => {
      t.yaw = a * k * ORBIT.yaw;
      t.tilt = (rig.tilt ?? 0) + b * k * ORBIT.tilt;
      const r = frameOf(camera, box, view, t);
      return r.x0 >= side - 0.5 && r.x1 <= w - side + 0.5 && r.y0 >= top - 0.5 && r.y1 <= h - bottom + 0.5;
    });
  let lo = 0, hi = 1;
  if (fits(1)) lo = 1;
  else for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return Object.assign(rig, { orbit: lo, tilt: rig.tilt ?? 0 });
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
