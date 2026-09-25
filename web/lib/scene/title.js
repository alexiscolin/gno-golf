// The title's live backdrop (components/Title.jsx): a real hole of one world
// flown round slowly at golden hour, three gnomes in hero poses up front and
// fireworks in the sky. The hole is drawn by buildHole from the game's own
// pieces and shared materials; its state is baked from the chain once
// (title-holes.json: one hole a world, its landmark in it), so the title needs
// no node and no query gas.
//
// Light on the machine: its own small renderer (like the gnome picker's), at
// most 30 frames a second, and no frame at all while the tab is hidden or the
// window is behind another. The fireworks are one draw, moved by the GPU.
import * as THREE from "three";
import HOLES from "./title-holes.json";
import { loadWorld } from "./worlds.js";
import { buildHole } from "./course.js";
import { makeRenderer, makeScene } from "./camera.js";
import { makeBall, gnomeById } from "./gnome.js";
import { C, flat, inked, rbox, texOf, disposeCourse, setTime } from "./materials.js";

const FRAME_MS = 1000 / 30;
const STEP_MS = 72 / 3.5; // the timed pieces (the mill's sails, the tram) at the game's idle pace (engine: 3.5 substeps a second)

// Where each world's flight starts (radians round the board) and how far out
// it flies: its landmark in view first.
const FLY = {
  garden: { a0: 1.1, r: 1, h: 1 },
  island: { a0: 0.9, r: 1, h: 1 },
  town: { a0: 1.3, r: 0.9, h: 0.9 },
  mountain: { a0: 1.2, r: 1, h: 1.1 },
};
// The cup cards' dioramas: a fixed three-quarter view on the landmark
const CUP = {
  garden: { a: 1.25, r: 0.78, h: 1.15 },
  island: { a: 1.0, r: 0.8, h: 1.1 },
  town: { a: 1.35, r: 0.85, h: 1.1 },
  mountain: { a: 1.25, r: 0.8, h: 1.2 },
};

/** Golden hour: a warm low sun, a pink sky light, violet shadows (the
 *  snow in a brighter alpenglow: under the garden's it greys). */
function golden(scene, world) {
  const { sky, sun } = scene.userData.lights, snow = world === "mountain";
  sky.color.set(snow ? 0xffeadc : 0xffd6b0);
  sky.groundColor.set(snow ? 0x9aa4ee : 0x7d78c8);
  sky.intensity = snow ? 1.5 : 1.25;
  sun.color.set(0xffa865);
  sun.intensity = snow ? 0.85 : 1.05;
  sun.position.set(-26, 18, 22);
}

/** A ring round the board: the flight's camera at angle a. */
function orbit(camera, b, a, { r = 1, h = 1 } = {}, portrait = false, lift = 4) {
  const k = portrait ? 1.35 : 1;
  const rx = (b.w * 0.55 + 30) * r * k, rz = (b.h * 0.55 + 36) * r * k;
  const cx = b.w / 2, cz = b.h / 2, y = (16 + Math.max(b.w, b.h) * 0.22) * h * k;
  camera.position.set(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
  camera.lookAt(cx, lift, cz);
}

// ------------------------------------------------------------- the heroes

function putter() {
  const p = new THREE.Group();
  const shaft = inked(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 8), flat(0xc9d2d0));
  shaft.position.y = -0.7;
  const grip = inked(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8), flat(C.ink));
  grip.position.y = -0.12;
  const head = inked(rbox(0.46, 0.16, 0.18, 0.05), flat(0xe3e8e6));
  head.position.set(-0.16, -1.38, 0);
  p.add(shaft, grip, head);
  return p;
}

function pennant() {
  const p = new THREE.Group();
  const stick = inked(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8), flat(C.woodDark));
  stick.position.y = 0.55;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.7, -0.17);
  s.lineTo(0, -0.36);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(s), flat(C.sun, { side: THREE.DoubleSide }));
  flag.position.set(0.03, 1.08, 0);
  p.add(stick, flag);
  p.userData.flag = flag;
  return p;
}

