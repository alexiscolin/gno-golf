// The title's splash (components/Title.tsx), where its video ends: a real
// hole of one world at golden hour, seen close from the green, three gnomes
// on it round the cup, and a camera that drifts only a little. The hole is
// drawn by buildHole from the game's own pieces and shared materials; its
// state is baked from the chain once (title-holes.json: one hole a world, its
// landmark in it), so the title needs no node and no query gas.
//
// Light on the machine: its own small renderer (like the gnome picker's), at
// most 30 frames a second, and no frame at all while the tab is hidden or the
// window is behind another.
import * as THREE from "three";
import TITLE_HOLES from "./title-holes.json";
import { loadWorld } from "./worlds";
import { buildHole } from "./course";
import { state } from "./state";
import { makeRenderer, makeScene } from "./camera";
import { makeBall, gnomeById } from "./gnome";
import { makeConfetti } from "./fx";
import { BALL_R, smoothstep } from "../terrain";
import { TICKS_PER_S } from "../engine/types";
import { C, flat, inked, texOf, disposeCourse, setTime } from "./materials";
import { ud, type Course, type Gnome, type Hole, type LitScene } from "./data";
import type { Board } from "../types";

// the snapshot is HoleState rows as the chain printed them (weather: null):
// JSON widens their zone kinds to strings, the one thing that needs this cast
const HOLES = TITLE_HOLES as unknown as Record<string, Hole>;

const FRAME_MS = 1000 / 30;

// The cup cards' dioramas: a fixed three-quarter view on the landmark (y: the
// height looked at, the garden's higher for its tall mill, seen from its door side)
export const CUP: Record<string, { a: number; r: number; h: number; y?: number }> = {
  garden: { a: 2.3, r: 0.95, h: 0.85, y: 3 },
  island: { a: 1.0, r: 0.8, h: 1.1 },
  town: { a: 1.35, r: 0.85, h: 1.1 },
  mountain: { a: 1.25, r: 0.8, h: 1.2 },
};

/** Golden hour: a warm low sun, a pink sky light, violet shadows (the
 *  snow in a brighter alpenglow: under the garden's it greys). */
export function golden(scene: LitScene, world: string) {
  const { sky, sun } = scene.userData.lights, snow = world === "mountain";
  sky.color.set(snow ? 0xffeadc : 0xffd6b0);
  sky.groundColor.set(snow ? 0x9aa4ee : 0x7d78c8);
  sky.intensity = snow ? 1.5 : 1.25;
  sun.color.set(0xffa865);
  sun.intensity = snow ? 0.85 : 1.05;
  sun.position.set(-26, 18, 22);
}

/** A ring round the board: the cup card's camera at angle a. */
export function orbit(camera: THREE.PerspectiveCamera, b: Board, a: number, { r = 1, h = 1 } = {}, portrait = false, lift = 4) {
  const k = portrait ? 1.35 : 1;
  const rx = (b.w * 0.55 + 30) * r * k, rz = (b.h * 0.55 + 36) * r * k;
  const cx = b.w / 2, cz = b.h / 2, y = (16 + Math.max(b.w, b.h) * 0.22) * h * k;
  camera.position.set(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
  camera.lookAt(cx, lift, cz);
}

// ------------------------------------------------------------- the gnomes

function golfBall() {
  const g = new THREE.Group();
  // dimples, drawn once on a small canvas
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = "#d9dee8";
  for (let j = 0; j < 8; j++) for (let i = 0; i < 16; i++) x.beginPath(), x.arc(i * 8 + (j % 2) * 4 + 4, j * 8 + 4, 2.2, 0, 7), x.fill();
  g.add(inked(new THREE.SphereGeometry(0.45, 24, 16), flat(0xffffff, { map: texOf(c) })));
  // a painted band, so the roll reads
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 32), flat(C.cap));
  band.rotation.y = Math.PI / 2;
  g.add(band);
  return g;
}

