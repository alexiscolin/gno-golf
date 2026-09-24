// The loop: aim, ask the chain, replay what it answered.
//
// Nothing here simulates a ball. A shot is resolved by the realm and comes back
// as a list of positions; the only job left is to walk along them. The engine
// owns the canvas and the pointer; it reports what it is doing through
// onChange, and the interface is free to be whatever it likes.

import * as THREE from "three";
import { buzz, sound, ambience } from "./feel.js";
import { makeWeather } from "./scene/weather.js";
import { makeCauses, causeAt } from "./scene/cause.js";
import { behind, chaseState } from "./chase.js";
import { loadWorld } from "./scene/worlds.js";
import { makeChain, shotOf, pullShot } from "./chain.js";
import {
  makeRenderer, makeScene, maxDpr, buildHole, finishHole, makeBall, makeAim, aimAlong, at,
  courseBox, overviewRig, leanRoom, focusRig, applyRig, makeBand, bandTo, gnomeById, makeConfetti, makeSplash, disposeCourse, setTime, buildExtras, setLighting, quality, motion,
} from "./scene.js";
import { BALL_R, inZone } from "./terrain.js";
import { promo } from "./promo.js";

// How much the aim dots give away, by aim mode. Assisted: the chain's whole
// path, as far as the pull is strong (2 + power × 1.6 units). Pro: no line at
// all — the elastic and the gnome turning along it are the direction, like a
// real putter — and the chain is not asked. ("first-contact" is kept for a
// middle mode: up to the first thing the ball meets, maxLen units at most.)
// Rounds of each mode are ranked apart on the chain.
export const PREVIEWS = {
  assisted: { stopAt: "none", maxLen: Infinity },
  pro: { stopAt: "hidden", maxLen: 0 },
};
// in pro, aimAlong is given the power that makes its reach maxLen (and the
// dots' size), the same whatever the pull
const proPower = (p) => Math.min(10, ((p.maxLen - 2) / 16) * 10 + 0.5);

const FOLLOW_CLOSER = 0.7; // the follow camera, nearer the gnome than the rig frames it
const MS_PER_STEP = 72; // one path segment is one substep: a constant slice of time
const MAX_POWER = 10;
const MAX_SHOTS = 12; // the realm's limit for one committed round
// how fast the ball may cross the screen, in board units per second: a long
// substep is stretched to this instead of flashing past the elastic
const SHOW_SPEED = 26;
// the part of the screen the HUD covers, in CSS pixels: the camera frames
// what is left, so the course is centred in what the player can actually see
const HUD = { top: 108, bottom: 136, side: 14 };
const OVERVIEW_MS = 1500; // how long a new hole is shown whole before closing on the ball

