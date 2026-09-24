import * as THREE from "three";
import { ISLAND } from "./common.js";

/** The pixel ratio cap: 1.25 on a desktop (sharp on retina, 30% fewer pixels
 *  than 1.5), 1 on a phone or tablet, whose screens are dense already. */
export const maxDpr = () => (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches ? 1 : 1.25);

export function makeRenderer(canvas) {
  // Light on the machine: the integrated GPU where there are two (the fans
  // stay off), no stencil buffer (nothing uses it), and a pixel ratio capped
  // where toon shading shows no difference. MSAA stays: the ink outlines need it.
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power", stencil: false });
  r.setPixelRatio(Math.min(devicePixelRatio, maxDpr()));
  return r;
}

export function makeScene() {
  const scene = new THREE.Scene();
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
const TIMES = {
  day:   { sky: [0xfff3df, 0x9fc4b3, 1.3], sun: [0xfff6e2, 0.7, [24, 40, 6]] },
  dusk:  { sky: [0xffd2b0, 0x6f7fa8, 1.05], sun: [0xff9d62, 0.95, [-20, 14, 10]] },
  night: { sky: [0x8ea2dc, 0x1f3342, 0.62], sun: [0xc4d4ff, 0.38, [10, 30, -10]] },
};

/** Day for most holes, evening or night for some — stable per hole. */
export const timeOf = (id) => {
  const n = Number((String(id).match(/(\d+)$/) || [])[1]);
  let h = Number.isFinite(n) ? n : [...String(id)].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7);
  return ["day", "day", "dusk", "day", "night", "dusk"][h % 6];
};

export function setLighting(scene, time) {
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
export const courseBox = (board) =>
  new THREE.Box3(new THREE.Vector3(-1.5, -1, -1.5), new THREE.Vector3(board.w + 1.5, 1.5, board.h + 1.5));

/** Where the island sits in the world. */
export const islandBox = (board) =>
  new THREE.Box3(new THREE.Vector3(-ISLAND.x, -ISLAND.soil, -ISLAND.back),
                 new THREE.Vector3(board.w + ISLAND.x, 4, board.h + ISLAND.front));

/** Portrait screens look down the long axis instead of across it. */
export const isPortrait = (w, h) => h > w * 1.05;

// the two viewing directions, made once: applyRig runs every frame
const LOOK_PORTRAIT = new THREE.Vector3(-0.7, 0.9, 0).normalize(), LOOK_WIDE = new THREE.Vector3(0, 0.72, 0.8).normalize();
const lookDir = (w, h) => (isPortrait(w, h) ? LOOK_PORTRAIT : LOOK_WIDE);

/** Where the camera is: what it looks at, from how far, and how the picture is
 *  slid so that point lands in the middle of the space the HUD leaves free. */
export function applyRig(camera, rig, view) {
  camera.aspect = view.w / view.h;
  camera.position.copy(rig.target).addScaledVector(lookDir(view.w, view.h), rig.dist);
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
 * aspect ratio and cuts the garden off on every other one.
 */
export function overviewRig(camera, box, view) {
  const { w, h, top, bottom, side } = view;
  const target = box.getCenter(new THREE.Vector3());
  const corners = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));

  const bounds = (dist) => {
    applyRig(camera, { target, dist, ox: 0, oy: 0 }, view);
    const r = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    for (const p of corners) {
      const q = p.clone().project(camera);
      const px = ((q.x + 1) / 2) * w, py = ((1 - q.y) / 2) * h;
      r.x0 = Math.min(r.x0, px); r.x1 = Math.max(r.x1, px);
      r.y0 = Math.min(r.y0, py); r.y1 = Math.max(r.y1, py);
    }
    return r;
  };
  let lo = 5, hi = 240; // no overview is further off than this
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2, r = bounds(mid);
    if (r.x1 - r.x0 <= w - 2 * side && r.y1 - r.y0 <= h - top - bottom) hi = mid; else lo = mid;
  }
  const r = bounds(hi);
  return { target, dist: hi, ox: (r.x0 + r.x1) / 2 - w / 2, oy: (r.y0 + r.y1) / 2 - (top + (h - top - bottom) / 2) };
}

/** Close on a point — the ball — centred in the free part of the screen. */
// pass `out` (a rig from an earlier call) to reuse it: called every frame,
// it then allocates nothing
export function focusRig(point, overview, view, cup = null, out = null) {
  const T = (v) => (out ? out.target.copy(v) : v.clone());
  const R = (r) => (out ? Object.assign(out, { dist: r.dist, ox: r.ox, oy: r.oy }) : r);
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

/** Eases one rig toward another; k is the fraction of the gap closed. */
export function easeRig(cur, goal, k) {
  cur.target.lerp(goal.target, k);
  cur.dist += (goal.dist - cur.dist) * k;
  cur.ox += (goal.ox - cur.ox) * k;
  cur.oy += (goal.oy - cur.oy) * k;
}