// Per world: how far up the lane the ride starts (clear of the garden's tunnel
// mouths and the island's castle), and the camera: how far off, from how far
// round (th, radians behind the cup > 0; pth upright, from beyond the cup by
// default) and how high (h, times R)
const SPOT: Record<string, { ride: number; R: number; h?: number; th?: number; pth?: number }> = { garden: { ride: 5.5, R: 13 }, island: { ride: 4.2, R: 12, h: 0.7 }, town: { ride: 6, R: 13 }, mountain: { ride: 8, R: 13 } };
export const RIDE_AT = 1.2, RIDE_S = 7; // the ride's start and length (s)

/**
 * The three gnomes on the green, at the game's own scale, round the cup: one
 * standing by it, watching; one beside the flag, hopping; and the Ginger
 * riding a golf ball slowly up the lane to the cup, where one burst of
 * confetti greets him. Nothing in their hands: they have none.
 */
function makeCast(s: Hole, course: Course, world: string) {
  const height = course.userData.height;
  const cup = new THREE.Vector3(s.cup[0], height(s.cup[0], s.cup[1]), s.cup[1]);
  const d = new THREE.Vector3(s.cup[0] - s.start[0], 0, s.cup[1] - s.start[1]).normalize();
  const n = new THREE.Vector3(-d.z, 0, d.x);
  if (n.z < 0) n.negate(); // the camera's side: toward the low sun
  const spot = SPOT[world] || SPOT.town;
  const onGround = (o: THREE.Object3D, p: THREE.Vector3, lift = BALL_R) => o.position.set(p.x, height(p.x, p.z) + lift, p.z);
  const face = (m: Gnome, dir: THREE.Vector3) => (m.userData.body.rotation.y = Math.PI / 2 - Math.atan2(dir.z, dir.x));
  const group = new THREE.Group();

  const aimer = makeBall(gnomeById("classic"));
  const aimAt = cup.clone().addScaledVector(d, -1.9).addScaledVector(n, 1.5);
  onGround(aimer, aimAt);

  const fan = makeBall(gnomeById("gardener"));
  const fanAt = cup.clone().addScaledVector(d, 1.4).addScaledVector(n, 0.3);
  onGround(fan, fanAt);

  const rider = new THREE.Group();
  const ball = golfBall();
  const ginger = makeBall(gnomeById("ginger"));
  ginger.userData.shade.visible = false; // the ball's is enough
  ginger.position.y = 0.95;
  rider.add(ball, ginger);
  const rideFrom = cup.clone().addScaledVector(d, -spot.ride).addScaledVector(n, -0.5);
  const rideTo = cup.clone().addScaledVector(d, -1.2).addScaledVector(n, -0.5);
  const rideLen = rideFrom.distanceTo(rideTo);
  face(ginger, d);
  group.add(aimer, fan, rider);

  let confetti: ReturnType<typeof makeConfetti> | null = null, cheered = false, lastT = 0;
  const blink = [aimer, fan, ginger].map(() => ({ at: 1 + Math.random() * 3, until: 0 }));
  const p = new THREE.Vector3();
  return {
    group,
    cup, d, n, spot,
    /** The cast at time t (s). */
    pose(t: number) {
      const dt = Math.min(Math.max(t - lastT, 0), 0.1);
      lastT = t;
      // the ride: eases in and out, the ball turning by its roll, the gnome upright on it
      const k = smoothstep((t - RIDE_AT) / RIDE_S);
      p.lerpVectors(rideFrom, rideTo, k);
      onGround(rider, p, 0.45);
      ball.rotation.set(0, Math.atan2(d.x, d.z), 0);
      ball.rotateX(k * rideLen / 0.45);
      const moving = k > 0 && k < 1;
      ginger.position.y = 0.95 + (moving ? Math.abs(Math.sin(t * 4.4)) * 0.05 : Math.sin(t * 1.9) * 0.02);
      ginger.userData.body.rotation.z = moving ? Math.sin(t * 1.6) * 0.1 : 0;
      // the arrival: one burst from the cup, the fan's hop of joy
      if (!cheered && k >= 1) {
        cheered = true;
        confetti = makeConfetti([cup.x, cup.z], height(cup.x, cup.z));
        group.add(confetti.group);
      }
      if (confetti && !confetti.step(dt)) (group.remove(confetti.group), disposeCourse(confetti.group), (confetti = null));
      // the fan: breathes, and hops now and then (the game's joy), squashing on landing
      const joy = cheered ? Math.max(0, 1 - (t - RIDE_AT - RIDE_S) / 1.6) : 0;
      const hop = joy > 0 ? Math.abs(Math.sin(t * 5.5)) * 0.7 * joy : (t % 6 < 0.9 ? Math.abs(Math.sin((t % 6) * 3.5)) * 0.35 : 0);
      const fb = fan.userData.body;
      fb.position.y = hop + Math.sin(t * 1.9) * 0.05;
      const sq = hop < 0.05 && (joy > 0 || t % 6 < 1) ? 0.06 : 0;
      fb.scale.set(1 + sq, 1 - sq, 1 + sq).multiplyScalar(BALL_R / 0.55);
      fan.userData.shade.scale.setScalar(1 - hop * 0.8);
      // turned toward the rider on its way (and a little to the camera), then to the camera
      face(fan, joy > 0 || k < 1 ? p.clone().sub(fanAt).normalize().addScaledVector(n, 0.9) : n);
      // the watcher: breathes, leans a little, follows the ride with his eyes, then the cup
      aimer.userData.body.position.y = Math.sin(t * 1.9 + 1) * 0.05;
      aimer.userData.body.rotation.z = Math.sin(t * 0.7) * 0.05;
      face(aimer, (k < 1 ? p : cup).clone().sub(aimAt).normalize().addScaledVector(n, 0.9)); // three-quarters to the camera
      // they blink every few seconds, like the player's gnome
      [aimer, fan, ginger].forEach((m, i) => {
        const b = blink[i];
        if (t > b.at) (b.until = t + 0.13), (b.at = t + 2.2 + Math.random() * 3.2);
        for (const e of m.userData.eyes) e.scale.y = t < b.until ? 0.12 : 1;
      });
    },
  };
}