export function createGame(canvas, { rpc, web, gnome, world: forceWorld = "", weather: fakeWeather0 = "", aimMode = "assisted", camMode = "classic", gfx = "auto", onChange = () => {}, onHoled = () => {} } = {}) {
  const chain = makeChain({ rpc, web });

  const renderer = makeRenderer(canvas);
  const scene = makeScene();
  // a storm's lightning: the scene lights up, the page flashes, thunder follows
  const causes = makeCauses(scene);
  const weather = makeWeather(scene, {
    camera: () => camera, // made further down
    onFlash() {
      g.flash = (g.flash || 0) + 1;
      setTimeout(() => alive && sound("thunder"), 350 + Math.random() * 900);
      publish();
    },
  });
  // ?weather= fakes a forecast, for screenshots
  let fakeWeather = fakeWeather0;
  const faked = () => fakeWeather && [
    fakeWeather.includes("wind") && { skin: "wind", vec: [0.05, -0.03] },
    fakeWeather.includes("rain") && { skin: "rain", vec: [0, 0] },
    fakeWeather.includes("fog") && { skin: "fog", vec: [0, 0] },
    fakeWeather.includes("storm") && { skin: "storm", vec: [0, 0] },
    fakeWeather.includes("snow") && { skin: "snow", vec: [0, 0] },
  ].filter(Boolean);
  // near 3, far 260: the whole of any cup's scenery (measured, 210 at most on the
  // island overview, and the lean) with three times the depth precision of
  // 1..400 — what kept far-off faces from flickering into each other
  const camera = new THREE.PerspectiveCamera(30, 1, 3, 260);
  let ball = makeBall(gnomeById(gnome));
  const aim = makeAim();
  const band = makeBand();
  scene.add(ball, aim, band);
  let confetti = null;
  // a burst kept hidden, so its shader compiles with the hole's (warm), not on the winning putt
  const confettiWarm = makeConfetti([0, 0]);
  confettiWarm.group.visible = false;
  scene.add(confettiWarm.group);
  let blinkAt = 0, blinkUntil = 0;
  // small moods of the gnome: a hop of joy when he holes out, a head shake
  // when he comes out of the water. Cosmetic, timed on the page clock.
  const mood = {
    joyUntil: 0, shakeUntil: 0,
    joy(now) { this.joyUntil = now + 1400; },
    shake(now) { this.shakeUntil = now + 900; },
    hop(now) { return now < this.joyUntil ? Math.abs(Math.sin((this.joyUntil - now) / 110)) * 0.7 : 0; },
    tick(now) {
      const body = ball.userData.body;
      if (now < this.shakeUntil) body.rotation.z = Math.sin(now / 45) * 0.35 * ((this.shakeUntil - now) / 900);
      else if (body.rotation.z && !g.flying) body.rotation.z *= 0.8;
    },
  };
  let holedIn = 0, joyIn = 0; // the banner's delay after a hole, so the confetti can fly; the hop's
  let righting = null; // the gnome getting back on his feet after a roll

  const g = {
    list: [], id: null, s: null, course: null,
    ball: { x: 0, y: 0 }, strokes: 0, flying: false,
    facing: Math.PI / 2, power: 0, aiming: false, holed: false, error: null,
    // the camera: "overview" frames the island, "ball" follows the gnome
    view: "overview", rig: null, over: null, started: false,
  };
  let closeIn = 0;

  // what the HUD was last told of the aim: a frame that sees it out of date
  // for 300 ms tells it again (a missed update must not leave the power bar gone)
  const told = { aiming: false, bar: -1, at: 0 };
  // The interface is told only what changed: the last snapshot is kept, and a
  // publish that changes nothing tells nothing. During a replay, a change of
  // the fast-moving fields alone (HOT) is told 10 times a second at most.
  // The world's hole list and counts are worked out once per list and world.
  const HOT = new Set(["power", "cause", "flash"]), HOT_MS = 100, NONE = [];
  let told_ = null, toldAt = 0, toldLater = 0;
  let wake = 0; // the last input or change: a still scene under reduced motion draws for a second after it
  const lists = { list: null, world: null, holes: [], worlds: {} };
  const perList = () => {
    if (lists.list !== g.list || lists.world !== g.world) {
      lists.list = g.list;
      lists.world = g.world;
      lists.holes = g.list ? inWorld() : [];
      lists.worlds = g.list ? g.list.reduce((m, h) => ((m[worldOf(h)] = (m[worldOf(h)] || 0) + 1), m), {}) : {};
    }
    return lists;
  };
  function publish() {
    if (!alive) return false;
    told.aiming = !!g.aiming;
    told.bar = Math.round((g.power || 0) * 40);
    const snap = snapshot();
    let changed = !told_, hotOnly = !!told_;
    if (told_) for (const k in snap) if (snap[k] !== told_[k]) (changed = true), HOT.has(k) || (hotOnly = false);
    if (!changed) return true;
    clearTimeout(toldLater);
    const now = performance.now();
    if (hotOnly && g.flying && now - toldAt < HOT_MS) {
      toldLater = setTimeout(publish, HOT_MS - (now - toldAt));
      return true;
    }
    told_ = snap;
    toldAt = wake = now;
    onChange(snap);
    return true;
  }
  const snapshot = () => ({
      holes: perList().holes,
      allHoles: g.list || NONE, // every cup's, for the cup totals and the grand slam
      world: g.world,
      linked: !!g.linked, // the page's link named a hole that exists
      ready: !!g.course && warming !== loads, // the hole is built and its shaders ready: the curtain may open
      // this hole's place in its cup, for the address bar and shared links
      place: g.s ? Math.max(1, perList().holes.findIndex((h) => h.id === g.id) + 1) : 0,
      look: (g.s && g.s.world) || g.world || "garden", // the world this hole is dressed as
      // how many holes each world has on this chain, for the world screen
      worlds: perList().worlds,
      id: g.id,
      name: g.s ? g.s.name : "",
      // a hole's id is its realm's path: the code a player can read
      source: g.s ? chain.sourceURL(g.id) : "#",
      official: !g.s || g.s.official !== false, // one of the course's holes (a community hole is not)
      community: g.community || NONE, // everyone else's holes, playable outside the cups
      strokes: g.strokes,
      timed: !!(g.s && g.s.timed),
      time: g.course ? g.course.userData.time : "day",
      // what a shot is tested against, for the gas estimate before signing
      // (the realm's own model: walls cost most, then every other piece per
      // path point): the walls, everything else, and each stroke's path length
      walls: g.s ? g.s.walls.length : 0,
      others: g.s ? g.s.posts.length + g.s.zones.length + ((g.forecast && g.forecast.zones) || []).length + (g.s.timed ? 8 : 0) : 0,
      pts: g.pts || NONE,
      shots: g.shots || NONE,
      flying: g.flying,
      aiming: g.aiming,
      power: g.power,
      holed: g.holed,
      error: g.error,
      weather: g.weather || null, // { wind: [x, y] | null, rain, fog, storm } for the HUD
      flash: g.flash || 0,
      mode, // the aim mode set now
      cam: g.cam,
      roundMode: g.roundMode || null, // the mode this round is played in, from its first stroke
      period: g.period == null ? null : g.period, // the round's weather quarter hour: what a record is played in
      cause: g.cause || null, // a word on why the ball speeds up or drifts, once a shot
      note: g.note || null, // a word on how the shot went
      errorKind: g.error ? g.errorKind : null,
      view: g.view,
      gfx: gfxMode, // the graphics setting, and what it gives on this device
      tier,
    });

  // ------------------------------------------------------------- rendering

  let alive = true;
  // Graphics: "high" is the game as designed; "low" draws fewer pixels (a
  // pixel ratio of 1, 0.8 on a phone), leaves the ink off distant decor and
  // thins the weather. "auto" picks low for a weak or software GPU, and for a
  // device whose frames were slow (the probe below: remembered for next time).
  let gfxMode = ["high", "low"].includes(gfx) ? gfx : "auto", tier = "high";
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const weakGpu = (() => {
    try {
      const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info");
      const name = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      return /swiftshader|llvmpipe|softpipe|software|mali-[4-7]\d\d|mali-g[57]\d\b|adreno \(tm\) [3-5]\d\d|powervr|intel.*hd graphics [2-5]\d\d/i.test(name);
    } catch {
      return false;
    }
  })();
  const SLOW_KEY = "gnogolf.gfx.auto";
  const wasSlow = () => { try { return localStorage.getItem(SLOW_KEY) === "low"; } catch { return false; } };
  // A slow GPU (seen on some Safari and Firefox setups) gets a lighter canvas:
  // the first 2 s of drawing are timed, and a median frame over 20 ms turns
  // Auto to Low, once (and for the next visits).
  let dprCap = Infinity;
  function setTier() {
    const was = tier;
    tier = gfxMode === "auto" ? (weakGpu || wasSlow() ? "low" : "high") : gfxMode;
    quality.low = tier === "low"; // outlines: from the next hole built
    weather.thin(quality.low);
    dprCap = quality.low ? (coarse ? 0.8 : 1) : Infinity;
    resize();
    return was !== tier;
  }
  // only frames drawn back to back count (an idle scene is drawn at 20 fps on purpose)
  const probe = { t0: 0, prev: 0, gaps: [] };
  function probeFrame(now, busy) {
    if (tier === "low" || probe.done) return;
    if (!busy) return void (probe.prev = 0);
    if (!probe.t0) probe.t0 = now;
    if (probe.prev) probe.gaps.push(now - probe.prev);
    probe.prev = now;
    if (now - probe.t0 < 2000 && probe.gaps.length < 90) return;
    probe.done = true;
    const d = probe.gaps.sort((a, b) => a - b);
    if (d.length > 10 && d[d.length >> 1] > 20 && gfxMode === "auto") {
      try { localStorage.setItem(SLOW_KEY, "low"); } catch {}
      console.info("gnogolf: slow frames, graphics set to low");
      setTier();
      publish();
    }
  }

  const sizeNow = new THREE.Vector2();
  let dprChanged = false;
  function resize() {
    // the canvas is a full-screen backdrop by design; sizing it from the window
    // rather than from layout keeps it right whatever the CSS pipeline does
    const w = window.innerWidth;
    const h = window.innerHeight;
    // the window may have moved to another screen, or been zoomed: the same
    // cap as when the renderer was made, on the ratio of now
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr(), dprCap);
    if (renderer.getPixelRatio() !== dpr) (renderer.setPixelRatio(dpr), (dprChanged = true));
    if (!(w > 0 && h > 0)) return; // a hidden or collapsed window: nothing to size
    // resizing the drawing buffer clears it: only when the size really changed,
    // never on a hole load or a weather change that leaves it as it is
    const sz = renderer.getSize(sizeNow);
    if (sz.x !== w || sz.y !== h || dprChanged) renderer.setSize(w, h);
    dprChanged = false;
    if (!g.s) return;
    g.over = overviewRig(camera, courseBox(g.s.board), screen());
    // the mouse lean of the whole-course view, as far as the whole hole stays in frame
    g.over.lean = leanRoom(camera, courseBox(g.s.board), screen(), g.over, g.s.board.w * 0.22 + 3);
    if (!g.rig) g.rig = { ...g.over, target: g.over.target.clone() };
  }

  const view = { ...HUD, w: 0, h: 0 };
  const screen = () => ((view.w = window.innerWidth), (view.h = window.innerHeight), view);

  const cupAt = new THREE.Vector3();
  // the camera's goal, filled in place every frame instead of made anew
  const focus = { target: new THREE.Vector3(), dist: 0, ox: 0, oy: 0 };
  // In the whole-course view the mouse leans the camera: over to the side it
  // is on, a little further or nearer, to look past the ends of the island.
  // A pointer that is not a mouse (a finger) leaves it still.
  const lean = { x: 0, y: 0 };
  const onHover = (ev) => {
    if (ev.pointerType !== "mouse" || dragging) return;
    lean.x = Math.max(-1, Math.min(1, (ev.clientX / window.innerWidth - 0.5) * 2));
    lean.y = Math.max(-1, Math.min(1, (ev.clientY / window.innerHeight - 0.5) * 2));
  };
  window.addEventListener("pointermove", onHover);
  const leant = { target: new THREE.Vector3(), dist: 0, ox: 0, oy: 0 };
  function goal() {
    if (g.view !== "ball") {
      if (!g.over || !g.s) return g.over;
      const span = g.over.lean == null ? g.s.board.w * 0.22 + 3 : g.over.lean;
      leant.target.copy(g.over.target);
      leant.target.x += lean.x * span;
      leant.target.z += lean.y * span * 0.25;
      leant.dist = g.over.dist;
      leant.ox = g.over.ox;
      leant.oy = g.over.oy;
      return leant;
    }
    // in flight, follow the ball; at rest, keep the cup in the picture too
    if (g.flying || !g.s) {
      const r = focusRig(ball.position, g.over, screen(), null, focus);
      r.dist *= FOLLOW_CLOSER;
      return r;
    }
    cupAt.set(g.s.cup[0], ball.position.y, g.s.cup[1]);
    // following the gnome: 30 % closer than the rig's own framing, the cup
    // still leaned toward; tall decor in the way is faded by the canopy
    const r = focusRig(ball.position, g.over, screen(), cupAt, focus);
    r.dist *= FOLLOW_CLOSER;
    return r;
  }

  // ------------------------------------------------------------ the camera
  //
  // One controller. A MODE says where the camera wants to be — classic (the
  // rig on the gnome), far (the whole hole, high and wide), third person (low
  // behind the gnome) — for the STATE the game is in: at rest, aiming, the
  // replay, a tube, the hole won. Each frame the mode gives a target pose
  // (position, look-at point, lens, view offset) and one smoother brings the
  // real camera to it: critically damped springs, so a mode change, a state
  // change or a new hole always eases from the pose the camera actually has
  // (about half a second), never from a stale one and never with overshoot.
  g.cam = ["classic", "far", "third"].includes(camMode) ? camMode : "classic";
  const home = () => (g.cam === "far" ? "overview" : "ball");
  // holed: from when the winning ball is near the cup (not from the stroke's start: it has to roll there first)
  const nearCup = () => g.s && Math.hypot(ball.position.x - g.s.cup[0], ball.position.z - g.s.cup[1]) < 2.5;
  const camState = () => (g.holed || (g.done && nearCup()) ? "holed" : g.inTube ? "tube" : g.flying ? "replay" : dragging || g.aiming ? "aiming" : "rest");
  // the target pose, and the springs' own state (position, look-at, lens, offset)
  const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30, oy: 0, near: 3, far: 260 };
  const sp = { pos: new THREE.Vector3(), vp: new THREE.Vector3(), look: new THREE.Vector3(), vl: new THREE.Vector3(), fov: 30, vf: 0, oy: 0, vo: 0, live: false };
  const rigCam = new THREE.PerspectiveCamera(30, 1, 3, 260); // where the rig would put the camera
  const _d = new THREE.Vector3();
  // x'' = ω²(x* − x) − 2ωx': critically damped, settled in ~4.7/ω seconds
  function springV(x, v, target, w, dt) {
    _d.subVectors(target, x).multiplyScalar(w * w).addScaledVector(v, -2 * w);
    v.addScaledVector(_d, dt);
    x.addScaledVector(v, dt);
  }
  const _sn = { x: 0, v: 0 }; // springN's answer, reused: it runs twice a frame
  function springN(x, v, target, w, dt) {
    const a = w * w * (target - x) - 2 * w * v;
    v += a * dt;
    return ((_sn.x = x + v * dt), (_sn.v = v), _sn);
  }
  let lastMode = null;
  // the third-person follow's own state, reset whenever the mode or the hole changes
  const chase = chaseState(), cdir = new THREE.Vector3(1, 0, 0), prevB = new THREE.Vector3(), vel = new THREE.Vector3(), inst = new THREE.Vector3();
  let yaw = 0, wide = 0, hold = 0, rise = 0, swing = 0, swingTo = 0, swingTick = 0, pen = 0, fresh = true, urgent = false;
  const resetFollow = () => ((fresh = true), (wide = hold = rise = swing = 0), vel.set(0, 0, 0));
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const ndcB = new THREE.Vector3(), ndcTop = new THREE.Vector3(), ndcBot = new THREE.Vector3(), headAt = new THREE.Vector3(), camLog = [];
  let sightOk = true, sightTick = 0, clearTick = 0;
  const lensWho = {};
  const rawPos = new THREE.Vector3(), push = new THREE.Vector3();
  // where the ball is when the course hides it on purpose (a tube, a tunnel): a ring over everything
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false })
  );
  marker.renderOrder = 30;
  marker.visible = false;
  scene.add(marker);

  // Where the course goes next from a point: a distance field over the green
  // cells, from the cup (made once per hole), walked downhill a few cells —
  // so on a lane that doubles back the camera faces the next stretch, not
  // the cup across the rough.
  let field = null;
  function courseField() {
    const t = g.course && g.course.userData.terrain;
    if (!t || !g.s) return null;
    if (field && field.id === g.id) return field;
    const { nx, nz, idx, green } = t, CELLS = 0.5;
    const dist = new Float32Array(nx * nz).fill(Infinity), q = new Int32Array(nx * nz);
    const ci = Math.floor(g.s.cup[0] / CELLS), cj = Math.floor(g.s.cup[1] / CELLS);
    let head = 0, tail = 0;
    if (ci >= 0 && cj >= 0 && ci < nx && cj < nz) (dist[idx(ci, cj)] = 0), (q[tail++] = idx(ci, cj));
    while (head < tail) {
      const k = q[head++], i = k % nx, j = (k / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const n = idx(a, b);
        if (!green[n] || dist[n] !== Infinity) continue;
        dist[n] = dist[k] + 1;
        q[tail++] = n;
      }
    }
    return (field = { id: g.id, dist, nx, nz, idx, CELLS });
  }
  /** The heading from (x, z) towards where the lane leads, or null. */
  function aheadHeading(x, z) {
    const f = courseField();
    if (!f) return null;
    let i = Math.floor(x / f.CELLS), j = Math.floor(z / f.CELLS);
    if (i < 0 || j < 0 || i >= f.nx || j >= f.nz || f.dist[f.idx(i, j)] === Infinity) return null;
    // ~5 units along the lane, cell by cell towards the cup
    for (let n = 0; n < 10; n++) {
      let best = f.dist[f.idx(i, j)], bi = i, bj = j;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= f.nx || b >= f.nz) continue;
          const d = f.dist[f.idx(a, b)];
          if (d < best) (best = d), (bi = a), (bj = b);
        }
      if (bi === i && bj === j) break;
      (i = bi), (j = bj);
    }
    const tx = (i + 0.5) * f.CELLS, tz = (j + 0.5) * f.CELLS;
    return Math.hypot(tx - x, tz - z) > 0.5 ? Math.atan2(tz - z, tx - x) : null;
  }

  /** Third person's target, per state: 7 behind, 3 up, looking along the aim, the ball's run, or at the cup. */
  const cupPt = new THREE.Vector3();
  function thirdTarget(dt, state) {
    // holed: framed on the cup, up and back a little — the ball sinking into
    // it is not followed down (that was a close-up of the hat)
    const B = state === "holed" && g.s ? cupPt.set(g.s.cup[0], BALL_R + ground(g.s.cup[0], g.s.cup[1]), g.s.cup[1]) : ball.position;
    let target = yaw, turning = false;
    const pulling = state === "aiming";
    flatFloor = state === "rest" || state === "aiming" ? REST_FLAT : MIN_FLAT;
    if (pulling) target = shot.power > 0 ? shot.angle : yaw; // trailing the aim (measured from the pull's start heading)
    else if (state === "replay" && dt > 0) {
      inst.subVectors(B, prevB).setY(0).divideScalar(dt);
      // a step that turns hard against the averaged run is a bounce or a sharp curve: hold the heading
      if (inst.length() > 0.5 && vel.lengthSq() > 0.25 && inst.angleTo(vel) > Math.PI / 4) hold = 0.6;
      vel.lerp(inst, 1 - Math.exp(-dt / 0.6));
      hold = Math.max(0, hold - dt);
      turning = hold > 0;
      if (!turning && vel.length() > 1.5) target = Math.atan2(vel.z, vel.x);
    } else if (state === "rest" && g.s) {
      // where the lane leads next from here (an S or a spiral turns the camera with it), else the cup
      const a = aheadHeading(B.x, B.z);
      target = a != null ? a : Math.atan2(g.s.cup[1] - B.z, g.s.cup[0] - B.x);
    }
    // a jump, a tunnel exit: the ball is elsewhere at once, and so is the camera
    const teleport = !fresh && B.distanceTo(prevB) > 2.5;
    if (fresh || teleport) (yaw = target), vel.set(0, 0, 0), (rise = 0);
    prevB.copy(B);
    const d = angDiff(target, yaw);
    // coming back at the camera: rise and back off rather than spin round
    const reversing = state === "replay" && Math.abs(d) > (2 * Math.PI) / 3;
    if (!reversing) {
      const step = pulling ? d * (1 - Math.exp(-dt / 0.35)) : d; // aiming: a 0.35 s trail
      const cap = dt * (pulling ? (2 * Math.PI) / 3 : Math.PI / 2); // at most 120°/s aiming, 90°/s rolling
      yaw += Math.max(-cap, Math.min(cap, step));
    }
    const widen = turning || reversing || state === "holed" || (pulling && Math.abs(d) > Math.PI / 2);
    wide += ((widen ? 1 : 0) - wide) * (1 - Math.exp(-dt * (widen ? 5 : 1.5)));
    // behind along the heading — swung round a little if a wall right behind blocks the view
    const up = (state === "holed" ? 4.2 : 3) + wide * 2.5 + rise;
    if (fresh || ++swingTick % 10 === 0) swingTo = clearHeading(B, 7 + wide * 4, up);
    swing += (swingTo - swing) * (1 - Math.exp(-dt * 3));
    const back = 7 + wide * 4 - pen;
    cdir.set(Math.cos(yaw + swing), 0, Math.sin(yaw + swing));
    behind(chase, B, cdir, { back, up, ahead: 0, lookUp: 0 });
    // the collision pass (walls, posts, ground under the line) three times in
    // four frames' worth of time is plenty: between passes its push is reused
    if (fresh || ++clearTick % 3 === 0) {
      rawPos.copy(chase.pos);
      keepClear(chase.pos, B);
      push.subVectors(chase.pos, rawPos);
    } else chase.pos.add(push);
    // the gnome in the lower third: look a little past it, less the steeper the view
    const hz = Math.hypot(chase.pos.x - B.x, chase.pos.z - B.z), hy = chase.pos.y - B.y;
    chase.look.copy(B).addScaledVector(cdir, Math.max(0, 1.8 - Math.max(0, hy - hz * 0.5) * 0.4));
    want.pos.copy(chase.pos);
    want.look.copy(chase.look);
    want.fov = TP_FOV;
    want.oy = 0;
    want.near = 0.5;
    want.far = 80; // close in: the course and its near scenery, not the far hills (fewer draws, finer depth)
    fresh = false;
    return teleport; // a teleport jumps; a mode switch eases from the actual pose
  }

  /** The rig modes' target: where applyRig would put the camera for the rig's goal. */
  function rigTarget(dt) {
    const to = goal();
    if (!to) return false;
    const v = screen();
    // Classic keeps one side for the whole hole: it pans and trucks, never turns
    applyRig(rigCam, to, v);
    want.pos.copy(rigCam.position);
    want.look.copy(to.target);
    want.fov = 30;
    want.oy = to.oy || 0;
    want.near = 3;
    want.far = rigCam.far;
    // kept for what reads the rig (the fog's distance, the far plane)
    if (!g.rig) g.rig = { ...to, target: to.target.clone() };
    g.rig.target.copy(to.target);
    g.rig.dist = to.dist;
    g.rig.ox = to.ox;
    g.rig.oy = to.oy;
    return false;
  }

  function updateCamera(dt) {
    if (!g.s || !g.over) return;
    const mode = g.cam === "third" && g.view === "ball" ? "third" : "rig";
    const state = camState();
    if (mode !== lastMode) resetFollow();
    lastMode = mode;
    const snap = mode === "third" ? thirdTarget(dt, state) : rigTarget(dt);
    const snapped = snap || !sp.live;
    // faster in flight, a touch faster still when the ball would leave the frame
    const w = urgent ? 16 : state === "replay" ? 11 : 9;
    if (!sp.live || snap) {
      sp.pos.copy(want.pos), sp.look.copy(want.look), (sp.fov = want.fov), (sp.oy = want.oy), sp.vp.set(0, 0, 0), sp.vl.set(0, 0, 0), (sp.vf = sp.vo = 0), (sp.live = true);
    } else {
      springV(sp.pos, sp.vp, want.pos, w, dt);
      springV(sp.look, sp.vl, want.look, urgent ? 18 : w, dt);
      ({ x: sp.fov, v: sp.vf } = springN(sp.fov, sp.vf, want.fov, 9, dt));
      ({ x: sp.oy, v: sp.vo } = springN(sp.oy, sp.vo, want.oy, 9, dt));
    }
    // a hard floor on the real pose too (the spring lags a ball rolling back
    // at the camera): never nearer than MIN_FLAT across the ground in third person
    if (mode === "third") {
      const B0 = ball.position, fx = sp.pos.x - B0.x, fz = sp.pos.z - B0.z, fl = Math.hypot(fx, fz);
      if (fl < MIN_FLAT - 0.3) {
        const k = (MIN_FLAT - 0.3) / Math.max(fl, 1e-3);
        if (fl > 1e-3) (sp.pos.x = B0.x + fx * k), (sp.pos.z = B0.z + fz * k);
        else (sp.pos.x = B0.x - cdir.x * MIN_FLAT), (sp.pos.z = B0.z - cdir.z * MIN_FLAT);
      }
      sp.pos.y = Math.min(sp.pos.y, B0.y + Math.tan(MAX_PITCH + 0.1) * Math.max(Math.hypot(sp.pos.x - B0.x, sp.pos.z - B0.z), MIN_D));
    }
    const v = screen();
    camera.aspect = v.w / v.h;
    camera.position.copy(sp.pos);
    camera.lookAt(sp.look);
    if (Math.abs(sp.oy) > 0.5) camera.setViewOffset(v.w, v.h, 0, sp.oy, v.w, v.h);
    else camera.clearViewOffset();
    camera.fov = sp.fov;
    camera.near = Math.min(want.near, sp.pos.distanceTo(ball.position) * 0.5);
    camera.far = want.far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // the ball on screen and in sight: in the middle 70 %, nothing between it
    // and the camera (board-space test, no ray); out of frame → catch up fast;
    // hidden by a wall → rise a little; hidden on purpose (a tube) → a ring
    const B = ball.position;
    ndcB.copy(B).project(camera);
    const inFrame = ndcB.z < 1 && Math.abs(ndcB.x) < 0.7 && Math.abs(ndcB.y) < 0.7;
    // in sight: the gnome's head over any kerb between (the hat is what the player looks for)
    if (!inFrame) sightOk = false;
    else if (++sightTick % 2 === 0 || !sightOk) sightOk = !occluded(camera.position, headAt.copy(B).setY(B.y + 0.7));
    const seen = inFrame && sightOk;
    // (decor between is the canopy's to fade; a ray through the whole baked course each frame cost 3× the frame)
    const blocked = inFrame && !seen;
    // out of frame or behind a wall: the springs catch up fast until it is back in sight
    urgent = mode === "third" && (!inFrame || blocked);
    rise = blocked ? Math.min(3, rise + dt * 12) : Math.max(0, rise - dt * 6);
    // down a cliff, into water, in a tube: hidden on purpose, and marked
    const under = g.inTube || B.y < ground(B.x, B.z) - 0.3;
    marker.visible = !seen && (under || (mode === "third" && rise >= 3));
    if (marker.visible) (marker.position.copy(B), marker.quaternion.copy(camera.quaternion));
    settled = sp.vp.lengthSq() < 1e-4 && sp.vl.lengthSq() < 1e-4 && Math.abs(sp.vf) < 1e-3;
    if (logCam) {
      // [yaw°, distance, widening, seen, in a tube, pitch°, flat distance, gnome height (share of screen), ball ndc y, cup ndc x, state, near-wall]
      const fl = Math.hypot(camera.position.x - B.x, camera.position.z - B.z);
      const top = ndcTop.copy(B).setY(B.y + 1.1).project(camera).y, bot = ndcBot.copy(B).setY(B.y - BALL_R).project(camera).y;
      const cupX = ndcTop.set(g.s.cup[0], B.y, g.s.cup[1]).project(camera).x;
      camLog.push([+((yaw * 180) / Math.PI).toFixed(1), +camera.position.distanceTo(B).toFixed(1), +wide.toFixed(2), seen ? 1 : 0, under ? 1 : 0,
        +((Math.atan2(camera.position.y - B.y, fl) * 180) / Math.PI).toFixed(1), +fl.toFixed(1), +((top - bot) / 2).toFixed(3), +ndcB.y.toFixed(2), +cupX.toFixed(2), state, wallHug(camera.position) ? 1 : 0, inFrame ? 1 : 0, snapped ? 1 : 0, +ndcB.x.toFixed(2), Math.round(performance.now())]);
    }
  }
  // a camera in a wall's face: within 1 of a wall and below its kerb top
  function wallHug(P) {
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const ax = w.a[0], az = w.a[1], bx = w.b[0], bz = w.b[1];
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((P.x - ax) * (bx - ax) + (P.z - az) * (bz - az)) / l2));
      if (Math.hypot(P.x - (ax + (bx - ax) * t), P.z - (az + (bz - az) * t)) < 1 && P.y < ground(P.x, P.z) + KERB + 0.3) return true;
    }
    return false;
  }

  // The chase camera never sits in or behind a wall: the line from the ball to
  // it is tested against the hole's walls and posts, and a hit brings it in
  // front of the wall and up over the kerb. It stays over the board, at least
  // MIN_D from the ball and looking down at least MIN_PITCH; beside a wall it
  // leans away from it. The chase's own easing then smooths every push.
  const TP_FOV = 58; // third person's lens (the others keep 30)
  const KERB = 1.1, MIN_D = 3, MIN_PITCH = (18 * Math.PI) / 180, MAX_PITCH = (40 * Math.PI) / 180;
  /** Whether the line from B (raised by lift) to C clears the ground (from 1.5 out). */
  function lineClear(B, cx, cy, cz, lift = 0.7) {
    const L = Math.hypot(cx - B.x, cz - B.z) || 1;
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (t * L < 1.5) continue;
      const x = B.x + (cx - B.x) * t, z = B.z + (cz - B.z) * t;
      if (B.y + lift + (cy - B.y - lift) * t < ground(x, z) + 0.15) return false;
    }
    return true;
  }

  // a timed wall (a tram, a gate) counts only while the clock has it standing
  const wallOn = (w) => !w.every || (((Math.floor(clock) + (w.phase | 0)) % w.every) + w.every) % w.every < w.on;
  // whether the course hides B from P: a wall or a post between them, higher
  // than the sight line where it crosses (no allocation, no ray)
  const POST_H = 1.6;
  function occluded(P, B) {
    if (!g.s) return false;
    // the ground and the decor between (from 1.5 out: what the ball sits in is not in the way)
    if (!lineClear(B, P.x, P.y, P.z, 0)) return true;
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const t = segHit(B.x, B.z, P.x, P.z, w.a, w.b); // from the ball towards the camera
      if (t < 0) continue;
      const x = B.x + (P.x - B.x) * t, z = B.z + (P.z - B.z) * t;
      if (B.y + (P.y - B.y) * t < ground(x, z) + KERB) return true;
    }
    for (const p of g.s.posts || []) {
      const c = p.c;
      if (!c) continue;
      const r = p.r || 0.5, dx = P.x - B.x, dz = P.z - B.z, fx = B.x - c[0], fz = B.z - c[1];
      const A = dx * dx + dz * dz, Bq = 2 * (fx * dx + fz * dz), Cq = fx * fx + fz * fz - r * r, disc = Bq * Bq - 4 * A * Cq;
      if (A <= 0 || disc < 0) continue;
      const t = (-Bq - Math.sqrt(disc)) / (2 * A);
      if (t > 0 && t < 1 && B.y + (P.y - B.y) * t < ground(c[0], c[1]) + POST_H) return true;
    }
    return false;
  }
  function segHit(ox, oz, cx, cz, a, b) {
    // where o→c crosses a→b, as a fraction of o→c, or -1
    const rx = cx - ox, rz = cz - oz, sx = b[0] - a[0], sz = b[1] - a[1];
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return -1;
    const t = ((a[0] - ox) * sz - (a[1] - oz) * sx) / den, u = ((a[0] - ox) * rz - (a[1] - oz) * rx) / den;
    return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : -1;
  }
  // the nearest wall or post on the line from (ox, oz) to (cx, cz), as a fraction (1: none)
  function firstHit(ox, oz, cx, cz) {
    let t = 1;
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const h = segHit(ox, oz, cx, cz, w.a, w.b);
      if (h >= 0 && h < t) t = h;
    }
    for (const p of g.s.posts || []) {
      const c = p.c;
      if (!c) continue;
      const r = (p.r || 0.5) + 0.3, dx = cx - ox, dz = cz - oz, fx = ox - c[0], fz = oz - c[1];
      const A = dx * dx + dz * dz, Bq = 2 * (fx * dx + fz * dz), Cq = fx * fx + fz * fz - r * r, disc = Bq * Bq - 4 * A * Cq;
      if (A > 0 && disc >= 0) {
        const h = (-Bq - Math.sqrt(disc)) / (2 * A);
        if (h > 0 && h < t) t = h;
      }
    }
    return t;
  }
  // A wall right behind the ball (a ball at rest against the kerb) cannot be
  // seen over from 7 behind at a sane pitch: the camera swings round a little,
  // either way, to the nearest heading it can look from — it never comes in
  // closer than MIN_FLAT, nor ends up over the ball's head.
  // at rest and aiming the framing wants 6.5 at least; rolling, 4.5 will do
  const MIN_FLAT = 4.5, REST_FLAT = 6.5;
  let flatFloor = MIN_FLAT;
  const SWINGS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];
  function clearHeading(B, dist, up) {
    // first a heading it can look from at its own height, then one it can
    // look from by rising (up to MAX_PITCH)
    // (a tight pen: a unit closer is still the framing, and needs no climb)
    for (const [lim, dd] of [[up, dist], [up, dist - 1], [Math.tan(MAX_PITCH) * dist, dist]])
      for (const off of SWINGS) {
        const dist_ = dd;
        const a = yaw + off, cx = B.x - Math.cos(a) * dist_, cz = B.z - Math.sin(a) * dist_;
        // a place off the board and its rim would be pulled in: not one to stand on
        if (cx < -1.5 || cz < -1.5 || cx > g.s.board.w + 1.5 || cz > g.s.board.h + 1.5) continue;
        const t = firstHit(B.x, B.z, cx, cz);
        if (t >= 1) return (pen = dist - dist_), off;
        const need = (ground(B.x + (cx - B.x) * t, B.z + (cz - B.z) * t) + KERB + 0.35 - B.y) / Math.max(t, 0.05);
        if (need <= lim && t * dist_ >= 1) return (pen = dist - dist_), off;
      }
    pen = 0;
    return 0;
  }
  // points along every closed tube that stands off the ground (a loop zone's
  // curve, not a thrown ball's arc), made once per hole
  const TUBE_CLEAR = 2.6; // the tube's 0.6 and the lens probe's 2
  let tubeFor = null, tubeList = [];
  function tubeBits() {
    const tubes = g.course && g.course.userData.tubes;
    if (tubeFor === g.course) return tubeList;
    tubeFor = g.course;
    tubeList = [];
    if (tubes) for (const [z, curve] of tubes) if (z.kind === "loop" && curve.getPointAt && !(curve.userData && curve.userData.arc) && /tube/.test(z.skin || "")) for (let k = 0; k <= 48; k++) tubeList.push(curve.getPointAt(k / 48));
    return tubeList;
  }
  function keepClear(C, B) {
    if (!g.s) return;
    const ox = B.x, oz = B.z;
    // lean away from a wall close beside the ball
    let nx = 0, nz = 0;
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const ax = w.a[0], az = w.a[1], bx = w.b[0], bz = w.b[1];
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((ox - ax) * (bx - ax) + (oz - az) * (bz - az)) / l2));
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t, d = Math.hypot(ox - px, oz - pz);
      if (d < 1.6 && d > 1e-3) (nx += ((ox - px) / d) * (1.6 - d)), (nz += ((oz - pz) / d) * (1.6 - d));
    }
    C.x += nx * 1.5;
    C.z += nz * 1.5;
    // a post (a bumper, a mushroom) is never right beside the lens: pushed out of its reach
    for (const p of g.s.posts || []) {
      const c = p.c;
      if (!c) continue;
      // a big one (a sandcastle) stands tall: a wider berth
      const r = (p.r || 0.5) + ((p.r || 0.5) >= 2 ? 2.6 : 1.6), dx = C.x - c[0], dz = C.z - c[1], d = Math.hypot(dx, dz);
      if (d < r && d > 1e-3) {
        (C.x = c[0] + (dx / d) * r), (C.z = c[1] + (dz / d) * r);
        // pushed in towards the ball? keep the distance, round the post's far side
        const fl = Math.hypot(C.x - ox, C.z - oz);
        if (fl < flatFloor) (C.x = ox + ((C.x - ox) / (fl || 1)) * flatFloor), (C.z = oz + ((C.z - oz) / (fl || 1)) * flatFloor);
      }
    }
    // a tube in the air (island7's slide round its castle) is never right in
    // front of the lens either: pushed out of its reach, in 3D
    for (const q of tubeBits()) {
      const dx = C.x - q.x, dy = C.y - q.y, dz = C.z - q.z, d = Math.hypot(dx, dy, dz);
      if (d < TUBE_CLEAR && d > 1e-3) (C.x = q.x + (dx / d) * TUBE_CLEAR), (C.y = q.y + (dy / d) * TUBE_CLEAR), (C.z = q.z + (dz / d) * TUBE_CLEAR);
    }
    // the nearest wall or post between the ball and the camera
    let t = 1;
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const h = segHit(ox, oz, C.x, C.z, w.a, w.b);
      if (h >= 0 && h < t) t = h;
    }
    for (const p of g.s.posts || []) {
      const c = p.c || p.at || p.pos;
      if (!c) continue;
      const r = (p.r || 0.5) + 0.3, dx = C.x - ox, dz = C.z - oz, fx = ox - c[0], fz = oz - c[1];
      const A = dx * dx + dz * dz, Bq = 2 * (fx * dx + fz * dz), Cq = fx * fx + fz * fz - r * r, disc = Bq * Bq - 4 * A * Cq;
      if (A > 0 && disc >= 0) {
        const h = (-Bq - Math.sqrt(disc)) / (2 * A);
        if (h > 0 && h < t) t = h;
      }
    }
    let blocked = false;
    const flat0 = Math.hypot(C.x - ox, C.z - oz) || 1;
    if (t < 1) {
      // a wall between: stay where it is, but high enough that the line of
      // sight clears the kerb at the wall; only if that would look down
      // steeper than MAX_PITCH, come in to just in front of it
      const need = B.y + (ground(ox + (C.x - ox) * t, oz + (C.z - oz) * t) + KERB + 0.35 - B.y) / Math.max(t, 0.05);
      if (need - B.y <= Math.tan(MAX_PITCH) * flat0) C.y = Math.max(C.y, need);
      else {
        const k = Math.max(Math.min(1, flatFloor / flat0), t - 0.6 / flat0);
        C.x = ox + (C.x - ox) * k;
        C.z = oz + (C.z - oz) * k;
        blocked = true;
      }
    }
    // over the board (plus its rim): beyond it the scenery is higher than the
    // course's own ground, and a camera out there sits in the decor
    const W = g.s.board.w, H = g.s.board.h, RIM = 1.5;
    const cx = Math.max(-RIM, Math.min(W + RIM, C.x)), cz = Math.max(-RIM, Math.min(H + RIM, C.z));
    if (cx !== C.x || cz !== C.z) (C.x = cx), (C.z = cz), (C.y = Math.max(C.y, B.y + 2.5));
    const base = ground(C.x, C.z);
    if (blocked) C.y = Math.max(C.y, base + KERB + 1.5);
    C.y = Math.max(C.y, base + 1);
    // a rise in the ground between: the camera goes over it, not into it
    // a rise in the ground between: the camera goes over it, not into it
    const L = Math.hypot(C.x - ox, C.z - oz) || 1;
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (t * L < 1.5) continue;
      const x = ox + (C.x - ox) * t, z = oz + (C.z - oz) * t, h = ground(x, z) + 0.8;
      if (B.y + (C.y - B.y) * t < h) C.y = Math.max(C.y, B.y + (h - B.y) / t);
    }
    // far enough, looking down at least MIN_PITCH and at most MAX_PITCH
    const flat = Math.hypot(C.x - ox, C.z - oz);
    C.y = Math.max(C.y, B.y + Math.tan(MIN_PITCH) * flat);
    C.y = Math.min(C.y, B.y + Math.tan(MAX_PITCH) * Math.max(flat, MIN_D));
    const d3 = Math.hypot(flat, C.y - B.y);
    if (d3 < MIN_D) C.y = Math.min(B.y + Math.tan(MAX_PITCH) * MIN_D, B.y + Math.sqrt(Math.max(0, MIN_D * MIN_D - flat * flat)));
  }

  // ?camlog (dev only): the camera's per-frame log and the probes below
  // (camLog, camPose, camAim, lensFill, inView, camInner, classicTurn,
  // sightProbe) exist for media/camera/camsuite.mjs; without the flag they
  // do nothing and cost nothing
  const logCam = typeof location !== "undefined" && /[?&]camlog/.test(location.search);

  function setView(v) {
    clearTimeout(closeIn);
    g.view = v;
    publish();
  }
  window.addEventListener("resize", resize);
  setTier();

  let last = 0;
  // What the GPU is spared: nothing is drawn behind an opaque screen (the
  // title, the cups, the picker) or in a hidden tab, and a still scene — no
  // shot, no aim, the camera settled, only the garden breathing — is drawn at
  // 30 frames a second instead of the display's 60 or 120.
  // idle: 30 fps while the weather or timed pieces move (a lift, a tram
  // glide on that), 10 when only the garden breathes; with reduced motion and
  // nothing moving, nothing is drawn until something changes
  // and busy (a shot, an aim) at 60 at most, whatever the display's rate.
  // A window in the background (another app in front) is not drawn either,
  // unless a shot is on its way.
  const IDLE_MS = 1000 / 30, STILL_MS = 1000 / 10, BUSY_MS = 1000 / 60;
  let settled = false, blurred = false;
  const onBlur = () => (blurred = true);
  const onFocus = () => ((blurred = false), (wake = performance.now()));
  const onWake = () => (wake = performance.now());
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pointermove", onWake, { passive: true });
  window.addEventListener("keydown", onWake);
  function frame(now) {
    if (!alive) return;
    requestAnimationFrame(frame);
    if (!g.started || g.covered || document.hidden || (warming && warming === loads)) return (last = now);
    // timed pieces glide at the idle rate: they are no reason to draw at 60
    const busy = promo.on || g.flying || dragging || !!morph || (g.cam === "third" && g.aiming) || growing.length || confetti || righting || !settled;
    if (blurred && !busy) return (last = now);
    const still = !g.weather && !(everyOf() > 0);
    if (!busy && still && !motion && now - wake > 1000) return (last = now); // (a still garden under reduced motion)
    if (now - last < (busy ? BUSY_MS : still ? STILL_MS : IDLE_MS) - 2) return;
    probeFrame(now, busy);
    // the clock of the timed pieces runs on real time, however far apart the
    // frames are (never stepped by a capped dt): at any frame rate a piece is
    // where the time says, never behind it
    const elapsed = Math.min((now - last) / 1000, 0.5), dt = Math.min(elapsed, 0.1);
    last = now;
    updateCamera(dt);
    promo.camera(camera); // ?promo: the trailer's camera, off otherwise
    setTime(now / 1000);
    if (growing.length) growing = growing.filter((a) => {
      a.t = Math.min(a.t + dt / 0.35, 1);
      const k = 1 - Math.pow(1 - a.t, 3);
      a.o.scale.y = a.from + (a.to - a.from) * k;
      if (a.t < 1) return true;
      if (a.gone && a.o.parent) {
        a.o.parent.remove(a.o);
        disposeCourse(a.o);
      }
      return false;
    });
    if (g.course) g.course.userData.tick(now / 1000);
    if (told.aiming !== !!g.aiming || (g.aiming && told.bar !== Math.round((g.power || 0) * 40))) {
      if (!told.at) told.at = now;
      else if (now - told.at > 300) (told.at = 0), console.warn("gnogolf: the HUD's aim was stale, told again"), publish();
    } else told.at = 0;
    if (!g.flying && g.course) {
      // at rest and while aiming the pieces move slowly enough to read and to
      // time (3.5 substeps a second, 1.5 with reduced motion); the replay
      // follows the path's own steps. The chain only sees the tick at release.
      clock += elapsed * (reduced ? 1.5 : 3.5);
      showClock(clock);
      // aiming at moving pieces: the dots follow them
      if (dragging && everyOf() && PREVIEW().stopAt !== "hidden" && now - lastTickPreview > 250) (lastTickPreview = now), preview();
    }
    // a world's canopy fades what stands between the camera and the ball
    if (g.course && g.course.userData.fade) g.course.userData.fade(camera.position, ball.position);
    weather.tick(now / 1000);
    causes.tick(now / 1000);
    stepMorph(now);
    if (glowing.size) fadeSlopes(dt);
    if (g.rig) weather.view(g.rig.dist);
    if (extras && extras.userData.tick) extras.userData.tick(now / 1000);
    const flag = g.course && g.course.userData.flag;
    if (flag) {
      // a wind leans the flag down-wind, and sets it flapping faster
      const wv = g.weather && g.weather.wind, ws = wv ? Math.hypot(wv[0], wv[1]) : 0;
      flag.rotation.x = wv ? (wv[1] / (ws || 1)) * Math.min(0.35, ws * 5) : 0;
      flag.rotation.z = wv ? -(wv[0] / (ws || 1)) * Math.min(0.35, ws * 5) : 0;
      flag.rotation.y = now / (900 - Math.min(600, ws * 6000));
      flag.position.y = flag.userData.baseY + Math.abs(Math.sin(now / 420)) * 0.5;
    }
    if (righting) {
      righting.t = Math.min(righting.t + dt / 0.45, 1);
      const k = 1 - Math.pow(1 - righting.t, 3);
      ball.userData.body.quaternion.slerpQuaternions(righting.from, righting.to, k);
      if (righting.t >= 1) righting = null;
    }
    // the shadow is on the ground under him, whatever he is doing above it
    const floor = BALL_R + ground(ball.position.x, ball.position.z);
    ball.userData.shade.position.y = floor - ball.position.y - BALL_R + 0.02;
    if (!g.flying) {
      // at rest on a deck that moves (a seesaw), he rides it
      if (g.course && g.course.userData.lifts && !g.done && !g.holed) ball.position.y = floor; // never a holed ball, it stays down in the cup
      // an idle gnome breathes; his shadow breathes with him, on the ground
      const bob = Math.sin(now / 520) * 0.06;
      ball.userData.body.position.y = bob + mood.hop(now);
      ball.userData.shade.scale.setScalar(1 - bob * 1.5);
    }
    // he blinks every few seconds — twice, now and then — unless he is dizzy
    const eyes = ball.userData.eyes;
    if (eyes) {
      if (now > blinkAt) {
        blinkUntil = now + 130;
        blinkAt = now + 2200 + Math.random() * 3200;
        if (Math.random() < 0.25) blinkAt = now + 260; // a double blink
      }
      const shut = now < blinkUntil ? 0.12 : 1;
      for (const e of eyes) e.scale.y = shut;
    }
    mood.tick(now);
    if (confetti && !confetti.step(dt)) {
      scene.remove(confetti.group);
      disposeCourse(confetti.group);
      confetti = null;
    }
    // nothing to see behind the title and picker screens, which are opaque
    if (g.started) renderer.render(scene, camera);
  }

  // --------------------------------------------------------------- loading

  // Loads are ticketed: only the latest one may land, and the round changes
  // before the wait, so any shot still in the air is already somebody else's.
  let loads = 0, warming = 0; // warming: the load whose hole is being built and compiled
  async function load(id) {
    const ticket = ++loads;
    // any shot in the air belongs to the old hole: end its round, but ask the
    // chain nothing for it (the new hole's round starts once it is built)
    newRound(false);
    let s;
    try {
      s = await chain.state(id);
    } catch (err) {
      if (ticket === loads && alive) {
        g.error = String(err.message || err);
        g.errorKind = "load";
        publish();
      }
      return;
    }
    if (ticket !== loads || !alive) return;

    g.id = id;
    // ?world= dresses any hole in another world's look — for building one
    if (forceWorld) s = { ...s, world: forceWorld };
    // a cup's own look is fetched the first time one of its holes is played
    try {
      await loadWorld(s.world);
    } catch {} // offline: the hole draws as the garden, still playable
    if (ticket !== loads || !alive) return;
    g.s = s;
    if (g.course) {
      scene.remove(g.course);
      disposeCourse(g.course); // the old island's GPU memory goes with it
    }
    g.course = null;
    extras = null;
    extrasFor = "";
    growing = [];
    answers.clear(); // the hole is read anew: so are its previews
    // from here until its shaders are ready nothing is drawn (the curtain, or
    // the title, is over the course): the build in two tasks, then the
    // shaders compiled off the main thread
    warming = ticket;
    const built0 = performance.now();
    let course = null;
    try {
      course = buildHole(g.s, { defer: true });
      await new Promise((r) => setTimeout(r, 0)); // the pieces, then (next task) their merge
      if (ticket !== loads || !alive) return void disposeCourse(course);
      finishHole(course);
    } catch (err) {
      // our bug, not the chain's: say so, and leave the game usable
      console.error(err);
      if (ticket !== loads) return;
      warming = 0;
      g.error = String(err.message || err);
      g.errorKind = "draw";
      return publish();
    }
    g.course = course;
    scene.add(g.course);
    setLighting(scene, g.course.userData.time);
    // a hole's own weather, until a stroke's forecast says otherwise
    weather.board(g.s.board.w, g.s.board.h, g.s.world || "garden", g.course.userData.terrain.onGreen);
    // the round's weather: the chain's forecast for its quarter hour
    g.period = s.period;
    g.forecast = s.weather || null;
    applyWeather();
    // the garden's foliage and bunting lean with the wind (global: set on every hole)
    newRound();
    const built1 = performance.now();
    await warm(); // shaders now, not on the player's first click
    if (ticket !== loads || !alive) return;
    warming = 0;
    g.buildMs = [Math.round(built1 - built0), Math.round(performance.now() - built1)]; // ?camlog's buildMs(): [build, compile]
    g.rig = null; // a new hole starts from its overview, not from the last one
    resize();
    setView("overview");
    if (g.started) closeIn = setTimeout(() => setView(home()), OVERVIEW_MS);
  }

  // Every shader the hole can need, compiled now: the scene as it is, and the
  // see-through variant of what a canopy fade turns transparent (fog and the
  // lightning's light never change the programs: see weather.js)
  // (the see-through ones are only started: they are ready long before a fade
  // needs them). Resolves once the ones drawn now are linked.
  function warm() {
    const fades = [];
    scene.traverse((o) => {
      const m = o.material;
      if (m && !Array.isArray(m) && m.userData.fade === 1 && !m.transparent) fades.push(m);
    });
    if (fades.length) {
      for (const m of fades) m.transparent = true;
      renderer.compile(scene, camera);
      for (const m of fades) (m.transparent = false), (m.needsUpdate = true);
    }
    // (a context without parallel compiling resolves at once: the old way;
    // and a driver that never says a program is ready is waited 2 s at most)
    let t = 0;
    return Promise.race([
      renderer.compileAsync(scene, camera).catch((e) => console.warn("gnogolf: compileAsync", e)),
      new Promise((r) => (t = setTimeout(() => (console.warn("gnogolf: shaders not ready after 2 s"), r()), 2000))),
    ]).finally(() => clearTimeout(t));
  }

  // A timed hole's moving pieces, for the stroke about to be played. They grow
  // up out of the ground when they appear, and the old ones sink away.
  let extras = null, extrasFor = "";
  async function showExtras() {
    if (!g.s || !g.s.timed || !g.course) return;
    const key = `${g.id}#${g.round}#${g.shots.length}`;
    if (key === extrasFor) return;
    extrasFor = key;
    let ex;
    try {
      ex = await chain.extras(g.id, g.shots.length);
    } catch {
      if (extrasFor === key) extrasFor = ""; // let the next stroke ask again
      return;
    }
    if (extrasFor !== key || !alive || !g.course) return;
    // this stroke's weather: the hole's, and whatever the stroke brings
    strokeWalls = ex.walls || [];
    applyWeather(ex.zones);
    publish();
    const old = extras;
    extras = buildExtras(g.course, ex);
    extras.scale.y = 0.01;
    g.course.add(extras);
    growing.push({ o: extras, from: 0.01, to: 1, t: 0 });
    if (old) growing.push({ o: old, from: 1, to: 0.01, t: 0, gone: true });
  }
  let growing = [];

  // The weather drawn is the round's (a forecast fixed for its quarter hour),
  // with whatever the hole or the stroke carries itself.
  let strokeZones = [], strokeWalls = [];
  function applyWeather(zones) {
    if (zones) strokeZones = zones;
    if (!g.s || !g.course) return;
    g.weather = weather.set(faked() || [...g.s.zones, ...((g.forecast && g.forecast.zones) || []), ...strokeZones]);
    everyL = everyNow();
    // the mill's sails count from a quarter turn, sail down: tick 0 of the clock
    const mill = g.course.userData.mill;
    if (mill && mill.shoot && !mill.started) (mill.shoot(), (mill.started = true));
    ambience(g.weather || {});
    if (g.course.userData.wind) g.course.userData.wind((g.weather && g.weather.wind) || null);
    if (g.course.userData.weather) g.course.userData.weather(g.weather); // the decor dressed for it (sunbathers in, parasols shut...)
    publish();
  }
  // between rounds the quarter hour may have turned: a new round takes the new weather
  async function freshWeather() {
    const id = g.id, round = g.round;
    try {
      const p = await chain.period();
      if (p === g.period || id !== g.id || round !== g.round) return;
      const fc = await chain.weather(id, p);
      if (id !== g.id || round !== g.round || g.shots.length) return; // a shot already went: keep its weather
      g.period = p;
      g.forecast = fc;
      applyWeather();
    } catch {}
  }

  // The timed pieces' clock: one substep per MS_PER_STEP, running all the
  // time. A shot is let go at a tick of it and the chain plays the stroke from
  // there, so what is on screen when you shoot is what the ball meets. It
  // stops during a replay, where the path's own steps drive it.
  let clock = 0, lastTickPreview = 0;
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let everyL = 0; // the timed pieces' common period, kept per round
  const everyOf = () => everyL;
  const everyNow = () => {
    // every timed piece there is: the hole's, the forecast's, and this stroke's (a tram, a gate)
    const ev = [...((g.s && g.s.walls) || []), ...((g.s && g.s.zones) || []), ...((g.forecast && g.forecast.zones) || []), ...strokeZones, ...strokeWalls]
      .map((q) => q.every | 0).filter((e) => e > 0);
    if (!ev.length) return 0;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    return Math.min(1024, ev.reduce((a, b) => (a * b) / gcd(a, b)));
  };
  const tickNow = () => {
    const L = everyOf();
    return L ? Math.floor(clock) % L : null; // no timed piece: nothing to send
  };
  const showClock = (t) => {
    const mill = g.course && g.course.userData.mill, timed = g.course && g.course.userData.timed;
    if (mill && mill.at) mill.at(t);
    if (timed) for (const p of timed) p.at(t);
    weather.clock(t); // a hole's gusts blow on the same clock
  };
  // timed pieces as they stand now (the clock runs on from where it is)
  const restTimed = () => showClock(clock);

  /** A fresh round on the hole already built: back to the tee, nothing kept. */
  function newRound(ask = true) {
    // a new round starts behind the gnome, looking at the cup: no easing in from the last pose
    g.lastAim = null;
    resetFollow();
    sp.live = false; // a new round: the camera starts in its framing, not eased in from the last hole
    g.roundMode = null;
    glowing.clear();
    restTimed();
    g.round = (g.round || 0) + 1;
    if (confetti) {
      scene.remove(confetti.group);
      disposeCourse(confetti.group);
      confetti = null;
    }
    clearTimeout(holedIn);
    g.flying = g.done = g.holed = g.aiming = false;
    g.error = null;
    g.strokes = 0;
    g.shots = []; // the round's decisions: what a record replays
    g.pts = []; // each stroke's path length, for the gas estimate
    g.rest = null; // the ball exactly as the chain left it: where the next stroke is asked from
    g.facing = Math.PI / 2; // at rest he looks at the player
    dragging = false;
    dropAim();
    ball.visible = true;
    if (g.s) {
      g.ball = { x: g.s.start[0], y: g.s.start[1] };
      placeBall();
      strokeZones = [];
      strokeWalls = [];
      if (ask) showExtras();
      if (ask && g.period != null) freshWeather();
    }
    publish();
  }

  function placeBall() {
    ball.position.set(g.ball.x, BALL_R + ground(g.ball.x, g.ball.y), g.ball.y);
    ball.userData.shade.position.set(0, -BALL_R + 0.02, 0); // on the ground, under him
    righting = null; // placing him overrides any righting in progress
    ball.scale.setScalar(1); // back out of the cup after a hole
    ball.userData.body.rotation.set(0, Math.PI / 2 - g.facing, 0);
  }

  // ---------------------------------------------------------------- aiming

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  let dragging = false;
  // the aim mode (assisted | pro); a round keeps the mode of its first stroke
  let mode = aimMode === "pro" ? "pro" : "assisted";
  const PREVIEW = () => PREVIEWS[g.roundMode || mode];
  const dotPower = (p) => (PREVIEW().stopAt === "none" ? p : proPower(PREVIEW()));
  // replays cut by the safety net: every animation of the one cut stops
  let cut = 0; // each animation keeps the value it started with (cutAt)
  let shown = null; // the aim the dots on screen were computed for (see interpolate)
  const straight = [[0, 0], [0, 0]]; // the provisional line, until the chain answers
  // The chain's dots bend into place from where the straight ones were: each
  // dot glides to its new spot over 120 ms (one blend of the instance matrices).
  const MORPH_MS = 120;
  let morph = null;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _q = new THREE.Quaternion(), _mm = new THREE.Matrix4();
  function snapDots() {
    const d = aim.userData.dots;
    if (!d || !d.count || !aim.visible) return null;
    return d.instanceMatrix.array.slice(0, d.count * 16);
  }
  function morphFrom(was) {
    const d = aim.userData.dots;
    if (!was || !d || !d.count) return void (morph = null);
    morph = { from: was, to: d.instanceMatrix.array.slice(0, d.count * 16), n: d.count, t0: performance.now() };
  }
  function stepMorph(now) {
    if (!morph) return;
    const d = aim.userData.dots, k = Math.min(1, (now - morph.t0) / MORPH_MS), e = 1 - (1 - k) * (1 - k);
    const arr = d.instanceMatrix.array, had = morph.from.length / 16;
    for (let i = 0; i < morph.n; i++) {
      // a dot the straight line did not have grows out of its last one
      _mm.fromArray(morph.from, Math.min(i, had - 1) * 16).decompose(_a, _q, _sa);
      _mm.fromArray(morph.to, i * 16).decompose(_b, _q, _sb);
      _a.lerp(_b, e);
      _sa.lerp(_sb, e);
      _mm.makeScale(_sa.x, _sa.y, _sa.z).setPosition(_a);
      _mm.toArray(arr, i * 16);
    }
    d.instanceMatrix.needsUpdate = true;
    if (k >= 1) morph = null;
  }
  // the aim put away: no dots, no elastic, nothing turned
  // the dashed outlines of timed pieces that are away, shown only while aiming
  const ghosts = (on) => g.course && g.course.userData.ghosts && g.course.userData.ghosts(on);
  const dropAim = () => {
    // a preview on its way is no longer wanted
    if (asked) asked.abort(), (asked = null), (asking = false);
    clearTimeout(later);
    since = 0;
    morph = null;
    ghosts(false);
    aim.visible = band.visible = false;
    shown = null;
    aim.rotation.set(0, 0, 0);
    aim.position.set(0, 0, 0);
  };
  let shot = { angle: 0, power: 0 };

  function boardPoint(ev) {
    const r = canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc.set(x, y), camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : null;
  }

  // A slingshot: press anywhere, pull back, let go. The shot flies away from
  // the pull, as if the elastic snapped into the gnome.
  let press = null;

  function onMove(ev) {
    if (!dragging || g.flying || !press) return;
    // the power is the pointer's distance from where the pull began, on the
    // screen, whatever the camera does meanwhile
    const px = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
    if (px < 6) {
      // back at the start: no pull at all — letting go here shoots nothing.
      // (This used to return before touching the shot, so a pull brought back
      // kept the power it had: the elastic would not come back.)
      if (shot.power > 0) {
        shot.power = 0;
        g.power = 0;
        band.visible = aim.visible = false;
        lastBar = 0;
        publish();
      }
      return;
    }
    // both ends through the camera as it is now: an easing camera moves the
    // board under a still hand, and must not turn the shot
    let dir;
    if (g.cam === "third" && press.yaw != null) {
      // behind the gnome: the aim turns from the heading the pull started
      // with, by the sideways drag — the screen's width is 90°, half that
      // with Shift — while the camera trails it softly
      dir = press.yaw - ((ev.clientX - press.baseX) / window.innerWidth) * (Math.PI / 2) * (ev.shiftKey ? 0.5 : 1);
      press.lastX = ev.clientX;
      press.moved = performance.now();
    } else {
      const from = boardPoint(press), to = boardPoint(ev);
      if (!from || !to) return;
      dir = Math.atan2(from.y - to.y, from.x - to.x);
    }
    const { deg, power } = pullShot(px, window.innerWidth, window.innerHeight, dir, MAX_POWER);
    shot.angle = (deg * Math.PI) / 180;
    shot.deg = deg;
    shot.power = power;
    g.facing = shot.angle;
    g.power = shot.power / MAX_POWER;
    creak();

    band.visible = true;
    aim.visible = PREVIEW().stopAt !== "hidden";
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    placeBall();
    // the HUD shows a power bar and nothing else of the pull: re-render only
    // when the bar would move
    const bar = Math.round(g.power * 40);
    if (bar !== lastBar) {
      lastBar = bar;
      publish();
    }
  }
  let lastBar = -1;

  const onDown = (ev) => {
    // one finger, one primary button: a second touch or a right-click is not a pull
    if (!ev.isPrimary || ev.button > 0) return;
    if (g.flying || g.done) return;
    // a new press takes over whatever aim was held (a keyboard aim, a lost pull)
    dragging = true;
    g.aiming = true;
    ghosts(true);
    shot = { angle: 0, power: 0 };
    press = { clientX: ev.clientX, clientY: ev.clientY, x: ev.clientX, y: ev.clientY };
    // third person: the heading the pull is measured from, frozen for the pull
    if (g.cam === "third" && g.view === "ball") Object.assign(press, { yaw, baseX: ev.clientX, lastX: ev.clientX, moved: performance.now() });
    // no dots until the chain has answered for this pull
    if (aim.userData.dots) aim.userData.dots.count = 0;
    else for (const d of aim.children) d.visible = false;
    canvas.setPointerCapture(ev.pointerId);
    publish();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    g.aiming = false;
    dropAim();
    publish();
    press = null;
    if (shot.power > 0.3) fire(shot.deg, shot.power);
  };

  // the OS took the pointer away (a system gesture, a call): drop the pull, no shot
  const onCancel = () => {
    press = null;
    if (!dragging) return;
    dragging = g.aiming = false;
    dropAim();
    publish();
  };

  // Keyboard: ←/→ turn the aim, ↑/↓ set the power, Space or Enter shoots,
  // Escape drops the aim. The same preview and the same fire() as the mouse.
  canvas.tabIndex = -1; // until the course is shown (cover)
  canvas.setAttribute("aria-label", "Course. Arrow keys aim and set the power, Space shoots.");
  const onKey = (ev) => {
    if (g.flying || g.done || !g.s) return;
    const step = ev.shiftKey ? 1 : 4;
    if (!g.aiming && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) {
      g.aiming = dragging = true;
      ghosts(true);
      shot = { angle: Math.atan2(g.s.cup[1] - g.ball.y, g.s.cup[0] - g.ball.x), power: 3 };
    }
    if (ev.key === "ArrowLeft") shot.angle -= (step * Math.PI) / 180;
    else if (ev.key === "ArrowRight") shot.angle += (step * Math.PI) / 180;
    else if (ev.key === "ArrowUp") shot.power = Math.min(MAX_POWER, shot.power + 0.5);
    else if (ev.key === "ArrowDown") shot.power = Math.max(0.5, shot.power - 0.5);
    else if (ev.key === "Escape" && g.aiming) {
      dragging = g.aiming = false;
      dropAim();
      return publish();
    } else if ((ev.key === " " || ev.key === "Enter") && g.aiming) {
      ev.preventDefault();
      dragging = g.aiming = false;
      dropAim();
      publish();
      const k = pullShot(0, 1, 1, shot.angle, MAX_POWER); // the same rounding as a pull
      return fire(k.deg, Math.round(shot.power * 100) / 100);
    } else return;
    ev.preventDefault();
    // rounded like a pull, so the preview is the shot
    shot.deg = pullShot(0, 1, 1, shot.angle, MAX_POWER).deg;
    shot.power = Math.round(shot.power * 100) / 100;
    g.facing = shot.angle;
    g.power = shot.power / MAX_POWER;
    creak();
    band.visible = true;
    aim.visible = PREVIEW().stopAt !== "hidden";
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    placeBall();
    publish();
  };
  canvas.addEventListener("keydown", onKey);

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("lostpointercapture", onCancel);
  // the window losing focus or the tab going away drops a pull in progress
  window.addEventListener("blur", onCancel);
  const onHide = () => document.hidden && onCancel();
  document.addEventListener("visibilitychange", onHide);

  // ------------------------------------------------------------- the shot


  // one creak per tenth of power the elastic gains or gives back
  let notch = 0;
  const creak = () => {
    const n = Math.round(g.power * 10);
    if (n !== notch && n > 0) sound("stretch", g.power);
    notch = n;
  };

  // Whatever happens in a shot — the chain erring, a replay throwing, a round
  // changing mid-flight — the slingshot comes back: flying, aiming and the
  // drag are always reset when it is over.
  async function fire(angleDeg, power) {
    if (g.flying || !g.id || g.done || !g.course) return; // no island drawn, nothing to play on
    const round = g.round;
    try {
      await shoot(angleDeg, power, round);
    } catch (err) {
      console.warn("gnogolf: a shot failed", err);
      if (round === g.round) (g.error = String((err && err.message) || err)), (g.errorKind = "shot");
    } finally {
      dragging = false;
      g.aiming = false;
      press = null;
      if (round === g.round) g.flying = false;
      publish();
    }
  }

  async function shoot(angleDeg, power, round) {
    if (g.shots.length >= MAX_SHOTS) {
      g.error = `${MAX_SHOTS} strokes is the most one round can hold.`;
      g.errorKind = "limit";
      return publish();
    }
    // round: the one this shot belongs to — if the player restarts or changes
    // hole while it is in the air, its answer is dropped instead of leaking in
    const tick = tickNow(); // where the timed pieces are as it is let go
    causes.shot();
    g.cause = null;
    // a light touch in the hand where the phone can (Android; iOS has no
    // vibration for the web) and the tock of the putter
    buzz(12);
    sound("putt", 0.5 + power / 20);
    g.flying = true;
    g.error = null;
    g.note = null;
    publish();

    let res;
    try {
      res = await strokeFrom(g.id, g.shots, shotOf(angleDeg, power, tick), g.rest);
      if (round !== g.round) return;
    } catch (err) {
      if (round !== g.round) return;
      g.flying = false;
      g.error = String(err.message || err);
      g.errorKind = "shot";
      return publish();
    }

    // a path is points of two finite numbers, or it is not one
    const bad = !Array.isArray(res.path) || res.path.some((p) => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]));
    if (bad || !res.path.length) {
      g.flying = false;
      g.error = "The chain answered without a path for that shot.";
      g.errorKind = "shot";
      return publish();
    }
    if (!g.shots.length) g.roundMode = mode; // this round is played, and recorded, in this mode
    g.lastAim = (angleDeg * Math.PI) / 180;
    g.shots = [...g.shots, shotOf(angleDeg, power, tick)]; // a new list: what changed is seen by reference
    g.pts = [...g.pts, res.path.length];
    g.rest = Array.isArray(res.rest) && res.rest.every(Number.isFinite) ? res.rest : null;
    g.tick0 = tick || 0;
    g.strokes = res.strokes || g.shots.length; // SimulateFrom has no count: a stroke is a shot
    if (res.holed) {
      g.done = true; // no more shots, even before the banner shows
      onHoled({ id: g.id, strokes: res.strokes });
      joyIn = setTimeout(() => alive && round === g.round && mood.joy(performance.now()), 500);
    }
    publish();
    // A safety net: a replay that runs well past what its path should take
    // (a promise that never settles, an animation stuck) is cut, and the
    // ball is put where the chain has it — the player is never left locked out.
    // what the path should take on screen (its steps, and a splash or
    // a tube at most), with room to spare
    let expect = 0;
    for (let i = 0; i + 1 < res.path.length; i++) expect += Math.max(MS_PER_STEP, (Math.hypot(res.path[i + 1][0] - res.path[i][0], res.path[i + 1][1] - res.path[i][1]) / SHOW_SPEED) * 1000);
    const budget = 3500 + expect * 1.5;
    let timer;
    const late = await Promise.race([
      replay(res.path, res.holed, res.air, res.cause).then(() => false, (err) => (console.warn("gnogolf: the replay threw", err), true)),
      new Promise((r) => (timer = setTimeout(() => r(true), budget))),
    ]);
    clearTimeout(timer);
    if (late) {
      cut++; // every animation of this replay stops
      console.warn(`gnogolf: replay cut after ${budget | 0} ms (path of ${res.path.length} steps)`);
    }
    restTimed();
    if (round !== g.round) return;

    const last = res.path[res.path.length - 1];
    g.ball = { x: last[0], y: last[1] };
    g.flying = false;
    showExtras(); // a timed hole changes for the next stroke
    // a jump or a bounce may have ended mid-air: put him on the ground
    if (!res.holed) ball.position.set(last[0], BALL_R + ground(last[0], last[1]), last[1]);
    g.facing = Math.PI / 2; // at rest he looks at the player
    rightUp();
    if (res.holed) {
      if (confetti) {
        scene.remove(confetti.group);
        disposeCourse(confetti.group);
      }
      confetti = makeConfetti(g.s.cup, ground(g.s.cup[0], g.s.cup[1]));
      sound("pop");
      sound("win", g.strokes === 1 ? 1 : 0); // a hole-in-one gets the longer fanfare
      scene.add(confetti.group);
      // let the confetti fly before the banner covers the course
      holedIn = setTimeout(() => {
        if (round !== g.round) return;
        g.holed = true;
        buzz([30, 60, 45]);
        sound("cup");
        publish();
      }, 1600);
    }
    publish();
  }

  /** The ground height under a board point — cosmetic, the chain's physics is flat. */
  const ground = (x, z) => (g.course ? g.course.userData.height(x, z) : 0);
  const lift = (p) => at(p, BALL_R + ground(p[0], p[1]));

  /** A tunnel is the one place the ball is somewhere else: the step lands on a
   *  tunnel's destination from inside that tunnel. Distance alone cannot tell —
   *  a full-power first substep is longer than some tunnels. */
  // Recognised by where the step lands, not where it starts: the physics
  // checks zones between recorded points, so a fast ball enters the zone after
  // the last point it recorded outside it.
  // Several zones may send the ball to the same point (a tunnel exit and a
  // pond's "back to" can coincide), so the zone is the one the step came
  // from: of those that land there, the nearest to where the ball was.
  const jumpFrom = (p, q) => {
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3) return null;
    let best = null, bd = Infinity;
    for (const z of g.s.zones) {
      // a loop with a tube (island7's castle tube) is ridden like a tunnel
      if ((z.kind !== "tunnel" && z.kind !== "hazard" && z.kind !== "loop") || Math.abs(q[0] - z.vec[0]) > 1e-3 || Math.abs(q[1] - z.vec[1]) > 1e-3) continue;
      const dx = Math.max(z.min[0] - p[0], 0, p[0] - z.max[0]), dz = Math.max(z.min[1] - p[1], 0, p[1] - z.max[1]);
      const d = Math.hypot(dx, dz);
      if (d < bd) (bd = d), (best = z);
    }
    return best;
  };
  const tunnelled = (p, q) => { const z = jumpFrom(p, q); return z && (z.kind === "tunnel" || z.kind === "loop") ? z : null; };

  // The aim is the chain's own answer: while the player pulls, the shot is
  // previewed with Simulate (read-only, free) and the dots follow the path it
  // returns, bounces included. One request in flight at a time; the latest
  // pull wins.
  let asking = false, wanted = null;
  // Debounced: every preview is a query on a shared node (one stroke's work,
  // from the exact ball: see strokeFrom), so a pull
  // asks once the hand rests PREVIEW_MS (and every PREVIEW_MAX at least while
  // it keeps moving), not at all for a change too small to see, and never
  // twice for one shot: the answers are kept by the very shot the chain was
  // asked (hole, round so far, weather period, angle, power and tick, as
  // rounded for the chain), for this hole. A request the pull no longer
  // wants (let go, cancelled, a new round) is cancelled.
  const PREVIEW_MS = 120, PREVIEW_MAX = 360, KEPT = 256;
  let sent = null, later = 0, since = 0, asked = null;
  const answers = new Map();
  const keyOf = (q) => `${q.id}|${g.period}|${q.shots.join(";")}|${q.shot}`;
  // One stroke asked of the chain: the first from the tee (SimulateRound of
  // that one shot: the tee exactly), every other one from the exact ball the
  // last answer left (SimulateFrom): one shot of work, whatever the round's
  // length. It is what PlayRoundAt will replay for the same list.
  function strokeFrom(id, shots, shot, rest, ms, signal) {
    return shots.length && rest && g.period != null
      ? chain.simulateFrom(id, rest, shot, shots.length, g.period, ms, signal)
      : chain.simulateRound(id, [...shots, shot], g.period, ms, signal);
  }
  // While the chain works out the new aim, the dots it gave for the last one
  // swing round the ball to where the pull points now, so they never lag the
  // hand; the chain's answer replaces them the moment it lands.
  function interpolate() {
    if (!shown || !aim.visible) return;
    const d = shot.angle - shown.angle, bx = g.ball.x, bz = g.ball.y;
    aim.rotation.y = -d;
    const c = Math.cos(d), sn = Math.sin(d);
    aim.position.set(bx - (bx * c - bz * sn), 0, bz - (bx * sn + bz * c));
  }
  function preview() {
    interpolate();
    if (!(shot.power > 0.3)) return; // too soft to shoot: nothing to ask
    if (PREVIEW().stopAt === "hidden") return void (aim.visible = false); // pro: no line, no request
    // no answer from the chain yet for this pull: a straight line of dots
    // along the aim, replaced by the chain's the moment it lands
    if (!shown && g.ball) {
      const len = Math.min(PREVIEW().maxLen, 2 + (shot.power / MAX_POWER) * 16);
      straight[0][0] = g.ball.x, straight[0][1] = g.ball.y;
      straight[1][0] = g.ball.x + Math.cos(shot.angle) * len, straight[1][1] = g.ball.y + Math.sin(shot.angle) * len;
      aimAlong(aim, straight, dotPower(shot.power), ground);
      aim.visible = true;
    }
    wanted = { angle: shot.angle, deg: shot.deg, power: shot.power, shots: g.shots, id: g.id };
    // asked (or being asked) already: the aim has not changed, nor the pieces moved on
    if (sent && sent.id === wanted.id && sent.n === wanted.shots.length && sent.tick === tickNow() &&
        Math.abs(sent.angle - wanted.angle) < 0.005 && Math.abs(sent.power - wanted.power) < 0.05) return;
    const q = question();
    if (answers.has(q.key)) return void ((since = 0), clearTimeout(later), (sent = q), answer(q, answers.get(q.key)));
    if (asking) return; // the one in flight lands first; the latest aim goes out after it
    const now = performance.now();
    if (!since) since = now;
    clearTimeout(later);
    later = setTimeout(ask, Math.max(0, Math.min(PREVIEW_MS, PREVIEW_MAX - (now - since))));
  }
  // the preview for the aim as it is now
  function question() {
    const w = wanted, tick = tickNow();
    const q = { ...w, rest: g.rest, n: w.shots.length, round: g.round, tick, shot: shotOf(w.deg != null ? w.deg : (w.angle * 180) / Math.PI, w.power, tick) };
    q.key = keyOf(q);
    return q;
  }
  function ask() {
    if (!dragging || !wanted || asking) return;
    since = 0;
    const q = (sent = question());
    if (answers.has(q.key)) return answer(q, answers.get(q.key));
    asking = true;
    const ac = (asked = new AbortController());
    // a chain slow to answer does not hold the aim: after 1.5 s the request is
    // let go, and the next one (the latest aim) goes out
    strokeFrom(q.id, q.shots, q.shot, q.rest, 1500, ac.signal)
      .then((res) => {
        answers.delete(q.key);
        answers.set(q.key, res);
        if (answers.size > KEPT) answers.delete(answers.keys().next().value);
        answer(q, res);
      })
      .catch(() => {})
      .finally(() => {
        if (asked === ac) (asked = null), (asking = false);
        if (dragging) preview();
      });
  }
  // the chain's dots for q, if the pull still wants them
  function answer(q, res) {
    if (!(dragging && q.id === g.id && q.round === g.round && q.n === g.shots.length)) return;
    const was = snapDots();
    aimAlong(aim, fogged(previewPath(res)), dotPower(q.power), ground, landing, dotTint(q));
    morphFrom(was);
    shown = { angle: q.angle };
    aim.rotation.y = 0;
    aim.position.set(0, 0, 0);
    interpolate();
  }

  // The ball really rolls: turned about the axis across its motion by distance
  // over radius. It is cosmetic — the chain moves a point — and when it stops
  // the gnome rights himself and looks at the player again.
  const axis = new THREE.Vector3(), spin = new THREE.Quaternion();
  function roll(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    axis.set(dz / d, 0, -dx / d);
    spin.setFromAxisAngle(axis, d / BALL_R);
    ball.userData.body.quaternion.premultiply(spin);
  }
  function rightUp() {
    const body = ball.userData.body;
    const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - g.facing, 0));
    righting = { from: body.quaternion.clone(), to, t: 0 };
  }

  // Off a ramp the ball takes off. On the ground it follows the ground; when
  // the ground falls away faster than the ball is moving down, it is in the
  // air, under gravity, until it lands (with a small bounce). Cosmetic, like
  // every height here: the chain's ball is a point on a flat board.
  // The rule a real ball follows: it stays on the ground while the ground's
  // own downward acceleration under it is less than gravity. Over a crest
  // that acceleration is speed² × curvature, so a fast ball over a rounded
  // hilltop takes off, a slow one rolls over it. In the air it falls under
  // gravity and lands with a little bounce. Cosmetic: the chain's ball is a
  // point on a flat board.
  const air = { y: 0, vy: 0, gvy: 0, up: false, t: 0 };
  // On the ground, the ball follows it up at once but comes down a drop (the
  // end of a ramp too slow to take off, a ledge) under gravity, never in one
  // frame. The chain's air flags handle real flights.
  let dropY = null, dropV = 0, dropT = 0;
  function fallTo(floor, now) {
    const dt = dropT ? Math.min((now - dropT) / 1000, 0.05) : 0;
    dropT = now;
    if (dropY === null || floor >= dropY - 0.02 || !dt) {
      dropY = floor;
      dropV = 0;
      return floor;
    }
    dropV -= GRAVITY * dt;
    dropY = Math.max(floor, dropY + dropV * dt);
    if (dropY === floor) dropV = 0;
    return dropY;
  }
  const GRAVITY = 30;
  function fly(p) {
    const now = performance.now();
    const dt = air.t ? Math.min((now - air.t) / 1000, 0.05) : 0;
    air.t = now;
    const floor = BALL_R + ground(p.x, p.z);
    if (!dt) {
      air.y = p.y = floor;
      air.vy = air.gvy = 0;
      return;
    }
    if (!air.up) {
      const gvy = (floor - air.y) / dt;       // the ground's vertical speed under the ball
      const ga = (gvy - air.gvy) / dt;        // …and its vertical acceleration
      air.gvy = gvy;
      if (ga < -GRAVITY && air.vy > -0.5) {
        air.up = true;                        // the ground drops away faster than he can fall
      } else {
        air.vy = gvy;
        air.y = floor;
      }
    }
    if (air.up) {
      air.vy -= GRAVITY * dt;
      air.y += air.vy * dt;
      if (air.y <= floor) {
        air.y = floor;
        air.vy = air.vy < -3 ? -air.vy * 0.3 : 0; // a hard landing bounces once
        air.up = air.vy > 0;
        air.gvy = 0;
      }
    }
    p.y = air.y;
  }

  // The kind of jump a step makes, for the aim dots: "tunnel", "hazard" or null.

  // whether a wind (the weather's) or a gust covers (x, y), by the zones' skins
  // a timed slope that is not wind: a seesaw's plank, a tilting board
  const tilting = (zs, x, y) => zs.some((z) => z.kind === "slope" && z.every && z.skin !== "wind" && z.skin !== "gust" && inZone(z, x, y));
  const windy = (zs, x, y) => zs.some((z) => z.kind === "slope" && (z.skin === "wind" || z.skin === "gust") && inZone(z, x, y)) || !!(g.weather && g.weather.wind && !zs.some((z) => z.kind === "slope" && z.every && inZone(z, x, y)));

  // A slope's contour arrows light up while the ball rolls down it, and fade after.
  const glowing = new Map(); // zone -> glow level 0..1
  function glowSlope(x, y) {
    const slopes = g.course && g.course.userData.slopes;
    if (!slopes) return;
    for (const [z] of slopes) if (inZone(z, x, y)) glowing.set(z, 1);
  }
  function fadeSlopes(dt) {
    const slopes = g.course && g.course.userData.slopes;
    for (const [z, k] of glowing) {
      const n = Math.max(0, k - dt * 1.5);
      if (slopes && slopes.get(z)) slopes.get(z).glow(n);
      if (n <= 0) glowing.delete(z);
      else glowing.set(z, n);
    }
  }

  // The dots take the colour of what bends them: wind blue, a downhill slope
  // gold, ice or a wet green cyan — the same causes the replay shows.
  const TINT = { wind: new THREE.Color(0x8fc9ff), slope: new THREE.Color(0xffd36b), tilt: new THREE.Color(0xffd36b), ice: new THREE.Color(0x9ff3ff), wet: new THREE.Color(0x9ff3ff) };
  const dotTint = (q) => {
    const zs = [...g.s.zones, ...((g.forecast && g.forecast.zones) || []), ...strokeZones];
    const vx = Math.cos(q.angle), vy = Math.sin(q.angle), t = q.tick || 0;
    return (i, x, z) => {
      const c = causeAt(zs, x, z, vx, vy, t);
      return c ? TINT[c.kind] : null;
    };
  };

  // The chain's path cut where the preview stops (see PREVIEW): at the first
  // contact, and at maxLen units along it whatever the power.
  function previewPath(res) {
    const path = res.path || [], why = typeof res.cause === "string" && res.cause.length === path.length ? res.cause : "";
    let stop = path.length;
    const P = PREVIEW();
    if (P.stopAt === "first-contact") {
      for (let i = 1; i < path.length; i++) {
        const c = why[i];
        const hit = (c && c !== "-") || landing(path[i - 1], path[i]) != null;
        // a sharp turn is a bounce, for a realm that does not say
        let turn = false;
        if (!why && i + 1 < path.length) {
          const ax = path[i][0] - path[i - 1][0], ay = path[i][1] - path[i - 1][1], bx = path[i + 1][0] - path[i][0], by = path[i + 1][1] - path[i][1];
          const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
          turn = la > 1e-3 && lb > 1e-3 && (ax * bx + ay * by) / (la * lb) < Math.cos((25 * Math.PI) / 180);
        }
        if (hit || turn) {
          stop = i + 1;
          break;
        }
      }
    }
    const out = [path[0]];
    let left = P.maxLen;
    for (let i = 1; i < stop && left > 0; i++) {
      const [ax, ay] = out[out.length - 1], [bx, by] = path[i], l = Math.hypot(bx - ax, by - ay);
      if (l <= left) (out.push(path[i]), (left -= l));
      else (out.push([ax + ((bx - ax) * left) / l, ay + ((by - ay) * left) / l]), (left = 0));
    }
    return out;
  }

  // in fog the dots see only 7 units ahead: it hinders the aim without blinding it
  const fogged = (path) => {
    if (!(g.weather && g.weather.fog)) return path;
    const out = [path[0]];
    let left = 7;
    for (let i = 1; i < path.length && left > 0; i++) {
      const [ax, ay] = out[out.length - 1], [bx, by] = path[i], l = Math.hypot(bx - ax, by - ay);
      if (l <= left) (out.push(path[i]), (left -= l));
      else (out.push([ax + ((bx - ax) * left) / l, ay + ((by - ay) * left) / l]), (left = 0));
    }
    return out;
  };
  const landing = (p, q) => {
    const z = jumpFrom(p, q);
    return z ? z.kind : null;
  };

  /** Where a ball sinks: the pond's nearest point to where it went in — the
   *  recorded point is outside the water when a fast ball enters mid-step. */
  function sinkPoint(p, q, from) {
    const z = jumpFrom(p, q);
    if (!z) return from;
    // a shaped sea (a polygon, or all but one): it sinks where it went in,
    // a little further on
    if (z.poly) {
      // it went in at p (the last point before the chain sends it back): a
      // little further out from the lane's edge, over the water
      let best = null, bd = Infinity;
      const P = z.poly;
      for (let k = 0; k < P.length; k++) {
        const A = P[k], B = P[(k + 1) % P.length], ex = B[0] - A[0], ey = B[1] - A[1], l2 = ex * ex + ey * ey || 1;
        const u = Math.max(0, Math.min(1, ((p[0] - A[0]) * ex + (p[1] - A[1]) * ey) / l2));
        const cx = A[0] + u * ex, cy = A[1] + u * ey, d = Math.hypot(p[0] - cx, p[1] - cy);
        if (d < bd) (bd = d), (best = [cx, cy]);
      }
      // the chain records the substep before it went over, still on the deck
      // (p inside the lane): then the edge is ahead of it, and it goes in
      // just past the edge on the far side
      const wet = inZone(z, p[0], p[1]);
      let ox = p[0] - best[0], oy = p[1] - best[1], ol = Math.hypot(ox, oy);
      if (ol < 1e-6) return at(p, BALL_R + ground(p[0], p[1]));
      if (!wet) (ox = -ox), (oy = -oy);
      const out = wet ? Math.max(ol, 0.9) : 0.9;
      const x = best[0] + (ox / ol) * out, y = best[1] + (oy / ol) * out;
      return at([x, y], BALL_R + ground(x, y));
    }
    const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2;
    // well inside the water, not on the bank: the rings then have water round them
    let x = Math.min(Math.max(p[0], z.min[0] + 1), z.max[0] - 1);
    let y = Math.min(Math.max(p[1], z.min[1] + 1), z.max[1] - 1);
    if (z.round) {
      const hx = (z.max[0] - z.min[0]) / 2, hz = (z.max[1] - z.min[1]) / 2;
      const ex = (x - cx) / hx, ez = (y - cz) / hz, k = Math.hypot(ex, ez);
      if (k > 0.55) (x = cx + (ex / k) * 0.55 * hx), (y = cz + (ez / k) * 0.55 * hz);
    }
    return at([x, y], BALL_R + ground(x, y));
  }

  /** Through a tunnel: down the mouth, along the tube, out of the exit pipe. */
  function through(z, from, to, round) {
    const cutAt = cut;
    const tube = g.course.userData.tubes && g.course.userData.tubes.get(z);
    if (tube && tube.userData && tube.userData.open) return rideLoop(tube, from, round, 1);
    sound("whoosh");
    // in the tube, the ball is hidden on purpose (the camera shows where it is)
    g.inTube = true;
    return new Promise((settle) => {
      const done = () => ((g.inTube = false), settle());
      // a longer tube (a spiral slide) takes longer, at the same pace as a straight one
      const start = performance.now(), T = tube ? Math.min(2400, Math.max(900, (tube.getLength ? tube.getLength() : 12) * 75)) : 350;
      const tick = (now) => {
        if (round !== g.round || cut !== cutAt) return done();
        const k = Math.min((now - start) / T, 1);
        if (tube) {
          tube.getPoint(k, ball.position); // written in place: no vector a frame
          ball.scale.setScalar(tube.userData && tube.userData.arc ? 1 : 0.7); // inside the pipe, a size smaller (thrown through the air: full size)
        } else {
          ball.position.lerpVectors(from, to, k);
          ball.scale.setScalar(0.2 + 0.8 * k);
        }
        if (k < 1) return requestAnimationFrame(tick);
        ball.position.copy(to);
        ball.scale.setScalar(1);
        done();
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * Round an open loop (zones.js loopTrack): in along the lane from where the
   * ball was, up the track, over the top and down onto the second lane,
   * slower the higher it is, rolling on the deck all the way. upTo < 1 stops
   * at that share of the way to the top, and the ball flies off the track
   * from there back down to `land` (the chain's spot in front of the mouth).
   */
  function rideLoop(tube, from, round, upTo, land = null) {
    const cutAt = cut, U = tube.userData;
    const start0 = tube.getPointAt(0), lead = from.distanceTo(start0);
    const leadT = Math.min(500, (lead / SHOW_SPEED) * 1000);
    const T = Math.min(2600, Math.max(1300, tube.getLength() * 70)) * (upTo < 1 ? 0.55 : 1);
    const uEnd = upTo < 1 ? U.top * upTo : 1;
    const inward = new THREE.Vector3(), prev = from.clone(), d = new THREE.Vector3();
    const spinBy = (p) => {
      d.subVectors(p, prev);
      const l = d.length();
      if (l < 1e-6) return;
      // rolling on the deck: about the axis across the loop (inward x motion)
      inward.subVectors(U.centre, p).projectOnPlane(U.across);
      if (p.y - U.base < 0.6 || inward.lengthSq() < 1e-6) inward.set(0, 1, 0);
      axis.crossVectors(inward.normalize(), d).normalize();
      spin.setFromAxisAngle(axis, l / BALL_R);
      ball.userData.body.quaternion.premultiply(spin);
      prev.copy(p);
    };
    sound("whoosh");
    return new Promise((done) => {
      const start = performance.now();
      let fly = null;
      const tick = (now) => {
        if (round !== g.round || cut !== cutAt) return done();
        const e = now - start;
        if (e < leadT) ball.position.lerpVectors(from, start0, e / leadT);
        else if (!fly) {
          const k = Math.min((e - leadT) / T, 1);
          // an overhit ball rides up at pace: no slowing to a crawl near the top
          const u = upTo < 1 ? uEnd * k : U.pace(k);
          tube.getPointAt(Math.min(u, 1), ball.position);
          if (k >= 1) {
            if (!land) {
              spinBy(ball.position);
              tube.getPointAt(1, ball.position);
              return done();
            }
            // off the track: out of the loop and down in front of it
            fly = { t0: now, a: ball.position.clone(), b: land.clone(), T: 750 };
            sound("whoosh");
          }
        }
        if (fly) {
          const k = Math.min((now - fly.t0) / fly.T, 1);
          ball.position.lerpVectors(fly.a, fly.b, k);
          ball.position.y = fly.a.y + (fly.b.y - fly.a.y) * k * k + 1.2 * Math.sin(Math.PI * k) * (1 - k);
          if (k >= 1) {
            buzz(25);
            sound("thud");
            mood.shake(performance.now());
            return done();
          }
        }
        spinBy(ball.position);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** The open loop this last step flew off: the chain set the ball down at its fall spot. */
  function flewOff(path, i) {
    const tubes = g.course && g.course.userData.tubes;
    if (!tubes || i + 2 !== path.length) return null;
    const [x, y] = path[i + 1];
    for (const z of g.s.zones) {
      const tube = z.kind === "loop" && tubes.get(z);
      if (tube && tube.userData && tube.userData.open && Math.hypot(tube.userData.fall[0] - x, tube.userData.fall[1] - y) < 0.05) return tube;
    }
    return null;
  }

  /**
   * A roll-back into a tube (a loop zone with a tube: island7's castle): the
   * ball reached the mouth moving in, and the chain sends it back out the way
   * it came. Returns { tube, reach } or null. reach is how far up it gets, a
   * fraction of the tube: entry speed / the zone's scale, of half the tube.
   */
  function rollBackAt(path, i) {
    const tubes = g.course && g.course.userData.tubes;
    if (!tubes || !path[i + 1]) return null;
    const [px, py] = path[i - 1], [x, y] = path[i], [nx, ny] = path[i + 1];
    const ix = x - px, iy = y - py, ox = nx - x, oy = ny - y;
    if (ix * ox + iy * oy >= 0) return null; // not a reversal
    for (const z of g.s.zones) {
      if (z.kind !== "loop" || !tubes.get(z)) continue;
      const dx = Math.max(z.min[0] - x, 0, x - z.max[0]), dy = Math.max(z.min[1] - y, 0, y - z.max[1]);
      if (Math.hypot(dx, dy) > 0.7) continue;
      const tube = tubes.get(z), t0 = tube.getTangentAt(0);
      if (ix * t0.x + iy * t0.z <= 0) continue; // it was not going in
      let speed = Math.hypot(ix, iy), frac = Math.min(0.97, speed / (z.scale || 2));
      if (tube.userData && tube.userData.open) {
        // the step into an open mouth ends short at its front: the pace is the
        // substep before's; and it climbs as high as v² takes it
        if (i > 1) speed = Math.max(speed, Math.hypot(px - path[i - 2][0], py - path[i - 2][1]) * 0.92);
        frac = Math.min(0.97, speed / (z.scale || 2)) ** 2;
      }
      return { tube, reach: frac * ((tube.userData && tube.userData.top) || 0.5), speed };
    }
    return null;
  }
  let rolledBack = -1;
  /** Up the tube and back down, like a ball under gravity: slower as it
   *  climbs, faster as it comes down, out at the mouth. */
  function climbBack({ tube, reach }, round) {
    const cutAt = cut;
    const L = tube.getLength(), T = Math.max(450, Math.min(2200, 350 + Math.sqrt(reach * L) * 520));
    return new Promise((done) => {
      const start = performance.now();
      const tick = (now) => {
        if (round !== g.round || cut !== cutAt) return done();
        const k = Math.min((now - start) / T, 1);
        const u = reach * (1 - (2 * k - 1) * (2 * k - 1)); // up, a pause at the top, down
        tube.getPointAt(Math.max(0, u), ball.position);
        ball.scale.setScalar(tube.userData && tube.userData.open ? 1 : 0.7 + 0.3 * (1 - Math.min(1, u * 20))); // an open track: no pipe to shrink into
        if (k < 1) return requestAnimationFrame(tick);
        ball.scale.setScalar(1);
        done();
      };
      requestAnimationFrame(tick);
    });
  }

  /** A hazard step: from inside a hazard zone, straight to its destination. */
  const drowned = (p, q) => { const z = jumpFrom(p, q); return !!z && z.kind === "hazard"; };

  /** The ball sinks where it went in — ripples, a pause — then pops up at the
   *  hazard's destination. 1.4 s in all: long enough to feel the loss. */
  // skin: the hazard's — a serac (mountain) catches the ball in falling ice:
  // no water there, so no rings and no splash, a burst of ice shards instead
  function splashDown(at, back, round, edge = null, skin = "") {
    const cutAt = cut;
    buzz(25);
    // Off a raised edge (a pier, a boardwalk, a crevasse's lip): the water is
    // below. The ball carries on outward in a short falling arc from the edge
    // down to it, and splashes there. It never hovers at deck height.
    const surf = g.course && g.course.userData.surfaceAt ? g.course.userData.surfaceAt(at.x, at.z) : at.y - BALL_R;
    const drop = at.y - BALL_R - surf;
    const fall = drop > 0.25 ? Math.sqrt((2 * drop) / GRAVITY) : 0; // seconds, under gravity
    const from = edge || at.clone();
    const land = at.clone().setY(surf + BALL_R * 0.4);
    return new Promise((done) => {
      const t0 = performance.now();
      let rings = null, start = 0;
      const tick = (now) => {
        if (round !== g.round || cut !== cutAt) {
          if (rings) (scene.remove(rings.group), disposeCourse(rings.group));
          return done();
        }
        // the fall first
        const tf = (now - t0) / 1000;
        if (tf < fall) {
          const k = tf / fall;
          ball.position.lerpVectors(from, land, k); // on outward at its speed
          ball.position.y = from.y + (land.y - from.y) * k * k; // and down, faster and faster
          return requestAnimationFrame(tick);
        }
        if (!rings) {
          start = now;
          at = land;
          if (skin === "serac") {
            sound("thud");
            for (let n = 0; n < 6; n++) causes.at(ball.position, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, { kind: "ice" });
            rings = { group: new THREE.Group(), step() {} };
          } else {
            sound("splash");
            rings = makeSplash(land.clone().setY(surf + 0.5), { open: drop > 0.25 });
          }
          scene.add(rings.group);
        }
        const t = (now - start) / 1000;
        if (round !== g.round || cut !== cutAt) {
          scene.remove(rings.group);
          disposeCourse(rings.group);
          return done();
        }
        rings.step(t);
        if (t < 0.7) {
          const k = t / 0.7;
          ball.position.set(at.x, at.y - k * 1.1, at.z);
          ball.scale.setScalar(1 - k * 0.6);
        } else if (t < 1.1) {
          ball.visible = false;
        } else {
          ball.visible = true;
          const k = Math.min((t - 1.1) / 0.3, 1);
          ball.position.copy(back);
          ball.scale.setScalar(0.3 + 0.7 * k);
        }
        if (t < 1.4) return requestAnimationFrame(tick);
        scene.remove(rings.group);
        disposeCourse(rings.group);
        ball.scale.setScalar(1);
        done();
      };
      requestAnimationFrame(tick);
    });
  }

  /** Walk the path the chain returned. One segment, one slice of time. */
  // The chain says where the ball is in the air ("air": one 0/1 per path
  // point). Each run of 1s is one flight: from the ground point before it to
  // the ground point after, drawn as an arc as high as the flight is long.
  function flightsOf(path, flags) {
    const at = new Map(); // segment index -> { s, e, len, start }
    for (let i = 0; i < path.length; i++) {
      if (flags[i] !== "1" || (i > 0 && flags[i - 1] === "1")) continue;
      const s = Math.max(i - 1, 0);
      let e = i;
      while (e < path.length - 1 && flags[e] === "1") e++;
      const f = { len: 0, starts: [] };
      for (let j = s; j < e; j++) {
        f.starts.push(f.len);
        f.len += Math.hypot(path[j + 1][0] - path[j][0], path[j + 1][1] - path[j][1]);
      }
      f.h = Math.min(0.35 + f.len * 0.16, 2.6);
      // one flight, one arc. The flight's first point is still on the ramp:
      // the ball rolls up it to the crest (the highest ground under the
      // flight) and leaves the ground there; from the crest it flies one
      // parabola down to where the chain lands it. Adding the arc on top of
      // the ground (as before) put the ramp's own hump under the arc: two
      // humps, a "double jump".
      const pt = (d) => {
        let j = s;
        while (j < e - 1 && f.starts[j - s + 1] <= d) j++;
        const a0 = f.starts[j - s], a1 = f.starts[j - s + 1] ?? f.len, k = a1 > a0 ? (d - a0) / (a1 - a0) : 0;
        return [path[j][0] + (path[j + 1][0] - path[j][0]) * k, path[j][1] + (path[j + 1][1] - path[j][1]) * k];
      };
      let crest = 0, top = -Infinity;
      for (let q = 0; q <= 24; q++) {
        const d = (q / 24) * f.len, [x, z] = pt(d), gh = ground(x, z);
        if (gh > top + 1e-6) (top = gh), (crest = d);
      }
      const [lx, lz] = path[e];
      f.crest = crest; f.top = top; f.land = ground(lx, lz);
      for (let j = s; j < e; j++) at.set(j, { f, off: f.starts[j - s], seg: f.starts[j - s + 1] ?? f.len });
    }
    return at;
  }

  function replay(path, holed, flags, why = "") {
    const cutAt = cut;
    path = path.slice();
    const round = g.round;
    // without flags (an older realm) the heights are guessed from the ground
    const flights = typeof flags === "string" && flags.length === path.length ? flightsOf(path, flags) : null;
    return new Promise((settle) => {
      // a frame that throws ends the replay (the shot's finally puts things right)
      const done = () => settle();
      const guard = (f) => (...a) => {
        try {
          return f(...a);
        } catch (err) {
          console.warn("gnogolf: the replay threw", err);
          cut++;
          done();
        }
      };
      const raf = window.requestAnimationFrame;
      const requestAnimationFrame = (f) => raf(guard(f));
      let i = 0;
      rolledBack = -1;
      dropY = null;
      dropT = 0;
      air.y = BALL_R + ground(path[0][0], path[0][1]);
      air.vy = air.gvy = 0;
      air.up = false;
      air.t = 0;
      const step = () => {
        // a restart or a new hole mid-flight ends this replay where it is
        if (i >= path.length - 1 || round !== g.round || cut !== cutAt) return done();

        const from = lift(path[i]), to = lift(path[i + 1]);
        const jump = tunnelled(path[i], path[i + 1]); // do not slide across the board
        // the last step of a holed shot is the ball dropping in: an easy glide
        // to the pin, then down — never a snap across the cup
        const drop = holed && i === path.length - 2;
        // into the water: splash, sink, a beat, then back where the hazard sends it
        if (drowned(path[i], path[i + 1])) {
          const hz = jumpFrom(path[i], path[i + 1]);
          return splashDown(sinkPoint(path[i], path[i + 1], from), to, round, ball.position.clone(), hz && hz.skin).then(() => {
            mood.shake(performance.now());
            air.t = 0;
            i++;
            step();
          });
        }
        const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
        // what it rolls over sounds like what it is
        if (len > 0.08) {
          const [x, y] = path[i];
          const on = g.s.zones.find((z) => z.kind === "surface" && inZone(z, x, y));
          const kind = on && { sand: "sand", wetsand: "sand", ice: "ice", puddle: "puddle", flowerbed: "flowers" }[on.skin];
          if (kind && !(flights && flights.get(i))) sound(kind, Math.min(1, 0.25 + len / 2.2));
        }
        // a bounce: a knock off timber, a boing off a mushroom. The chain marks
        // every one ("b"), glancing and slow ones too; an older realm says
        // nothing, and a sharp turn in the path stands in for it
        if (i > 0) {
          const ax = path[i][0] - path[i - 1][0], ay = path[i][1] - path[i - 1][1], l0 = Math.hypot(ax, ay);
          const cos = l0 > 0.15 && len > 0.15 ? (ax * (path[i + 1][0] - path[i][0]) + ay * (path[i + 1][1] - path[i][1])) / (l0 * len) : 1;
          const told = typeof why === "string" && why.length === path.length;
          if (told ? why[i] === "b" : cos < 0.6) {
            const post = g.s.posts.some((p) => Math.hypot(p.c[0] - path[i][0], p.c[1] - path[i][1]) < p.r + 1.2);
            // louder the faster it hits, never silent
            sound(post ? "boing" : "knock", Math.max(0.2, Math.min(1, Math.max(l0, len) / 2)));
          }
        }
        const ms = drop ? 320 : Math.max(MS_PER_STEP, (len / SHOW_SPEED) * 1000);
        // a roll-back at a tube's mouth: the ball climbs part way into it and
        // slides back down before the path goes on (once per point)
        const back = !jump && i > 0 && rolledBack !== i && rollBackAt(path, i);
        if (back) {
          rolledBack = i;
          return climbBack(back, round).then(() => {
            air.t = 0;
            step();
          });
        }
        // too fast (or slanted) into an open loop: up the track, off it, and down in front
        const off = !jump && flewOff(path, i);
        if (off) {
          return rideLoop(off, from, round, 0.9, to).then(() => {
            air.t = 0;
            i++;
            step();
          });
        }
        if (jump) {
          // the timed pieces where the chain had them as the ball went in (a blowhole spouting)
          clock = (g.tick0 || 0) + i;
          showClock(clock);
          return through(jump, from, to, round).then(() => {
            air.t = 0;
            i++;
            step();
          });
        }
        const start = performance.now();
        // what pushes the ball on this step, from the zones under it: drawn as
        // it rolls, and named the first time in the shot
        const zs = [...g.s.zones, ...((g.forecast && g.forecast.zones) || []), ...strokeZones];
        const vx = path[i + 1][0] - path[i][0], vy = path[i + 1][1] - path[i][1];
        // the chain says what acts on each point ("cause": s slope, w wind, i
        // ice or wet, b bounce, - none); an older realm says nothing, and the
        // zones under the ball are read instead
        const said = typeof why === "string" && why.length === path.length ? why[i + 1] : null;
        const guess = () => causeAt(zs, path[i][0], path[i][1], vx, vy, (g.tick0 || 0) + i);
        const push = jump || drop ? null
          : said == null ? guess()
          // "w" is anything airy to the chain, a timed slope included: it is wind
          // only where a wind or a gust covers the point — a seesaw's plank, a
          // tilting board (another skin) is a slope
          : said === "w" ? (windy(zs, path[i][0], path[i][1]) ? { kind: "wind", vec: (guess() || {}).vec || (g.weather && g.weather.wind) || [vx, vy] } : { kind: "tilt" })
          : said === "s" ? (tilting(zs, path[i][0], path[i][1]) ? { kind: "tilt" } : { kind: "slope" })
          : said === "i" ? { kind: g.weather && (g.weather.rain || g.weather.storm) ? "wet" : "ice" }
          : null;
        const perSec = 1000 / ms;

        let prev = from.clone();
        const tick = (now) => {
          if (round !== g.round || cut !== cutAt) return done();
          const raw = jump ? 1 : Math.min((now - start) / ms, 1);
          // one path step is one substep: the sails are where the chain had them
          // the pieces where the chain had them: the release tick, plus the step
          clock = (g.tick0 || 0) + i + raw;
          showClock(clock);
          const k = drop ? 1 - Math.pow(1 - raw, 2) : raw;
          ball.position.lerpVectors(from, to, k);
          if (!jump && !drop) {
            const fl = flights && flights.get(i);
            if (fl) {
              const F = fl.f, d = fl.off + (fl.seg - fl.off) * k, gh = ground(ball.position.x, ball.position.z);
              if (d <= F.crest) ball.position.y = BALL_R + gh; // still rolling up to the lip
              else {
                const v = (d - F.crest) / Math.max(1e-6, F.len - F.crest);
                // from the lip's height down to the landing's, plus one arc; never
                // through the ground it flies over
                const y = F.top + (F.land - F.top) * v + F.h * 4 * v * (1 - v);
                ball.position.y = BALL_R + Math.max(gh, y);
              }
              // a flight lands where it lands: no fall left over from before it
              dropY = ball.position.y;
              dropV = 0;
              dropT = now;
            } else if (flights) ball.position.y = fallTo(BALL_R + ground(ball.position.x, ball.position.z), now);
            else fly(ball.position);
          }
          if (drop && raw > 0.6) {
            const sink = (raw - 0.6) / 0.4;
            ball.position.y -= sink * 0.9;
            ball.scale.setScalar(1 - sink * 0.5);
          }
          if (push && (push.kind === "slope" || push.kind === "tilt")) glowSlope(path[i][0], path[i][1]);
          if (push) {
            const label = causes.at(ball.position, vx * perSec, vy * perSec, push);
            if (label) (g.cause = { label, at: performance.now() }), publish();
          }
          if (!jump) roll(prev, ball.position);
          prev.copy(ball.position);
          if (jump) ball.scale.setScalar(0.2 + 0.8 * Math.min((now - start) / 160, 1));
          if (raw < 1 || (jump && ball.scale.x < 1)) return requestAnimationFrame(tick);
          if (!drop) ball.scale.setScalar(1);
          i++;
          step();
        };
        requestAnimationFrame(tick);
      };
      step();
    });
  }

  // ----------------------------------------------------------------- boot

  /** hole2 before hole10: the registry is keyed lexicographically, a menu is not. */
  // the chain gives each hole its world and its place in it; an older realm
  // gives neither, and the number in the id orders them
  const byNumber = (a, b) => {
    const n = (h) => {
      if (typeof h.order === "number") return h.order;
      const m = h.id.match(/(\d+)/);
      return m ? Number(m[1]) : Infinity;
    };
    return n(a) - n(b) || a.id.localeCompare(b.id);
  };
  const worldOf = (h) => h.world || "garden";
  const inWorld = () => g.list.filter((h) => worldOf(h) === g.world);

  /**
   * The hole a link names: a realm id (?hole=gno.land/r/…, the old form), or a
   * cup and its place in it (?cup=island&hole=3: the chain's order, else the
   * 3rd of that cup). null when it names nothing on this chain.
   */
  function linked(link) {
    if (!link || !g.list) return null;
    if (link.id) return (g.all || g.list).find((h) => h.id === link.id) || null; // an archived hole too, by its id
    if (!link.cup || !link.n) return null;
    const cup = g.list.filter((h) => worldOf(h) === link.cup);
    return cup.find((h) => Math.round(h.order) === link.n) || cup[link.n - 1] || null;
  }

  async function start(link) {
    const list = await chain.holes();
    if (!alive) return; // destroyed while the chain answered (a remount in dev)
    // a hole another has replaced (same cup, same place) stays playable by its
    // link, but only the current one fills the cup
    g.all = list;
    // the cups hold the course's own holes; anyone else's is a community hole,
    // listed apart and ranked nowhere
    g.list = list.filter((h) => !h.next && h.official !== false).sort(byNumber);
    g.community = list.filter((h) => !h.next && h.official === false);
    if (!g.list.length) throw new Error("no hole is registered on this chain");
    // a string is a realm id, as before
    const asked = linked(typeof link === "string" ? { id: link } : link);
    g.linked = !!asked;
    g.world = asked ? worldOf(asked) : g.world || "garden";
    const first = asked || inWorld()[0] || g.list[0];
    await load(first.id);
    if (!g.s) throw new Error(g.error || "the first hole could not be loaded");
    requestAnimationFrame(frame);
  }

  promo.attach({ g, chain, fire, ball: () => ball, every: () => everyOf(), setClock: (t) => (clock = t) }); // ?promo only
  return {
    start,
    load,
    /** The hole a cup and place name ({ cup, n }), or null. */
    find: (link) => {
      const h = linked(link);
      return h ? h.id : null;
    },
    /** The hole being played. */
    current: () => g.id,
    /** Whether the page's link named a hole that exists here. */
    linked: () => !!g.linked,
    /** Play a world: its first hole, and its holes in the menu. */
    setWorld(w) {
      loadWorld(w).catch(() => {}); // fetched while the player picks a gnome
      if (!g.list || w === g.world) return;
      g.world = w;
      const first = inWorld()[0];
      if (first) load(first.id);
      else publish();
    },
    /** An opaque screen is over the course (or gone): stop drawing it meanwhile. */
    cover(on) {
      g.covered = !!on;
      canvas.tabIndex = on ? -1 : 0; // a hidden course is not a place for Tab to land
    },
    /** Leave the title screen: show the hole whole, then close on the ball. */
    play() {
      g.started = true;
      closeIn = setTimeout(() => setView(home()), OVERVIEW_MS);
    },
    /**
     * Plays a list of "angle,power" shots as a player would, pulling the
     * elastic on screen before each one — for demos and recordings. Goes
     * through fire(), so the chain resolves every shot exactly as usual.
     */
    async demo(list) {
      // A person does not pull straight to the right angle: the aim starts a
      // few degrees off and is corrected, the pull goes a little too far and
      // is eased back, and the pause before letting go is never the same
      // twice. Only the moment of release has to be exact.
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let n = 0;
      for (const item of list) {
        const [deg, power] = item.split(",").map(Number);
        const off = [9, -7, 5, -11][n % 4], over = [1.18, 1.1, 1.22, 1.14][n % 4];
        const pull = 1300 + (n % 3) * 250;
        await wait([900, 1400, 700, 1100][n % 4]); // looking at the course first
        const t0 = performance.now();
        dragging = g.aiming = true;
        await new Promise((res) => {
          const tick = (now) => {
            const k = Math.min((now - t0) / pull, 1);
            // the angle settles on target with a small overshoot of its own
            const settle = Math.exp(-4.5 * k) * Math.cos(7 * k);
            const a = deg + off * settle;
            // the pull rises past the target, then comes back to it
            const p = power * (k < 0.6 ? over * (1 - Math.pow(1 - k / 0.6, 2)) : over + (1 - over) * ((k - 0.6) / 0.4));
            shot = { angle: (a * Math.PI) / 180, power: Math.min(p, MAX_POWER) };
            g.facing = shot.angle;
            g.power = shot.power / MAX_POWER;
            aim.visible = band.visible = true;
            bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
            placeBall();
            preview();
            publish();
            if (k < 1) requestAnimationFrame(tick);
            else res();
          };
          requestAnimationFrame(tick);
        });
        shot = { angle: (deg * Math.PI) / 180, power };
        await wait([450, 700, 350, 600][n % 4]); // holding it, then letting go
        dragging = g.aiming = false;
        dropAim();
        publish();
        await fire(deg, power);
        if (g.done || !alive) return;
        n++;
      }
    },
    /** For screenshots only (?won): the win card as if the hole was just holed. */
    fakeWin(strokes = 2) {
      g.strokes = strokes;
      g.done = g.holed = true;
      onHoled({ id: g.id, strokes });
      publish();
    },
    /** A picture to share: the course as it is now, the score on a card over it. */
    snapshot(caption = "") {
      // drawn and read in the same task, so the drawing buffer is still there
      renderer.render(scene, camera);
      const src = renderer.domElement, W = 1200, H = Math.round((W * src.height) / src.width);
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d");
      x.drawImage(src, 0, 0, W, H);
      x.fillStyle = "#fdf6ea";
      x.strokeStyle = "#16433a";
      x.lineWidth = 5;
      x.beginPath();
      x.roundRect(32, H - 132, W - 64, 100, 22);
      x.fill();
      x.stroke();
      x.fillStyle = "#16433a";
      x.font = "700 44px system-ui, sans-serif";
      x.fillText("Gnogolf", 64, H - 66);
      x.font = "600 34px system-ui, sans-serif";
      x.textAlign = "right";
      x.fillText(caption, W - 64, H - 68);
      return new Promise((r) => c.toBlob(r, "image/png"));
    },
    /** Dismiss a shot error and keep playing. */
    clearError() {
      g.error = null;
      publish();
    },
    /** Swap the gnome; cosmetic only, the chain never sees it. */
    setGnome(id) {
      scene.remove(ball);
      disposeCourse(ball);
      ball = makeBall(gnomeById(id));
      scene.add(ball);
      if (g.s) placeBall();
    },
    /** Graphics: "auto" | "high" | "low". The outlines follow at the next hole
     *  built — now, if no stroke has been played on this one. */
    setGfx(m) {
      gfxMode = ["high", "low"].includes(m) ? m : "auto";
      if (m === "auto") try { localStorage.removeItem(SLOW_KEY); } catch {} // a fresh look at the device
      Object.assign(probe, { t0: 0, prev: 0, gaps: [], done: false });
      if (setTier() && g.id && !g.flying && !(g.shots && g.shots.length)) load(g.id);
      publish();
    },
    /** Toggle between the whole course and the ball. */
    toggleView: () => setView(g.view === "ball" ? "overview" : "ball"),
    /** The aim mode for the next round ("assisted" | "pro"); a round under way is restarted. */
    setMode(m) {
      mode = m === "pro" ? "pro" : "assisted";
      if (g.shots && g.shots.length && g.roundMode !== mode) (newRound(), setView(home()));
      publish();
    },
    /** ?camlog only: [yaw°, distance to the ball, widening] per frame. */
    camLog: () => camLog.splice(0),
    /** ?camlog only: the ball and a point 3 units along the aim, on screen (y up), and the gnome's visibility. */
    camAim: () => {
      const B = ball.position, p = ndcTop.set(B.x + Math.cos(shot.angle) * 3, B.y, B.z + Math.sin(shot.angle) * 3).project(camera);
      const px = p.x, py = p.y, q = ndcBot.copy(B).project(camera);
      return { ball: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(3)], ahead: [+px.toFixed(2), +py.toFixed(2)], seen: !occluded(camera.position, headAt.copy(B).setY(B.y + 0.7)) }; // the same test the camera uses
    },
    /** ?camlog only: the ground along the camera→head line. */
    sightProbe: () => {
      const B = ball.position, P = camera.position, out = { ball: B.toArray().map((v) => +v.toFixed(2)), groundAtBall: +ground(B.x, B.z).toFixed(2), cam: P.toArray().map((v) => +v.toFixed(2)), line: [] };
      for (let k = 1; k < 8; k++) { const t = k / 8, x = B.x + (P.x - B.x) * t, z = B.z + (P.z - B.z) * t; out.line.push([+(B.y + 0.7 + (P.y - B.y - 0.7) * t).toFixed(2), +ground(x, z).toFixed(2)]); }
      return out;
    },
    /** ?camlog only: the meshes in view now, by their parent's name (what draws). */
    inView: () => {
      const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const out = {};
      scene.traverseVisible((o) => {
        if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
        if (o.frustumCulled !== false && o.geometry && !f.intersectsObject(o)) return;
        let k = o.name || "", p = o.parent;
        while (!k && p) (k = p.name || (p.userData && p.userData.kind) || ""), (p = p.parent);
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
        k = `${o.type} r${Math.round(r)} d${Math.round(c.distanceTo(camera.position))} v${o.geometry.attributes.position ? o.geometry.attributes.position.count : 0}${o.isInstancedMesh ? " inst" + o.count : ""}`;
        out[k] = (out[k] || 0) + 1;
      });
      return out;
    },
    /** ?camlog only: which way the camera looks across the board (radians). */
    camHeading: () => { const d = camera.getWorldDirection(ndcTop); return Math.atan2(d.z, d.x); },
    /** ?camlog only: the follow's inner state. */
    camInner: () => ({ swing: +swing.toFixed(2), pen, rise: +rise.toFixed(2), wide: +wide.toFixed(2), yaw: +yaw.toFixed(2) }),
    /** ?camlog only: how much of the view is right in front of the lens — the share of a 5×5 grid of rays that hit the scene nearer than 2. */
    lensFill: () => {
      const rc = new THREE.Raycaster(), v = new THREE.Vector2();
      rc.camera = camera;
      rc.far = 2;
      let near = 0;
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) {
          rc.setFromCamera(v.set(-0.8 + i * 0.4, -0.8 + j * 0.4), camera);
          // (lines are picked up a whole unit wide: bunting wires, not a wall in the face)
          const hit = rc.intersectObjects(scene.children, true).find((h) => h.object.visible && !h.object.isSprite && !h.object.isPoints && !h.object.isLine && h.object !== marker && !(h.object.material && h.object.material.transparent && h.object.material.opacity < 0.5));
          if (hit) {
            near++;
            if (!hit.object.geometry.boundingSphere) hit.object.geometry.computeBoundingSphere();
            const r = Math.round(hit.object.geometry.boundingSphere.radius * hit.object.matrixWorld.getMaxScaleOnAxis());
            lensWho[r] = (lensWho[r] || 0) + 1;
          }
        }
      return near / 25;
    },
    /** ?camlog only: the radius of what the lens probe hit, counted. */
    lensWho: () => lensWho,
    /** ?camlog only: the pull as it stands. */
    pullState: () => ({ power: +shot.power.toFixed(2), deg: shot.deg, aiming: !!g.aiming, band: band.visible, flying: !!g.flying, strokes: g.strokes }),
    /** ?camlog only: the scene's objects: all, empty groups, drawables, matrices recomposed each frame. */
    census: () => {
      const c = { objects: 0, empty: 0, draws: 0, auto: 0, weather: g.weather ? Object.keys(g.weather).filter((k) => g.weather[k]).join(",") : "" };
      scene.traverse((o) => {
        c.objects++;
        if (!o.children.length && (o.type === "Group" || o.type === "Object3D")) c.empty++;
        if (o.isMesh || o.isLine || o.isPoints || o.isSprite) c.draws++;
        if (o.matrixAutoUpdate) c.auto++;
      });
      return c;
    },
    /** ?camlog only: fake the weather now ("fog,storm"…, "" for the forecast's). */
    fakeWeather: (w) => ((fakeWeather = w), applyWeather()),
    /** ?camlog only: the timed pieces' clock (substeps). */
    clock: () => clock,
    /** ?camlog only: the last hole's [build, shader compile] time, ms. */
    buildMs: () => g.buildMs,
    /** ?camlog only: where the camera is now. */
    camPose: () => camera.position.toArray(),
    /** The camera: "classic" | "far" | "third". */
    setCam(m) {
      g.cam = ["classic", "far", "third"].includes(m) ? m : "classic";
      // every switch starts clean: the chase state reset, a pull under way
      // dropped, and the pose eased from where the camera actually is
      resetFollow();
      if (dragging) (dragging = g.aiming = false), (press = null), dropAim();
      setView(home());
    },
    reset() {
      newRound();
      setView(home());
    },
    shoot: fire,
    chain,
    destroy() {
      alive = false;
      window.removeEventListener("pointermove", onHover);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pointermove", onWake);
      window.removeEventListener("keydown", onWake);
      document.removeEventListener("visibilitychange", onHide);
      weather.dispose();
      causes.dispose();
      ambience({});
      clearTimeout(closeIn);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("lostpointercapture", onCancel);
      clearTimeout(holedIn);
      clearTimeout(joyIn);
      clearTimeout(later);
      clearTimeout(toldLater);
      if (asked) asked.abort();
      cut++; // every animation still running stops at its next frame
      if (g.course) disposeCourse(g.course);
      for (const o of [ball, aim, band, confetti && confetti.group, confettiWarm.group]) if (o) disposeCourse(o);
      renderer.dispose();
    },
  };
}