function golfBall() {
  const g = new THREE.Group();
  // dimples, drawn once on a small canvas
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const x = c.getContext("2d");
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

const gnome = (id) => {
  const m = makeBall(gnomeById(id));
  m.userData.shade.visible = false; // up front they stand on nothing
  return m;
};

/** Three gnomes, each in a pose: a swing, a cheer, a ride. */
function makeHeroes() {
  const swing = new THREE.Group();
  const sg = gnome("classic");
  const club = putter();
  club.position.set(-0.42, -0.02, 0.28); // on his left: toward the middle of the screen
  swing.add(sg, club);
  swing.rotation.y = -0.35;

  const cheer = new THREE.Group();
  const cg = gnome("gardener");
  const flagStick = pennant();
  flagStick.position.set(-0.52, -0.1, 0.1);
  flagStick.rotation.z = 0.3;
  cheer.add(cg, flagStick);
  cheer.rotation.y = 0.35;

  const ride = new THREE.Group();
  const ball = golfBall();
  const rg = gnome("ginger");
  rg.position.y = 0.95;
  ride.add(ball, rg);
  ride.rotation.y = 0.5;

  const all = new THREE.Group();
  all.add(swing, cheer, ride);
  return {
    group: all,
    swing, cheer, ride,
    /** The idle poses at time t (s). */
    pose(t) {
      // the swing: a slow back-swing, a quick stroke through, a hold
      const ph = (t % 3.2) / 3.2;
      const s = ph < 0.55 ? -0.9 * Math.sin((ph / 0.55) * Math.PI * 0.5) : ph < 0.68 ? -0.9 + 2.1 * ((ph - 0.55) / 0.13) : 1.2 - 1.2 * ((ph - 0.68) / 0.32);
      club.rotation.z = s;
      sg.rotation.z = -s * 0.12;
      sg.userData.body.rotation.y = Math.sin(t * 0.8) * 0.15;
      // the cheer: hops with a squash on landing, the pennant waving
      const hop = Math.abs(Math.sin(t * 3.4));
      cg.position.y = hop * 0.42;
      cg.scale.set(1 + (1 - hop) * 0.08, 1 - (1 - hop) * 0.1, 1 + (1 - hop) * 0.08);
      flagStick.position.y = -0.1 + hop * 0.42;
      flagStick.rotation.z = 0.3 + Math.sin(t * 6.8) * 0.28;
      flagStick.userData.flag.rotation.y = Math.sin(t * 9) * 0.5;
      // the ride: the ball rolls on, the gnome bobs and leans back on it
      ball.rotation.x = t * 2.2;
      rg.position.y = 0.95 + Math.abs(Math.sin(t * 4.4)) * 0.1;
      rg.rotation.z = Math.sin(t * 1.3) * 0.1;
      rg.rotation.x = -0.18;
    },
  };
}

/** Where the heroes stand for this aspect: flanking the logo, feet on one
 *  line (over the facts row); along the foot of a phone's screen. */
function placeHeroes(h, cam) {
  const hh = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.position.z, hw = hh * cam.aspect;
  const portrait = cam.aspect < 1;
  const k = portrait ? Math.min(0.62, hw * 0.4) : Math.min(1, hh * 0.36);
  const feet = portrait ? -hh * 0.93 : -hh * 0.6;
  // each pose's lowest point under its origin: the ball, the club head, the body
  h.ride.position.set(-hw * (portrait ? 0.62 : 0.74), feet + 0.45 * k, 0);
  h.swing.position.set(hw * (portrait ? 0.6 : 0.74), feet + 1.45 * k, 0.3);
  h.cheer.position.set(portrait ? hw * 0.02 : -hw * 0.52, feet + 0.5 * k * 0.8 + (portrait ? 0 : hh * 0.06), -1);
  h.cheer.visible = !portrait || hw > 1.6;
  for (const g of [h.ride, h.swing, h.cheer]) g.scale.setScalar(k);
  h.cheer.scale.multiplyScalar(0.8);
}

// ------------------------------------------------------------- the fireworks

const FW_VS = `
  attribute vec3 aDir;
  attribute vec2 aSeed; // burst, speed
  uniform float uT;
  uniform vec2 uArea; // half the view at z = 0
  uniform float uPx;
  varying vec3 vColor;
  varying float vFade;
  vec3 hash3(float n) { return fract(sin(vec3(n, n + 1.7, n + 3.1)) * vec3(43758.5453, 22578.1459, 19642.3490)); }
  void main() {
    float P = 3.4;
    float tt = uT + aSeed.x * 1.13;
    float cyc = floor(tt / P), age = mod(tt, P);
    vec3 h = hash3(aSeed.x * 17.0 + cyc * 3.7);
    // up in the sky, away from the middle where the logo is
    float side = h.x < 0.5 ? -1.0 : 1.0;
    vec3 c = vec3(side * uArea.x * (0.3 + 0.62 * fract(h.x * 2.0)), uArea.y * (0.12 + 0.8 * h.y), -3.0 - h.z * 3.0);
    float k = 1.0 - exp(-age * 2.8);
    vec3 p = c + aDir * aSeed.y * k * (1.1 + h.z * 0.8) - vec3(0.0, 0.22 * age * age, 0.0);
    vec3 pal[5];
    pal[0] = vec3(1.0, 0.36, 0.55); pal[1] = vec3(1.0, 0.8, 0.25); pal[2] = vec3(0.35, 0.9, 1.0);
    pal[3] = vec3(0.7, 0.45, 1.0); pal[4] = vec3(0.45, 1.0, 0.55);
    int ci = int(floor(fract(h.y * 7.0 + h.z) * 5.0));
    vec3 col = pal[0];
    for (int i = 1; i < 5; i++) if (i == ci) col = pal[i];
    vColor = mix(vec3(1.0), col, smoothstep(0.0, 0.35, age));
    vFade = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.9, 2.3, age)) * (0.7 + 0.3 * sin(age * 38.0 + aSeed.y * 60.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPx * (1.0 - 0.45 * smoothstep(0.0, 2.3, age)) / -mv.z;
  }`;
const FW_FS = `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (smoothstep(0.5, 0.0, d) * 0.5 + smoothstep(0.3, 0.05, d)) * vFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }`;

function makeFireworks(bursts = 6, per = 140) {
  const n = bursts * per, dir = new Float32Array(n * 3), seed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    // an even sphere of sparks, a few slower ones inside it
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    dir.set([Math.cos(a) * s, u, Math.sin(a) * s * 0.4], i * 3);
    seed.set([Math.floor(i / per), i % 3 === 0 ? 0.55 : 0.95 + Math.random() * 0.08], i * 2); // two shells, crisp
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: FW_VS, fragmentShader: FW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uArea: { value: new THREE.Vector2(4, 2.5) }, uPx: { value: 60 } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; // placed by the shader
  return pts;
}

// ------------------------------------------------------------- the stage

// the engine's own test (engine.js weakGpu), kept apart: that file is the game loop's
const weakGpu = (renderer) => {
  try {
    const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|mali-[4-7]\d\d|mali-g[57]\d\b|adreno \(tm\) [3-5]\d\d|powervr|intel.*hd graphics [2-5]\d\d/i.test(name);
  } catch {
    return false;
  }
};

async function holeOf(world) {
  const s = HOLES[world] || HOLES.garden;
  try {
    await loadWorld(s.world);
  } catch {} // offline: drawn as the garden
  return { s, course: buildHole(s) };
}

/**
 * The live title: makeTitle(canvas, { world }) -> { resize(), destroy() }.
 * fireworks: false leaves them out (a still, reduced motion).
 */
export async function makeTitle(canvas, { world = "garden", fireworks = true } = {}) {
  const renderer = makeRenderer(canvas);
  // a weak or software GPU gets the still, as the engine's Auto gives it Low
  if (fireworks && weakGpu(renderer)) return renderer.dispose(), renderer.forceContextLoss(), null;
  renderer.autoClear = false;
  renderer.info.autoReset = false; // two scenes a frame: counted together
  renderer.setClearColor(0x000000, 0); // clear: the page paints the sky
  const scene = makeScene();
  golden(scene, world);
  const front = makeScene();
  // the heroes in a whiter light than the hole, so their colours stay their own
  front.userData.lights.sky.color.set(0xfff4e8);
  front.userData.lights.sky.groundColor.set(0xffe2c4);
  front.userData.lights.sky.intensity = 1.35;
  front.userData.lights.sun.color.set(0xffe6c8);
  front.userData.lights.sun.intensity = 0.9;
  front.userData.lights.sun.position.set(-3, 6, 10); // from the front left
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
  const cam2 = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  cam2.position.set(0, 0, 10);
  const heroes = makeHeroes();
  front.add(heroes.group);
  const fw = fireworks ? makeFireworks() : null;
  if (fw) front.add(fw);

  let alive = true, raf = 0, last = 0, blurred = false, portrait = false;
  const { s, course } = await holeOf(world);
  if (!alive) return null;
  scene.add(course);
  const fly = FLY[world] || FLY.garden, t0 = performance.now();

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = cam2.aspect = w / h;
    portrait = w < h;
    camera.fov = portrait ? 55 : 40;
    camera.updateProjectionMatrix();
    cam2.updateProjectionMatrix();
    placeHeroes(heroes, cam2);
    if (fw) {
      const hh = Math.tan(THREE.MathUtils.degToRad(15)) * 13;
      fw.material.uniforms.uArea.value.set(hh * cam2.aspect, hh);
      fw.material.uniforms.uPx.value = 380 * renderer.getPixelRatio() * (h / 900);
    }
  }

  let frames = 0, spent = 0; // frames drawn, and the main thread's time on them (ms)
  function draw(now) {
    const c0 = performance.now();
    renderer.info.reset();
    const t = (now - t0) / 1000;
    setTime(now / 1000);
    course.userData.tick(now / 1000);
    const clock = now / STEP_MS;
    if (course.userData.mill && course.userData.mill.at) course.userData.mill.at(clock);
    for (const p of course.userData.timed || []) p.at(clock);
    orbit(camera, s.board, fly.a0 + t * 0.045, fly, portrait);
    heroes.pose(t);
    if (fw) fw.material.uniforms.uT.value = t;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(front, cam2);
    frames++;
    spent += performance.now() - c0;
  }

  const running = () => alive && !document.hidden && !blurred;
  function frame(now) {
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
      disposeCourse(front);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/**
 * A still of the title or of a cup card's diorama, as a PNG data URL on a
 * clear background (the page paints the sky): what the Low tier, no WebGL
 * and reduced motion show. Dev only: the stills script calls it.
 */
export async function titleStill(kind, world, w, h) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px`;
  document.body.appendChild(canvas);
  try {
    if (kind === "title") {
      const t = await makeTitle(canvas, { world, fireworks: false });
      const url = canvas.toDataURL("image/png"); // right after its first frame
      t.destroy();
      return url;
    }
    const renderer = makeRenderer(canvas);
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    const scene = makeScene();
    golden(scene, world);
    const { s, course } = await holeOf(world);
    scene.add(course);
    setTime(3);
    course.userData.tick(3);
    if (course.userData.mill && course.userData.mill.at) course.userData.mill.at(6);
    for (const p of course.userData.timed || []) p.at(6);
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.5, 600);
    const c = CUP[world] || CUP.garden;
    orbit(camera, s.board, c.a, c, false, -1.5);
    renderer.render(scene, camera);
    const url = canvas.toDataURL("image/png");
    disposeCourse(scene);
    renderer.dispose();
    renderer.forceContextLoss();
    return url;
  } finally {
    canvas.remove();
  }
}