/** The camera: a slow drift round the three, from the sun's side (landscape),
 *  from behind the one lining up (portrait). It looks at the cup and a lens
 *  shift puts the cup off the middle, where the logo and the button are not. */
function frameCast(camera: THREE.PerspectiveCamera, c: ReturnType<typeof makeCast>, t: number, portrait: boolean) {
  const th = (portrait ? (c.spot.pth ?? -0.9) : (c.spot.th ?? 0.15)) + Math.sin(t * 0.17) * 0.05;
  const R = (portrait ? c.spot.R * 1.05 : c.spot.R) + Math.sin(t * 0.13) * 0.3, H = R * (portrait ? 0.55 : c.spot.h || 0.5) + Math.sin(t * 0.21) * 0.2;
  const dir = c.n.clone().multiplyScalar(Math.cos(th)).addScaledVector(c.d, -Math.sin(th));
  camera.position.copy(c.cup).addScaledVector(dir, R).y += H;
  camera.lookAt(c.cup.x, c.cup.y + 0.5, c.cup.z);
  const [x0, y0] = portrait ? [0.1, -0.74] : [0.52, -0.3]; // upright: under the facts, at the foot
  const a = camera.aspect; // (setViewOffset takes its aspect from these sizes)
  camera.setViewOffset(a, 1, (-x0 * a) / 2, y0 / 2, a, 1);
}

// ------------------------------------------------------------- the stage

