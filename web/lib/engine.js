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
import { loadWorld } from "./scene/worlds.js";
import { makeChain, shotOf, pullShot } from "./chain.js";
import {
  makeRenderer, makeScene, maxDpr, buildHole, makeBall, makeAim, aimAlong, at,
  courseBox, overviewRig, focusRig, applyRig, easeRig, makeBand, bandTo, gnomeById, makeConfetti, makeSplash, disposeCourse, setTime, buildExtras, setLighting,
} from "./scene.js";
import { BALL_R, inZone } from "./terrain.js";

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

export function createGame(canvas, { rpc, web, gnome, world: forceWorld = "", weather: fakeWeather = "", onChange = () => {}, onHoled = () => {} } = {}) {
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
  const faked = () => fakeWeather && [
    fakeWeather.includes("wind") && { skin: "wind", vec: [0.05, -0.03] },
    fakeWeather.includes("rain") && { skin: "rain", vec: [0, 0] },
    fakeWeather.includes("fog") && { skin: "fog", vec: [0, 0] },
    fakeWeather.includes("storm") && { skin: "storm", vec: [0, 0] },
  ].filter(Boolean);
  // near 3, far 260: the whole of any cup's scenery (measured, 210 at most on the
  // island overview, and the lean) with three times the depth precision of
  // 1..400 — what kept far-off faces from flickering into each other
  const camera = new THREE.PerspectiveCamera(30, 1, 3, 260);
  let ball = makeBall(gnomeById(gnome));
  const aim = makeAim();
  // The direction, drawn here the instant you pull and whatever the chain is
  // doing: a short arrow from the ball, as long as the pull is strong. The
  // chain's dots then show where the ball really goes. Drawn over everything
  // (rain, fog, the ground), so the player is never without a direction.
  const arrow = (() => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const edge = new THREE.MeshBasicMaterial({ color: 0x16433a, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.22), mat);
    const shaftEdge = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.36), edge);
    const tri = new THREE.Shape([new THREE.Vector2(0, 0.42), new THREE.Vector2(0.62, 0), new THREE.Vector2(0, -0.42)]);
    const triEdge = new THREE.Shape([new THREE.Vector2(-0.08, 0.56), new THREE.Vector2(0.78, 0), new THREE.Vector2(-0.08, -0.56)]);
    const head = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat), headEdge = new THREE.Mesh(new THREE.ShapeGeometry(triEdge), edge);
    for (const m of [shaftEdge, headEdge]) m.renderOrder = 20;
    for (const m of [shaft, head]) m.renderOrder = 21;
    g.add(shaftEdge, shaft, headEdge, head);
    g.rotation.x = -Math.PI / 2; // lies flat, x along the shot
    const pivot = new THREE.Group();
    pivot.add(g);
    pivot.visible = false;
    pivot.userData = { shaft, shaftEdge, head, headEdge };
    return pivot;
  })();
  scene.add(arrow);
  function pointArrow() {
    if (!g.aiming || !(shot.power > 0.05) || !g.ball) return void (arrow.visible = false);
    const len = 1.2 + (shot.power / MAX_POWER) * 3.8;
    const { shaft, shaftEdge, head, headEdge } = arrow.userData;
    shaft.scale.x = shaftEdge.scale.x = len;
    shaft.position.x = shaftEdge.position.x = 0.7 + len / 2;
    head.position.x = headEdge.position.x = 0.7 + len;
    arrow.position.set(g.ball.x, BALL_R + ground(g.ball.x, g.ball.y) - 0.35, g.ball.y);
    arrow.rotation.y = -shot.angle;
    arrow.visible = true;
  }
  const band = makeBand();
  scene.add(ball, aim, band);
  let confetti = null;
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
  let holedIn = 0; // the banner's delay after a hole, so the confetti can fly
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
  const publish = () =>
    alive &&
    ((told.aiming = !!g.aiming), (told.bar = Math.round((g.power || 0) * 40)), true) &&
    onChange({
      holes: g.list ? inWorld() : [],
      allHoles: g.list || [], // every cup's, for the cup totals and the grand slam
      world: g.world,
      linked: !!g.linked, // the page's link named a hole that exists
      // this hole's place in its cup, for the address bar and shared links
      place: g.s ? Math.max(1, inWorld().findIndex((h) => h.id === g.id) + 1) : 0,
      look: (g.s && g.s.world) || g.world || "garden", // the world this hole is dressed as
      // how many holes each world has on this chain, for the world screen
      worlds: g.list ? g.list.reduce((m, h) => ((m[worldOf(h)] = (m[worldOf(h)] || 0) + 1), m), {}) : {},
      id: g.id,
      name: g.s ? g.s.name : "",
      by: g.s ? g.s.by : "",
      source: g.s ? chain.sourceURL(g.s.by) : "#",
      strokes: g.strokes,
      timed: !!(g.s && g.s.timed),
      time: g.course ? g.course.userData.time : "day",
      // what a shot is tested against, for the gas estimate before signing
      // walls, posts and zones, plus what a timed hole adds each stroke
      pieces: g.s ? g.s.walls.length + g.s.posts.length + g.s.zones.length + (g.s.timed ? 8 : 0) : 0,
      shots: g.shots || [],
      flying: g.flying,
      aiming: g.aiming,
      power: g.power,
      holed: g.holed,
      error: g.error,
      weather: g.weather || null, // { wind: [x, y] | null, rain, fog, storm } for the HUD
      flash: g.flash || 0,
      period: g.period == null ? null : g.period, // the round's weather quarter hour: what a record is played in
      cause: g.cause || null, // a word on why the ball speeds up or drifts, once a shot
      note: g.note || null, // a word on how the shot went
      errorKind: g.error ? g.errorKind : null,
      view: g.view,
    });

  // ------------------------------------------------------------- rendering

  let alive = true;
  // A slow GPU (seen on some Safari and Firefox setups) gets a lighter canvas:
  // the first 2 s of drawing are timed, and a median frame over 20 ms drops
  // the pixel ratio to 1, once.
  let dprCap = Infinity;
  // only frames drawn back to back count (an idle scene is drawn at 20 fps on purpose)
  const probe = { t0: 0, prev: 0, gaps: [] };
  function probeFrame(now, busy) {
    if (dprCap !== Infinity || probe.done) return;
    if (!busy) return void (probe.prev = 0);
    if (!probe.t0) probe.t0 = now;
    if (probe.prev) probe.gaps.push(now - probe.prev);
    probe.prev = now;
    if (now - probe.t0 < 2000 && probe.gaps.length < 90) return;
    probe.done = true;
    const d = probe.gaps.sort((a, b) => a - b);
    if (d.length > 10 && d[d.length >> 1] > 20) {
      dprCap = 1;
      console.info("gnogolf: slow frames, drawing at pixel ratio 1");
      resize();
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
      const span = g.s.board.w * 0.22 + 3;
      leant.target.copy(g.over.target);
      leant.target.x += lean.x * span;
      leant.target.z += lean.y * span * 0.25;
      leant.dist = g.over.dist;
      leant.ox = g.over.ox;
      leant.oy = g.over.oy;
      return leant;
    }
    // in flight, follow the ball; at rest, keep the cup in the picture too
    if (g.flying || !g.s) return focusRig(ball.position, g.over, screen(), null, focus);
    cupAt.set(g.s.cup[0], ball.position.y, g.s.cup[1]);
    return focusRig(ball.position, g.over, screen(), cupAt, focus);
  }

  function setView(v) {
    clearTimeout(closeIn);
    g.view = v;
    publish();
  }
  window.addEventListener("resize", resize);

  let last = 0;
  // What the GPU is spared: nothing is drawn behind an opaque screen (the
  // title, the cups, the picker) or in a hidden tab, and a still scene — no
  // shot, no aim, the camera settled, only the garden breathing — is drawn at
  // 30 frames a second instead of the display's 60 or 120.
  // idle: 30 fps while the weather or timed pieces move, 20 when only the
  // garden breathes
  const IDLE_MS = 1000 / 30, STILL_MS = 1000 / 20;
  let settled = false;
  function frame(now) {
    if (!alive) return;
    requestAnimationFrame(frame);
    if (!g.started || g.covered || document.hidden) return (last = now);
    const busy = g.flying || dragging || growing.length || confetti || righting || !settled || everyOf() > 0;
    const still = !g.weather;
    if (!busy && now - last < (still ? STILL_MS : IDLE_MS) - 2) return;
    probeFrame(now, busy);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (g.rig) {
      // a flying ball is followed closely, or a hard shot leaves the frame
      const to = goal();
      easeRig(g.rig, to, 1 - Math.exp(-dt * (g.flying ? 7 : 3.2)));
      applyRig(camera, g.rig, screen());
      settled = g.rig.target.distanceTo(to.target) < 0.01 && Math.abs(g.rig.dist - to.dist) < 0.01 && Math.abs(g.rig.ox - to.ox) < 0.5 && Math.abs(g.rig.oy - to.oy) < 0.5;
    }
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
      clock += dt * (reduced ? 1.5 : 3.5);
      showClock(clock);
      // aiming at moving pieces: the dots follow them
      if (dragging && everyOf() && now - lastTickPreview > 250) (lastTickPreview = now), preview();
    }
    // a world's canopy fades what stands between the camera and the ball
    if (g.course && g.course.userData.fade) g.course.userData.fade(camera.position, ball.position);
    weather.tick(now / 1000);
    causes.tick(now / 1000);
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
  let loads = 0;
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
    extras = null;
    extrasFor = "";
    growing = [];
    try {
      g.course = buildHole(g.s);
    } catch (err) {
      // our bug, not the chain's: say so, and leave the game usable
      console.error(err);
      g.course = null;
      g.error = String(err.message || err);
      g.errorKind = "draw";
      return publish();
    }
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
    renderer.compile(scene, camera); // shaders now, not on the player's first click
    g.rig = null; // a new hole starts from its overview, not from the last one
    resize();
    setView("overview");
    if (g.started) closeIn = setTimeout(() => setView("ball"), OVERVIEW_MS);
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
  // replays cut by the safety net: every animation of the one cut stops
  let cut = 0; // each animation keeps the value it started with (cutAt)
  let shown = null; // the aim the dots on screen were computed for (see interpolate)
  const straight = [[0, 0], [0, 0]]; // the provisional line, until the chain answers
  // the aim put away: no dots, no elastic, nothing turned
  // the dashed outlines of timed pieces that are away, shown only while aiming
  const ghosts = (on) => g.course && g.course.userData.ghosts && g.course.userData.ghosts(on);
  const dropAim = () => {
    ghosts(false);
    arrow.visible = false;
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
    const px = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
    if (px < 6) return;
    // both ends through the camera as it is now: an easing camera moves the
    // board under a still hand, and must not turn the shot
    const from = boardPoint(press), to = boardPoint(ev);
    if (!from || !to) return;
    const { deg, power } = pullShot(px, window.innerWidth, window.innerHeight, Math.atan2(from.y - to.y, from.x - to.x), MAX_POWER);
    shot.angle = (deg * Math.PI) / 180;
    shot.deg = deg;
    shot.power = power;
    g.facing = shot.angle;
    g.power = shot.power / MAX_POWER;
    creak();

    aim.visible = band.visible = true;
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    pointArrow();
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
  canvas.tabIndex = 0;
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
    aim.visible = band.visible = true;
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    pointArrow();
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
      res = await chain.simulateRound(g.id, [...g.shots, shotOf(angleDeg, power, tick)], g.period);
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
    g.shots.push(shotOf(angleDeg, power, tick));
    g.tick0 = tick || 0;
    g.strokes = res.strokes;
    if (res.holed) {
      g.done = true; // no more shots, even before the banner shows
      onHoled({ id: g.id, strokes: res.strokes });
      setTimeout(() => alive && round === g.round && mood.joy(performance.now()), 500);
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
      if ((z.kind !== "tunnel" && z.kind !== "hazard") || Math.abs(q[0] - z.vec[0]) > 1e-3 || Math.abs(q[1] - z.vec[1]) > 1e-3) continue;
      const dx = Math.max(z.min[0] - p[0], 0, p[0] - z.max[0]), dz = Math.max(z.min[1] - p[1], 0, p[1] - z.max[1]);
      const d = Math.hypot(dx, dz);
      if (d < bd) (bd = d), (best = z);
    }
    return best;
  };
  const tunnelled = (p, q) => { const z = jumpFrom(p, q); return z && z.kind === "tunnel" ? z : null; };

  // The aim is the chain's own answer: while the player pulls, the shot is
  // previewed with Simulate (read-only, free) and the dots follow the path it
  // returns, bounces included. One request in flight at a time; the latest
  // pull wins.
  let asking = false, wanted = null;
  // Throttled: the node replays the whole round for every preview, so a pull
  // asks at most every PREVIEW_MS, and not at all for a change too small to see.
  const PREVIEW_MS = 70;
  let sent = null, sentAt = 0, later = 0;
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
    // no answer from the chain yet for this pull: a straight line of dots
    // along the aim, replaced by the chain's the moment it lands
    if (!shown && g.ball) {
      const len = 2 + (shot.power / MAX_POWER) * 16;
      straight[0][0] = g.ball.x, straight[0][1] = g.ball.y;
      straight[1][0] = g.ball.x + Math.cos(shot.angle) * len, straight[1][1] = g.ball.y + Math.sin(shot.angle) * len;
      aimAlong(aim, straight, shot.power, ground);
      aim.visible = true;
    }
    wanted = { angle: shot.angle, deg: shot.deg, power: shot.power, shots: g.shots, id: g.id };
    if (asking) return;
    // asked again only when the aim changed, or the pieces moved on
    if (sent && sent.id === wanted.id && sent.n === wanted.shots.length && sent.tick === tickNow() &&
        Math.abs(sent.angle - wanted.angle) < 0.005 && Math.abs(sent.power - wanted.power) < 0.05) return;
    const wait = PREVIEW_MS - (performance.now() - sentAt);
    if (wait > 0) {
      clearTimeout(later);
      later = setTimeout(() => dragging && preview(), wait);
      return;
    }
    asking = true;
    sentAt = performance.now();
    const q = (sent = { ...wanted, n: wanted.shots.length, round: g.round, tick: tickNow() });
    // a chain slow to answer does not hold the aim: after 1.5 s the request is
    // let go, and the next one (the latest aim) goes out
    chain
      .simulateRound(q.id, [...q.shots, shotOf(q.deg != null ? q.deg : (q.angle * 180) / Math.PI, q.power, q.tick)], g.period, 1500)
      .then((res) => {
        if (dragging && q.id === g.id && q.round === g.round && q.n === g.shots.length) {
          aimAlong(aim, fogged(res.path), q.power, ground, landing, dotTint(q));
          shown = { angle: q.angle };
          aim.rotation.y = 0;
          aim.position.set(0, 0, 0);
          interpolate();
        }
      })
      .catch(() => {})
      .finally(() => {
        asking = false;
        if (dragging && wanted !== q) preview();
      });
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

  // The dots take the colour of what bends them: wind blue, a downhill slope
  // gold, ice or a wet green cyan — the same causes the replay shows.
  const TINT = { wind: new THREE.Color(0x8fc9ff), slope: new THREE.Color(0xffd36b), ice: new THREE.Color(0x9ff3ff), wet: new THREE.Color(0x9ff3ff) };
  const dotTint = (q) => {
    const zs = [...g.s.zones, ...((g.forecast && g.forecast.zones) || []), ...strokeZones];
    const vx = Math.cos(q.angle), vy = Math.sin(q.angle), t = q.tick || 0;
    return (i, x, z) => {
      const c = causeAt(zs, x, z, vx, vy, t);
      return c ? TINT[c.kind] : null;
    };
  };

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
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      const x = p[0] + (dx / l) * 0.8, y = p[1] + (dy / l) * 0.8;
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
    sound("whoosh");
    return new Promise((done) => {
      const start = performance.now(), T = tube ? 900 : 350;
      const tick = (now) => {
        if (round !== g.round || cut !== cutAt) return done();
        const k = Math.min((now - start) / T, 1);
        if (tube) {
          const p = tube.getPoint(k);
          ball.position.copy(p);
          ball.scale.setScalar(0.7); // inside the pipe, a size smaller
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

  /** A hazard step: from inside a hazard zone, straight to its destination. */
  const drowned = (p, q) => { const z = jumpFrom(p, q); return !!z && z.kind === "hazard"; };

  /** The ball sinks where it went in — ripples, a pause — then pops up at the
   *  hazard's destination. 1.4 s in all: long enough to feel the loss. */
  function splashDown(at, back, round) {
    const cutAt = cut;
    buzz(25);
    sound("splash");
    return new Promise((done) => {
      const start = performance.now();
      const rings = makeSplash(at);
      scene.add(rings.group);
      const tick = (now) => {
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
          return splashDown(sinkPoint(path[i], path[i + 1], from), to, round).then(() => {
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
        // a sharp turn is a bounce: a knock off timber, a boing off a mushroom
        if (i > 0 && len > 0.15) {
          const ax = path[i][0] - path[i - 1][0], ay = path[i][1] - path[i - 1][1], l0 = Math.hypot(ax, ay);
          const cos = l0 > 0.15 ? (ax * (path[i + 1][0] - path[i][0]) + ay * (path[i + 1][1] - path[i][1])) / (l0 * len) : 1;
          if (cos < 0.6) {
            const post = g.s.posts.some((p) => Math.hypot(p.c[0] - path[i][0], p.c[1] - path[i][1]) < p.r + 1.2);
            sound(post ? "boing" : "knock", Math.min(1, len / 2));
          }
        }
        const ms = drop ? 320 : Math.max(MS_PER_STEP, (len / SHOW_SPEED) * 1000);
        if (jump) {
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
          : said === "w" ? { kind: "wind", vec: (guess() || {}).vec || (g.weather && g.weather.wind) || [vx, vy] }
          : said === "s" ? { kind: "slope" }
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
              const u = (fl.off + (fl.seg - fl.off) * k) / fl.f.len;
              ball.position.y = BALL_R + ground(ball.position.x, ball.position.z) + fl.f.h * 4 * u * (1 - u);
            } else if (flights) ball.position.y = BALL_R + ground(ball.position.x, ball.position.z);
            else fly(ball.position);
          }
          if (drop && raw > 0.6) {
            const sink = (raw - 0.6) / 0.4;
            ball.position.y -= sink * 0.9;
            ball.scale.setScalar(1 - sink * 0.5);
          }
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
    if (link.id) return g.list.find((h) => h.id === link.id) || null;
    if (!link.cup || !link.n) return null;
    const cup = g.list.filter((h) => worldOf(h) === link.cup);
    return cup.find((h) => Math.round(h.order) === link.n) || cup[link.n - 1] || null;
  }

  async function start(link) {
    const list = await chain.holes();
    if (!alive) return; // destroyed while the chain answered (a remount in dev)
    g.list = list.sort(byNumber);
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

  return {
    start,
    load,
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
    },
    /** Leave the title screen: show the hole whole, then close on the ball. */
    play() {
      g.started = true;
      closeIn = setTimeout(() => setView("ball"), OVERVIEW_MS);
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
    /** Toggle between the whole course and the ball. */
    toggleView: () => setView(g.view === "ball" ? "overview" : "ball"),
    reset() {
      newRound();
      setView("ball");
    },
    shoot: fire,
    chain,
    destroy() {
      alive = false;
      window.removeEventListener("pointermove", onHover);
      window.removeEventListener("blur", onCancel);
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
      clearTimeout(later);
      cut++; // every animation still running stops at its next frame
      if (g.course) disposeCourse(g.course);
      for (const o of [ball, aim, band, arrow, confetti && confetti.group]) if (o) disposeCourse(o);
      renderer.dispose();
    },
  };
}