// the engine's own test (engine.ts weakGpu), kept apart: that file is the game loop's
const weakGpu = (renderer: THREE.WebGLRenderer) => {
  try {
    const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); // (a GL string, whatever the typings say)
    return /swiftshader|llvmpipe|softpipe|software|mali-[4-7]\d\d|mali-g[57]\d\b|adreno \(tm\) [3-5]\d\d|powervr|intel.*hd graphics [2-5]\d\d/i.test(name);
  } catch {
    return false;
  }
};

export async function holeOf(world: string, given?: Hole) {
  const s = given || HOLES[world] || HOLES.garden;
  try {
    await loadWorld(s.world);
  } catch {} // offline: drawn as the garden
  // (what a hole's splashes read is the played hole's: the title's own build leaves it be)
  const { water, fallAt } = state, course = buildHole(s);
  Object.assign(state, { water, fallAt });
  return { s, course };
}

/**
 * The splash: makeTitle(canvas, { world, held }) -> { resize(), go(), destroy() }.
 * held: its first frame drawn, then nothing until go() (the video plays
 * first). still: one frame at time `at`, for the baked stills.
 */
export async function makeTitle(canvas: HTMLCanvasElement, { world = "garden", held = false, still = false, at = 0 } = {}) {
  const renderer = makeRenderer(canvas);
  // a weak or software GPU gets the still, as the engine's Auto gives it Low
  if (!still && weakGpu(renderer)) return renderer.dispose(), renderer.forceContextLoss(), null;
  renderer.setClearColor(0x000000, 0); // clear: the page paints the sky
  const scene = makeScene();
  golden(scene, world);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);

  let alive = true, raf = 0, last = 0, blurred = false, portrait = false, t0 = performance.now() - at * 1000;
  const { s, course } = await holeOf(world);
  if (!alive) return null;
  scene.add(course);
  const cast = makeCast(s, course, world);
  scene.add(cast.group);
  const flag = course.userData.flag;

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    portrait = w < h;
    camera.fov = portrait ? 50 : 36;
  }

  let frames = 0, spent = 0; // frames drawn, and the main thread's time on them (ms)
  function draw(now: number) {
    const c0 = performance.now();
    const t = (now - t0) / 1000;
    setTime(now / 1000);
    course.userData.tick(now / 1000);
    // the timed pieces on the game's own clock, from the story's start
    const clock = t * TICKS_PER_S;
    if (course.userData.mill && course.userData.mill.at) course.userData.mill.at(clock);
    for (const p of course.userData.timed || []) p.at(clock);
    // the cup's arrow turns and bobs, slower than in play
    if (flag) (flag.rotation.y = t * 0.6), (flag.position.y = ud(flag).baseY! + Math.abs(Math.sin(t * 1.4)) * 0.3);
    cast.pose(t);
    frameCast(camera, cast, t, portrait); // (it updates the projection)
    renderer.render(scene, camera);
    frames++;
    spent += performance.now() - c0;
  }

  const running = () => alive && !held && !document.hidden && !blurred;
  function frame(now: number) {
    raf = 0;
    if (!running()) return; // woken again by focus or visibility
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS - 2) return;
    last = now;
    draw(now);
  }
  const wake = () => { if (running() && !raf) raf = requestAnimationFrame(frame); };
  const onBlur = () => (blurred = true);
  const onFocus = () => ((blurred = false), wake());
  addEventListener("blur", onBlur);
  addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", wake);
  addEventListener("resize", resize);

  resize();
  draw(performance.now()); // the first frame now, before the page shows it
  wake();

  return {
    resize,
    /** Starts a held splash, its story from the top. */
    go() {
      if (!held) return;
      held = false;
      t0 = performance.now();
      wake();
    },
    /** The last frame's draw calls and triangles, the frames drawn so far and their mean main-thread ms (a test hook). */
    info: () => ({ world, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frames, ms: +(spent / Math.max(frames, 1)).toFixed(2) }),
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener("blur", onBlur);
      removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", wake);
      removeEventListener("resize", resize);
      disposeCourse(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export type Title = NonNullable<Awaited<ReturnType<typeof makeTitle>>>;

