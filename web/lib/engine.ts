// The loop: aim, ask the chain, replay what it answered.
//
// Nothing here simulates a ball. A shot is resolved by the realm and comes back
// as a list of positions; the only job left is to walk along them. The engine
// owns the canvas and the pointer; it reports what it is doing through
// onChange, and the interface is free to be whatever it likes.
//
// Its parts: engine/camera.ts (where the camera goes), engine/aim.ts (the
// preview dots), engine/replay.ts (walking the chain's path), and
// engine/probes.ts (the ?camlog test hooks). This file holds the game's state,
// the frame loop, loading, the weather and the clock, input and the shot.

import * as THREE from "three";
import { buzz, sound, ambience, setSilent } from "./feel";
import { makeWeather } from "./scene/weather";
import { makeCauses } from "./scene/cause";
import { loadWorld } from "./scene/worlds";
import { makeChain, shotOf, pullShot, isHoleId, RULES } from "./chain";
import { cupOf, legacyOf, oldToSlot } from "./card";
import {
  makeRenderer, makeScene, maxDpr, buildHole, finishHole, makeBall, makeAim, at,
  courseBox, laneBox, overviewRig, farRig, makeBand, bandTo, gnomeById, makeConfetti, disposeCourse, setTime, buildExtras, setLighting, quality, motion,
} from "./scene";
import { BALL_R } from "./terrain";
import { makeCamera } from "./engine/camera";
import { pace, slowFrames, frameMs, SLOW_KEY } from "./engine/pace";
import { makeReplay, MS_PER_STEP, SHOW_SPEED } from "./engine/replay";
import { makeAimer, thirdAim } from "./engine/aim";
import type { Extras, HoleRow, Mode, Post, Stroke, Wall, Zone } from "./types";
import { md, ud, type Course, type Gnome, type Hole } from "./scene/data";
import { isDrawn } from "./scene/materials";
import type { WeatherZone } from "./scene/weather";
import type { Confetti } from "./scene/fx";
import type { promo as Promo } from "./promo";
import type { probes as Probes } from "./engine/probes";
import { HOT as HOT_FIELDS, TICKS_PER_S, type CamMode, type ErrorKind, type GameState, type GfxMode, type Link, type Live, type Mood, type Shot, type Snapshot, type Tier } from "./engine/types";

export type { CamMode, GameState, GfxMode, Link, Snapshot } from "./engine/types";
export type Game = ReturnType<typeof createGame>;

/** What createGame takes: the chain's addresses, the looks, and who to tell. */
export interface GameOptions {
  rpc?: string;
  web?: string;
  gnome?: string;
  world?: string;
  weather?: string;
  aimMode?: Mode;
  camMode?: CamMode;
  gfx?: GfxMode;
  /** the trailer's capture rig (lib/promo.ts) and the test hooks (engine/probes.ts):
   *  the page loads them only when its link asks for them */
  promo?: typeof Promo;
  probes?: typeof Probes;
  /** ?camlog: the camera logs every frame (for the probes' camLog) */
  log?: boolean;
  onChange?: (snap: Snapshot) => void;
  onHoled?: (r: { id: string; strokes: number }) => void;
}

/** A thrown value's message, for the HUD. */
const errText = (e: unknown) => String((e instanceof Error && e.message) || e);
const camOf = (m: string): CamMode => (m === "far" || m === "third" ? m : "classic");
const gfxOf = (m: string): GfxMode => (m === "high" || m === "low" ? m : "auto");

// the realm's limits: the strokes one round holds (a save of more than 12 goes in several commits), the power of a shot
const { maxRoundStrokes, maxPower: MAX_POWER } = RULES;
// zones as the work model counts them: one piece each, and one per polygon edge
const piecesOf = (zs: readonly { poly?: readonly unknown[] }[]) => zs.reduce((n, z) => n + 1 + ((z.poly && z.poly.length) || 0), 0);
// the part of the screen the HUD covers, in CSS pixels: the camera frames
// what is left, so the course is centred in what the player can actually see
const HUD = { top: 108, bottom: 136, side: 14 };
const OVERVIEW_MS = 1500; // how long a new hole is shown whole before closing on the ball

/** No trailer rig: what the engine calls on it does nothing. */
const NO_PROMO: typeof Promo = { on: false, attach() {}, camera() {} };

export function createGame(canvas: HTMLCanvasElement, { rpc, web, gnome, world: forceWorld = "", weather: fakeWeather0 = "", aimMode = "assisted", camMode = "classic", gfx = "auto", promo = NO_PROMO, probes, log: logCam = false, onChange = () => {}, onHoled = () => {} }: GameOptions = {}) {
  const chain = makeChain({ rpc, web });

  const renderer = makeRenderer(canvas);
  const scene = makeScene();
  // a storm's lightning: the scene lights up, the page flashes (silently)
  const causes = makeCauses(scene);
  const weather = makeWeather(scene, {
    camera: () => camera, // made further down
    onFlash() {
      g.flash = (g.flash || 0) + 1;
      void publish();
    },
  });
  // ?weather= fakes a forecast, for screenshots
  let fakeWeather = fakeWeather0;
  const faked = (): WeatherZone[] | "" => fakeWeather && (["wind", "rain", "fog", "storm", "snow"] as const)
    .filter((skin) => fakeWeather.includes(skin))
    .map((skin): WeatherZone => ({ skin, vec: skin === "wind" ? ([0.05, -0.03] as const) : ([0, 0] as const) }))
    // a storm as the chain has it: its wind in two gusts 40° either side, taking turns
    .concat(fakeWeather.includes("storm") && g.s ? [0.7, -0.7].map((a, k): WeatherZone => ({ skin: "wind", vec: [0.11 * Math.cos(a), 0.11 * Math.sin(a)], min: [0, 0], max: [g.s!.board.w, g.s!.board.h], every: 6, on: 3, phase: 3 * k })) : []);
  // near 3, far 260: the whole of any cup's scenery (measured, 210 at most on the
  // island overview, and the lean) with three times the depth precision of
  // 1..400 — what kept far-off faces from flickering into each other
  const camera = new THREE.PerspectiveCamera(30, 1, 3, 260);
  let ball: Gnome = makeBall(gnomeById(gnome));
  const aim = makeAim();
  const band = makeBand();
  scene.add(ball, aim, band);
  let confetti: Confetti | null = null;
  // a burst done or replaced: out of the scene, its GPU memory freed
  const dropConfetti = () => {
    if (!confetti) return;
    scene.remove(confetti.group);
    disposeCourse(confetti.group);
    confetti = null;
  };
  // a burst kept hidden, so its shader compiles with the hole's (warm), not on the winning putt
  const confettiWarm = makeConfetti([0, 0]);
  confettiWarm.group.visible = false;
  scene.add(confettiWarm.group);
  let blinkAt = 0, blinkUntil = 0;
  // small moods of the gnome: a hop of joy when he holes out, a head shake
  // when he comes out of the water. Cosmetic, timed on the page clock.
  let joyUntil = 0, shakeUntil = 0;
  const mood: Mood = {
    joy(now) { joyUntil = now + 1400; },
    shake(now) { shakeUntil = now + 900; },
    hop(now) { return now < joyUntil ? Math.abs(Math.sin((joyUntil - now) / 110)) * 0.7 : 0; },
    tick(now) {
      const body = ball.userData.body;
      if (now < shakeUntil) body.rotation.z = Math.sin(now / 45) * 0.35 * ((shakeUntil - now) / 900);
      else if (body.rotation.z && !g.flying) body.rotation.z *= 0.8;
    },
  };
  let holedIn: ReturnType<typeof setTimeout> | undefined, joyIn: ReturnType<typeof setTimeout> | undefined; // the banner's delay after a hole, so the confetti can fly; the hop's
  let righting: { from: THREE.Quaternion; to: THREE.Quaternion; t: number } | null = null; // the gnome getting back on his feet after a roll

  const g: GameState = {
    list: [], id: null, s: null, course: null,
    ball: { x: 0, y: 0 }, strokes: 0, flying: false,
    facing: Math.PI / 2, power: 0, aiming: false, holed: false, error: null,
    // the camera: "overview" frames the island, "ball" follows the gnome
    view: "overview", rig: null, over: null, started: false,
    cam: "classic", shots: [], pts: [], rest: null,
  };
  let closeIn: ReturnType<typeof setTimeout> | undefined;
  /** The ground height under a board point — cosmetic, the chain's physics is flat. */
  const ground = (x: number, z: number) => (g.course ? g.course.userData.height(x, z) : 0);
  const lift = (p: readonly [number, number]) => at(p, BALL_R + ground(p[0], p[1]));
  // the camera mode (engine/camera.ts): the rig on the gnome, the whole hole, or behind him
  g.cam = camOf(camMode);
  const home = () => (g.cam === "far" ? "overview" : "ball");

  // The interface is told only what changed: the last snapshot is kept, and a
  // publish that changes nothing tells nothing. During a replay, a change of
  // the fast-moving fields alone (HOT) is told 10 times a second at most.
  // The world's hole list and counts are worked out once per list and world.
  const HOT = new Set<keyof Snapshot>(HOT_FIELDS), HOT_MS = 100, NONE: readonly never[] = [];
  let told: Snapshot | null = null, toldAt = 0, toldLater: ReturnType<typeof setTimeout> | undefined;
  let wake = 0; // the last input or change: a still scene under reduced motion draws for a second after it
  const lists: { list: HoleRow[] | null; world: string | undefined | null; holes: HoleRow[]; worlds: Record<string, number> } = { list: null, world: null, holes: [], worlds: {} };
  const perList = () => {
    if (lists.list !== g.list || lists.world !== g.world) {
      lists.list = g.list;
      lists.world = g.world;
      lists.holes = g.list ? inWorld() : [];
      lists.worlds = g.list ? g.list.reduce<Record<string, number>>((m, h) => ((m[cupOf(h)] = (m[cupOf(h)] || 0) + 1), m), {}) : {};
    }
    return lists;
  };
  // an error the HUD shows, of a kind
  const fail = (err: unknown, kind: ErrorKind) => {
    g.error = errText(err);
    g.errorKind = kind;
    void publish();
  };
  function publish() {
    if (!alive) return false;
    const snap = snapshot();
    let changed = !told, hotOnly = !!told;
    if (told) for (const k in snap) {
      const key = k as keyof Snapshot;
      if (snap[key] !== told[key]) (changed = true), HOT.has(key) || (hotOnly = false);
    }
    if (!changed) return true;
    clearTimeout(toldLater);
    const now = performance.now();
    if (hotOnly && g.flying && now - toldAt < HOT_MS) {
      toldLater = setTimeout(publish, HOT_MS - (now - toldAt));
      return true;
    }
    told = snap;
    toldAt = wake = now;
    onChange(snap);
    return true;
  }
  const snapshot = (): Snapshot => ({
      holes: perList().holes,
      allHoles: g.list || NONE, // every cup's, for the cup totals and the grand slam
      world: g.world,
      linked: !!g.linked, // the page's link named a hole that exists
      ready: !!g.course && warming !== loads, // the hole is built and its shaders ready: the curtain may open
      // this hole's place in its cup, for the address bar and shared links; 0
      // for a hole in no cup (a community or an archived one): linked by its id
      place: g.s ? perList().holes.findIndex((h) => h.id === g.id) + 1 : 0,
      // a course hole another has replaced: playable by its link, in no cup
      archived: !!(g.id && g.all && g.all.find((h) => h.id === g.id)?.next),
      look: (g.s && g.s.world) || g.world || "garden", // the world this hole is dressed as
      // how many holes each world has on this chain, for the world screen
      worlds: perList().worlds,
      id: g.id,
      name: g.s ? g.s.name : "",
      // a realm hole's code, a data hole's data: what a player can read
      source: g.s ? chain.sourceURL(g.id) : "#",
      official: !g.s || g.s.official !== false, // one of the course's holes (a community hole is not)
      community: g.community || NONE, // everyone else's holes, playable outside the cups
      strokes: g.strokes,
      timed: !!(g.s && g.s.timed),
      time: g.course ? g.course.userData.time : "day",
      // what the realm's work model (golf.gno newWork) counts, for the save's
      // split and its gas: the walls of the hole and of its pulses, every
      // piece on the board (the hole's, its pulses' as if always there, the
      // forecast's zones; a polygon's every edge), the forecast's kind, and
      // each stroke's path length. A pulse is known from the strokes' extras.
      walls: g.s ? g.s.walls.length + pulse.walls : 0,
      pieces: g.s ? g.s.walls.length + g.s.posts.length + piecesOf(g.s.zones) + piecesOf((g.forecast && g.forecast.zones) || []) + pulse.pieces : 0,
      kind: (g.forecast && g.forecast.kind) || "",
      pts: g.pts,
      shots: g.shots,
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
      errorKind: (g.error && g.errorKind) || null,
      failed: g.error ? g.failed || null : null, // the hole a load failed on (Try again)
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
  let gfxMode: GfxMode = gfxOf(gfx), tier: Tier = "high";
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const weakGpu = (() => {
    try {
      const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info");
      const name = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER) as unknown);
      return /swiftshader|llvmpipe|softpipe|software|mali-[4-7]\d\d|mali-g[57]\d\b|adreno \(tm\) [3-5]\d\d|powervr|intel.*hd graphics [2-5]\d\d/i.test(name);
    } catch {
      return false;
    }
  })();
  const OLD_SLOW_KEY = "gnogolf.gfx.auto";
  // (a Low found by the probe before it knew the display's own rate: 75, 90
  // and 144 Hz screens were marked slow by the frame cap alone, and are probed again)
  try { if (localStorage.getItem(OLD_SLOW_KEY) === "low") localStorage.removeItem(OLD_SLOW_KEY); } catch {}
  const wasSlow = () => { try { return localStorage.getItem(SLOW_KEY) === "low"; } catch { return false; } };
  // A slow GPU (seen on some Safari and Firefox setups) gets a lighter canvas:
  // the first 2 s of busy drawing are timed, and frames drawn over 20 ms apart
  // on average (the cap aims at one every 16.7 ms, whatever the display) turn
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
  // only busy frames count (an idle scene may be drawn at 10 or 30 fps on purpose)
  const probe = { t0: 0, prev: 0, gaps: [] as number[], done: false };
  function probeFrame(now: number, busy: boolean) {
    if (tier === "low" || probe.done) return;
    if (!busy) return void (probe.prev = 0);
    if (!probe.t0) probe.t0 = now;
    if (probe.prev) probe.gaps.push(now - probe.prev);
    probe.prev = now;
    if (now - probe.t0 < 2000 && probe.gaps.length < 90) return;
    probe.done = true;
    if (probe.gaps.length > 10 && slowFrames(probe.gaps) && gfxMode === "auto") {
      try { localStorage.setItem(SLOW_KEY, "low"); } catch {}
      console.info("gnogolf: slow frames, graphics set to low");
      setTier();
      void publish();
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
    // the Far camera: the whole hole with a margin, room left for the mouse orbit
    g.far = farRig(camera, laneBox(g.s), screen());
    if (!g.rig) g.rig = { ...g.over, target: g.over.target.clone() };
  }

  const view = { ...HUD, w: 0, h: 0 };
  const screen = () => ((view.w = window.innerWidth), (view.h = window.innerHeight), view);


  // the intro's end: from the hole shown whole to the player's camera, one glide
  // (Far is the whole hole already: nothing to glide to)
  const intro = () => (setView(home()), g.view === "ball" && cam.glide());
  function setView(v: GameState["view"]) {
    clearTimeout(closeIn);
    g.view = v;
    void publish();
  }
  window.addEventListener("resize", resize);
  setTier();

  let last = 0;
  // What the GPU is spared: nothing is drawn behind an opaque screen (the
  // title, the cups, the picker) or in a hidden tab, and a window in the
  // background (another app in front) is not drawn unless a shot is on its way.
  // In view (engine/pace.ts frameMs): 60 fps busy (a shot, an aim) or with
  // fast movers (timed pieces: a tram, a lift; a mill), 30 while anything else
  // moves, 10 after a minute with no input; with reduced motion and nothing
  // moving, nothing is drawn until something changes. At most 60 whatever
  // the display's rate.
  // the frames skipped add up (a budget): on a 75, 90 or 144 Hz display the
  // drawn ones land every one or two refreshes, 60 a second on average, not
  // on every second or third refresh (37 to 48 a second)
  let budget = 0, prevRaf = 0;
  let blurred = false, input = performance.now(); // the last input: a minute past it, the scene dozes (AWAY_MS)
  const INPUTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
  const onBlur = () => (blurred = true);
  const onFocus = () => ((blurred = false), (wake = input = performance.now()));
  const onWake = () => (wake = input = performance.now());
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  for (const e of INPUTS) window.addEventListener(e, onWake, { passive: true, capture: true });
  function frame(now: number) {
    if (!alive) return;
    requestAnimationFrame(frame);
    const gap = prevRaf ? now - prevRaf : 0;
    prevRaf = now;
    if (!g.started || g.covered || document.hidden || (warming && warming === loads)) return (last = now), (budget = 0);
    const busy = promo.on || g.flying || dragging || aimer.moving() || (g.cam === "third" && g.aiming) || growing.length > 0 || !!confetti || !!righting || !cam.settled();
    if (blurred && !busy) return (last = now), (budget = 0);
    // moving: the sway, water, weather and decor (all still under reduced
    // motion), or timed pieces (their clock runs under reduced motion too)
    const timed = everyOf() > 0, fast = motion && (timed || !!(g.course && g.course.userData.mill));
    const ms = frameMs(busy, motion || timed, fast, now - input, now - wake);
    if (!ms) return (last = now), (budget = 0); // (a still garden under reduced motion)
    const p = pace(budget, gap, ms);
    budget = p.budget;
    if (!p.draw) return;
    probeFrame(now, busy);
    // the clock of the timed pieces runs on real time, however far apart the
    // frames are (never stepped by a capped dt): at any frame rate a piece is
    // where the time says, never behind it
    const elapsed = Math.min((now - last) / 1000, 0.5), dt = Math.min(elapsed, 0.1);
    last = now;
    cam.update(dt);
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
    if (!g.flying && g.course) {
      // at rest and while aiming the pieces move slowly enough to read and to
      // time (3.5 substeps a second, 1.5 with reduced motion); the replay
      // follows the path's own steps. The chain only sees the tick at release.
      clock += elapsed * (reduced ? 1.5 : TICKS_PER_S);
      showClock(clock);
      // aiming at moving pieces: the dots follow them
      if (dragging && everyOf() && aimer.shows() && now - lastTickPreview > 250) (lastTickPreview = now), preview();
    }
    // a world's canopy fades what stands between the camera and the ball
    if (g.course && g.course.userData.fade) g.course.userData.fade(camera.position, ball.position);
    weather.tick(now / 1000);
    causes.tick(now / 1000);
    aimer.step(now);
    rp.fadeSlopes(dt);
    // the fog's range: the rig's framing, or the camera's real distance to
    // the gnome when that is further (a glide starts far out while the rig
    // already names the close framing)
    if (g.rig) weather.view(g.view === "ball" ? Math.max(g.rig.dist, camera.position.distanceTo(ball.position)) : g.rig.dist);
    const exTick = extras && ud(extras).tick;
    if (exTick) exTick(now / 1000);
    const flag = g.course && g.course.userData.flag;
    if (flag) {
      // a wind leans the flag down-wind, and sets it flapping faster
      const wv = g.weather && g.weather.wind, ws = wv ? Math.hypot(wv[0], wv[1]) : 0;
      flag.rotation.x = wv ? (wv[1] / (ws || 1)) * Math.min(0.35, ws * 5) : 0;
      flag.rotation.z = wv ? -(wv[0] / (ws || 1)) * Math.min(0.35, ws * 5) : 0;
      flag.rotation.y = now / (900 - Math.min(600, ws * 6000));
      flag.position.y = (ud(flag).baseY ?? 0) + Math.abs(Math.sin(now / 420)) * 0.5;
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
    if (confetti && !confetti.step(dt)) dropConfetti();
    // nothing to see behind the title and picker screens, which are opaque
    if (g.started) renderer.render(scene, camera);
    cupPip();
  }

  // The cup off the picture, before the first stroke (Classic and Third
  // person, the camera on the gnome): a small inked pip at the edge of the free
  // screen, pointing to it. It fades once the cup is in view or a shot is played.
  const pip = document.createElement("div");
  pip.className = "cuppip";
  pip.setAttribute("aria-hidden", "true");
  pip.innerHTML = '<svg viewBox="-24 -24 48 48" width="56" height="56"><path d="M 13 -6 L 22 0 L 13 6 Z" class="cuppip__arrow"/><circle r="13" class="cuppip__disc"/><path d="M -4 7 V -8 L 7 -4 L -4 0" class="cuppip__flag"/></svg>';
  canvas.parentElement?.appendChild(pip);
  const cupNdc = new THREE.Vector3();
  let pipOn = false;
  function cupPip() {
    const want = !!g.s && g.started && g.view === "ball" && g.cam !== "far" && !g.shots.length && !g.flying && !g.holed && !g.covered;
    let show = false;
    if (want && g.s) {
      cupNdc.set(g.s.cup[0], ground(g.s.cup[0], g.s.cup[1]), g.s.cup[1]).project(camera);
      const behind = cupNdc.z > 1, w = window.innerWidth, h = window.innerHeight;
      const x = behind ? -cupNdc.x : cupNdc.x, y = behind ? -cupNdc.y : cupNdc.y;
      // the free part of the screen, in NDC: inside the HUD's bands
      const x1 = 1 - (2 * (HUD.side + 26)) / w, y1 = 1 - (2 * (HUD.top + 26)) / h, y0 = -1 + (2 * (HUD.bottom + 26)) / h, cy = (y0 + y1) / 2, ry = (y1 - y0) / 2;
      show = behind || Math.abs(x) > x1 || y < y0 || y > y1;
      if (show) {
        // on the line from the free part's centre toward the cup, at its edge
        let dx = x, dy = y - cy;
        if (Math.hypot(dx, dy) < 1e-6) (dx = 0), (dy = -1); // right behind: at the bottom
        const k = Math.min(Math.abs(dx) > 1e-6 ? x1 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? ry / Math.abs(dy) : Infinity);
        const px = ((dx * k + 1) / 2) * w, py = ((1 - (cy + dy * k)) / 2) * h;
        pip.style.transform = `translate(${(px - 28).toFixed(1)}px, ${(py - 28).toFixed(1)}px)`;
        pip.style.setProperty("--a", `${Math.atan2(-dy * h, dx * w).toFixed(3)}rad`);
      }
    }
    if (show !== pipOn) pip.classList.toggle("cuppip--on", (pipOn = show));
  }

  // --------------------------------------------------------------- loading

  // Loads are ticketed: only the latest one may land, and the round changes
  // before the wait, so any shot still in the air is already somebody else's.
  let loads = 0, warming = 0; // warming: the load whose hole is being built and compiled
  // the next hole's State, read while the win card shows: "Next hole" then
  // asks nothing. Kept PREFETCH_MS at most (its weather and wear move on).
  const PREFETCH_MS = 60e3;
  let ahead: { id: string; at: number; p: Promise<Hole> } | null = null;
  function prefetch(id: string) {
    if (!id || (ahead && ahead.id === id)) return;
    const p = chain.state(id);
    ahead = { id, at: performance.now(), p };
    p.then((st) => loadWorld(st.world).catch(() => {}), () => ahead && ahead.p === p && (ahead = null)).catch(() => {});
  }
  function stateOf(id: string): Promise<Hole> {
    const a = ahead;
    ahead = null;
    return a && a.id === id && performance.now() - a.at < PREFETCH_MS ? a.p.catch(() => chain.state(id)) : chain.state(id);
  }
  async function load(id: string) {
    const ticket = ++loads;
    // any shot in the air belongs to the old hole: end its round, but ask the
    // chain nothing for it (the new hole's round starts once it is built)
    newRound(false);
    let s: Hole;
    try {
      s = await stateOf(id);
    } catch (err) {
      // (the hole it failed on, for the banner's Try again: g.id is still the last one's)
      if (ticket === loads && alive) (g.failed = id), fail(err, "load");
      return;
    }
    if (ticket !== loads || !alive) return;
    // a hole the kept list has as current that the chain has replaced since
    // (its State names the version that took its place): the list read anew,
    // and its current version played
    if (s.next && g.list.some((h) => h.id === id)) {
      try {
        setList(await chain.holes(true));
      } catch {}
      if (ticket !== loads || !alive) return;
      if (!g.list.some((h) => h.id === id)) return load(s.next);
    }

    g.id = id;
    g.failed = null;
    // the cup follows the hole played (Back to another cup's hole, a link): a
    // course hole's cup, an archived one's too; a community hole keeps the cup
    const row = g.list.find((h) => h.id === id);
    if (row) g.world = cupOf(row);
    else if (s.official !== false) g.world = cupOf(s);
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
    pulse = { seen: new Set(), walls: 0, pieces: 0 };
    growing = [];
    aimer.forget(); // the hole is read anew: so are its previews
    // from here until its shaders are ready nothing is drawn (the curtain, or
    // the title, is over the course): the build in two tasks, then the
    // shaders compiled off the main thread
    warming = ticket;
    const built0 = performance.now();
    let course: Course | null = null;
    try {
      course = buildHole(decorOf(g.s), { defer: true });
      await new Promise((r) => setTimeout(r, 0)); // the pieces, then (next task) their merge
      if (ticket !== loads || !alive) return void disposeCourse(course);
      finishHole(course);
    } catch (err) {
      // our bug, not the chain's: say so, and leave the game usable
      console.error(err);
      if (ticket !== loads) return;
      warming = 0;
      fail(err, "draw");
      return;
    }
    g.course = course;
    scene.add(course);
    setLighting(scene, course.userData.time);
    // a hole's own weather, until a stroke's forecast says otherwise
    weather.board(s.board.w, s.board.h, cupOf(s), course.userData.terrain.dry || course.userData.terrain.onGreen);
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
    cam.prepare();
    resize();
    setView("overview");
    if (g.started) closeIn = setTimeout(intro, OVERVIEW_MS);
  }

  // Every shader the hole can need, compiled now: the scene as it is, and the
  // see-through variant of what a canopy fade turns transparent (fog and the
  // lightning's light never change the programs: see weather.ts)
  // (the see-through ones are only started: they are ready long before a fade
  // needs them). Resolves once the ones drawn now are linked.
  function warm() {
    const fades: THREE.Material[] = [];
    scene.traverse((o) => {
      const m = isDrawn(o) ? o.material : null;
      if (m && !Array.isArray(m) && md(m).fade === 1 && !m.transparent) fades.push(m);
    });
    if (fades.length) {
      for (const m of fades) m.transparent = true;
      renderer.compile(scene, camera);
      for (const m of fades) (m.transparent = false), (m.needsUpdate = true);
    }
    // (a context without parallel compiling resolves at once: the old way;
    // and a driver that never says a program is ready is waited 2 s at most)
    let t: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      renderer.compileAsync(scene, camera).catch((e: unknown) => console.warn("gnogolf: compileAsync", e)),
      new Promise<void>((r) => (t = setTimeout(() => (console.warn("gnogolf: shaders not ready after 2 s"), r()), 2000))),
    ]).finally(() => clearTimeout(t));
  }

  // A timed hole's moving pieces, for the stroke about to be played. They grow
  // up out of the ground when they appear, and the old ones sink away.
  let extras: THREE.Object3D | null = null, extrasFor = "";
  // the pulses' pieces seen so far on this hole, each once: what the work
  // model counts for them (newWork: every pulse, as if always there)
  let pulse = { seen: new Set<string>(), walls: 0, pieces: 0 };
  function sawPulse(ex: Extras) {
    const add = (list: readonly (Wall | Post | Zone)[], wall = false) => {
      for (const x of list) {
        const k = JSON.stringify(x);
        if (pulse.seen.has(k)) continue;
        pulse.seen.add(k);
        pulse.pieces += 1 + (("poly" in x && x.poly && x.poly.length) || 0);
        if (wall) pulse.walls++;
      }
    };
    add(ex.walls, true), add(ex.posts), add(ex.zones);
  }
  async function showExtras() {
    if (!g.s || !g.s.timed || !g.course) return;
    const key = `${g.id}#${g.round}#${g.shots.length}`;
    if (key === extrasFor) return;
    extrasFor = key;
    let ex: Extras;
    try {
      ex = await chain.extras(g.id!, g.shots.length);
    } catch {
      if (extrasFor === key) extrasFor = ""; // let the next stroke ask again
      return;
    }
    if (extrasFor !== key || !alive || !g.course) return;
    sawPulse(ex);
    // this stroke's weather: the hole's, and whatever the stroke brings
    strokeWalls = ex.walls;
    applyWeather(ex.zones);
    void publish();
    const old = extras;
    extras = buildExtras(g.course, ex);
    extras.scale.y = 0.01;
    g.course.add(extras);
    growing.push({ o: extras, from: 0.01, to: 1, t: 0 });
    if (old) growing.push({ o: old, from: 1, to: 0.01, t: 0, gone: true });
  }
  let growing: { o: THREE.Object3D; from: number; to: number; t: number; gone?: boolean }[] = [];

  // The weather drawn is the round's (a forecast fixed for its quarter hour),
  // with whatever the hole or the stroke carries itself.
  let strokeZones: readonly Zone[] = [], strokeWalls: readonly Wall[] = [];
  // the zones that act on the ball now: the hole's, the forecast's, the stroke's
  const zonesNow = (): Zone[] => [...(g.s ? g.s.zones : []), ...((g.forecast && g.forecast.zones) || []), ...strokeZones];
  function applyWeather(zones?: readonly Zone[]) {
    if (zones) strokeZones = zones;
    if (!g.s || !g.course) return;
    const fk = faked();
    g.weather = weather.set(fk || zonesNow(), fk ? null : g.forecast);
    everyL = everyNow();
    // the mill's sails count from a quarter turn, sail down: tick 0 of the clock
    const mill = g.course.userData.mill;
    if (mill && mill.shoot && !mill.started) (mill.shoot(), (mill.started = true));
    ambience(g.weather || {});
    if (g.course.userData.wind) g.course.userData.wind((g.weather && g.weather.wind) || null);
    if (g.course.userData.weather) g.course.userData.weather(g.weather); // the decor dressed for it (sunbathers in, parasols shut...)
    void publish();
  }
  // Between rounds the period may have turned: a round not started yet takes
  // the new weather. Asked only once the loaded period is over on the chain's
  // clock (State has just given the current one: no Period() behind it).
  const stale = () => g.period != null && chain.now() >= (g.period + 1) * RULES.periodMs;
  let freshening: Promise<void> | null = null;
  function freshWeather() {
    return (freshening = freshening || refresh().finally(() => (freshening = null)));
  }
  async function refresh() {
    const id = g.id, round = g.round;
    try {
      const p = await chain.period();
      if (p === g.period || !id || id !== g.id || round !== g.round) return;
      const fc = await chain.weather(id, p);
      if (id !== g.id || round !== g.round || g.shots.length) return; // a shot already went: keep its weather
      g.period = p;
      g.forecast = fc;
      applyWeather();
    } catch {}
  }
  // a hole looked at past its period, no stroke played: the HUD's weather follows
  const staleTimer = setInterval(() => g.s && !g.flying && !g.shots.length && stale() && void freshWeather(), 5000);

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
      .map((q) => (q.every ?? 0) | 0).filter((e) => e > 0);
    if (!ev.length) return 0;
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    return Math.min(1024, ev.reduce((a, b) => (a * b) / gcd(a, b)));
  };
  const tickNow = () => {
    const L = everyOf();
    return L ? Math.floor(clock) % L : null; // no timed piece: nothing to send
  };
  const showClock = (t: number) => {
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
    cam.resetFollow();
    cam.jump(); // a new round: the camera starts in its framing, not eased in from the last hole
    g.roundMode = null;
    rp.clearGlow();
    restTimed();
    g.round = (g.round || 0) + 1;
    dropConfetti();
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
      if (ask) void showExtras();
      if (ask && stale()) void freshWeather();
    }
    void publish();
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
  let mode: Mode = aimMode === "pro" ? "pro" : "assisted";
  // replays cut by the safety net: every animation of the one cut stops
  let cut = 0; // each animation keeps the value it started with (cutAt)
  let shot: Shot = { angle: 0, power: 0 };

  // what the camera, the aim and the replay read of the game, as it changes
  const E: Live = {
    g, camera, scene, chain, aim, band, causes, mood, publish, screen, ground, lift, log: logCam,
    zones: zonesNow,
    landing: () => null, // the replay's, once made (below)
    tickNow: () => tickNow(),
    stop: () => cut++,
    showAt: (t) => showClock((clock = t)),
    get ball() { return ball; },
    get dragging() { return dragging; },
    get shot() { return shot; },
    get clock() { return clock; },
    get cut() { return cut; },
    get mode() { return mode; },
    get strokeZones() { return strokeZones; },
  };
  const cam = makeCamera(E);
  window.addEventListener("pointermove", cam.hover);
  const rp = makeReplay(E);
  E.landing = rp.landing;
  const aimer = makeAimer(E);
  const { preview, dropAim, strokeFrom, ghosts, known } = aimer;
  // the pull let go of (or dropped): nothing aimed, the HUD told
  const endPull = () => ((dragging = g.aiming = false), dropAim(), void publish());

  // the canvas is a fixed full-window backdrop: its rect changes with the
  // window only, so it is read once per resize, not twice a pointer move (a
  // read after the HUD's power bar moved forces a layout in the input path)
  let rect: DOMRect | null = null;
  const dropRect = () => (rect = null);
  window.addEventListener("resize", dropRect);
  function boardPoint(ev: { clientX: number; clientY: number }) {
    const r = rect || (rect = canvas.getBoundingClientRect());
    const x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc.set(x, y), camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : null;
  }

  // A slingshot: press anywhere, pull back, let go. The shot flies away from
  // the pull, as if the elastic snapped into the gnome.
  let press: { clientX: number; clientY: number; x: number; y: number; yaw?: number; dir?: number | null; lx?: number; ly?: number } | null = null;

  function onMove(ev: PointerEvent) {
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
        void publish();
      }
      return;
    }
    // both ends through the camera as it is now: an easing camera moves the
    // board under a still hand, and must not turn the shot
    let dir: number;
    if (g.cam === "third" && press.yaw != null) {
      // behind the gnome: the shot opposite the pull, read in the camera frame
      // of the pull's start (every direction reachable, the view never feeding back)
      dir = thirdAim(press.yaw, ev.clientX - press.x, ev.clientY - press.y, press.dir, ev.shiftKey, ev.clientX - (press.lx ?? press.x), ev.clientY - (press.ly ?? press.y));
      press.dir = dir;
      (press.lx = ev.clientX), (press.ly = ev.clientY);
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
    aim.visible = aimer.shows();
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    placeBall();
    // the HUD shows a power bar and nothing else of the pull: re-render only
    // when the bar would move
    const bar = Math.round(g.power * 40);
    if (bar !== lastBar) {
      lastBar = bar;
      void publish();
    }
  }
  let lastBar = -1;

  const onDown = (ev: PointerEvent) => {
    // one finger, one primary button: a second touch or a right-click is not a pull
    if (!ev.isPrimary || ev.button > 0) return;
    if (g.flying || g.done) return;
    cam.finishGlide(); // the intro glide, if still on: finished now, quickly
    // a new press takes over whatever aim was held (a keyboard aim, a lost pull)
    dragging = true;
    g.aiming = true;
    ghosts(true);
    shot = { angle: 0, power: 0 };
    press = { clientX: ev.clientX, clientY: ev.clientY, x: ev.clientX, y: ev.clientY };
    // third person: the heading the pull is measured from, frozen for the pull
    if (g.cam === "third" && g.view === "ball") Object.assign(press, { yaw: cam.yaw(), dir: null });
    // no dots until the chain has answered for this pull
    if (aim.userData.dots) aim.userData.dots.count = 0;
    else for (const d of aim.children) d.visible = false;
    canvas.setPointerCapture(ev.pointerId);
    void publish();
  };
  const onUp = () => {
    if (!dragging) return;
    endPull();
    press = null;
    if (shot.power > 0.3) void fire(shot.deg ?? 0, shot.power);
  };

  // the OS took the pointer away (a system gesture, a call): drop the pull, no shot
  const onCancel = () => {
    press = null;
    if (dragging) endPull();
  };

  // Keyboard: ←/→ turn the aim, ↑/↓ set the power, Space or Enter shoots,
  // Escape drops the aim. The same preview and the same fire() as the mouse.
  canvas.tabIndex = -1; // until the course is shown (cover)
  canvas.setAttribute("aria-label", "Course. Arrow keys aim and set the power, Space shoots.");
  const onKey = (ev: KeyboardEvent) => {
    if (g.flying || g.done || !g.s) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(ev.key)) cam.finishGlide();
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
    else if (ev.key === "Escape" && g.aiming) return void endPull();
    else if ((ev.key === " " || ev.key === "Enter") && g.aiming) {
      ev.preventDefault();
      endPull();
      const k = pullShot(0, 1, 1, shot.angle, MAX_POWER); // the same rounding as a pull
      return void fire(k.deg, Math.round(shot.power * 100) / 100);
    } else return;
    ev.preventDefault();
    // rounded like a pull, so the preview is the shot
    shot.deg = pullShot(0, 1, 1, shot.angle, MAX_POWER).deg;
    shot.power = Math.round(shot.power * 100) / 100;
    g.facing = shot.angle;
    g.power = shot.power / MAX_POWER;
    creak();
    band.visible = true;
    aim.visible = aimer.shows();
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    placeBall();
    void publish();
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
  async function fire(angleDeg: number, power: number) {
    if (g.flying || !g.id || g.done || !g.course) return; // no island drawn, nothing to play on
    const round = g.round;
    try {
      await shoot(angleDeg, power, round);
    } catch (err) {
      console.warn("gnogolf: a shot failed", err);
      if (round === g.round) (g.error = errText(err)), (g.errorKind = "shot");
    } finally {
      dragging = false;
      g.aiming = false;
      press = null;
      if (round === g.round) g.flying = false;
      void publish();
    }
  }

  async function shoot(angleDeg: number, power: number, round: number | undefined) {
    if (!g.id || !g.s) return;
    const id = g.id, s = g.s;
    if (g.shots.length >= maxRoundStrokes) {
      g.error = `${maxRoundStrokes} strokes is the most one round can hold.`;
      g.errorKind = "limit";
      void publish();
      return;
    }
    // the first stroke of a round in a period that is over would make it
    // unsaveable from the start: the current weather is read first
    if (!g.shots.length && stale()) {
      g.flying = true; // no second shot while it is read
      await freshWeather();
      if (round !== g.round) return;
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
    void publish();

    let res: Stroke;
    const one = shotOf(angleDeg, power, tick);
    try {
      // the aim preview already asked the chain this very stroke (same hole,
      // period, round so far and shot string): its answer is the shot, no
      // second round trip. Anything else differs by a hair: asked anew.
      // (a path is points of two finite numbers, or the chain boundary refused it)
      res = known(id, g.shots, one) || (await strokeFrom(id, g.shots, one, g.rest));
      if (round !== g.round) return;
    } catch (err) {
      if (round !== g.round) return;
      g.flying = false;
      fail(err, "shot");
      return;
    }
    if (!g.shots.length) g.roundMode = mode; // this round is played, and recorded, in this mode
    g.lastAim = (angleDeg * Math.PI) / 180;
    g.shots = [...g.shots, one]; // a new list: what changed is seen by reference
    g.pts = [...g.pts, res.path.length];
    g.rest = res.rest;
    g.tick0 = tick || 0;
    g.strokes = res.strokes || g.shots.length; // SimulateFrom has no count: a stroke is a shot
    if (res.holed) {
      g.done = true; // no more shots, even before the banner shows
      // the stroke count as the round has it (SimulateFrom sends none: res.strokes was undefined,
      // and the card saved nothing)
      onHoled({ id, strokes: g.strokes });
      // the hole "Next hole" goes to (the win card's: the next in this cup)
      const cup = perList().holes, i = cup.findIndex((h) => h.id === id);
      if (cup.length) prefetch(cup[(i + 1) % cup.length].id);
      joyIn = setTimeout(() => alive && round === g.round && mood.joy(performance.now()), 500);
    }
    void publish();
    // A safety net: a replay that runs well past what its path should take
    // (a promise that never settles, an animation stuck) is cut, and the
    // ball is put where the chain has it — the player is never left locked out.
    // what the path should take on screen (its steps, and a splash or
    // a tube at most), with room to spare
    let expect = 0;
    for (let i = 0; i + 1 < res.path.length; i++) expect += Math.max(MS_PER_STEP, (Math.hypot(res.path[i + 1][0] - res.path[i][0], res.path[i + 1][1] - res.path[i][1]) / SHOW_SPEED) * 1000);
    const budget = 3500 + expect * 1.5;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = await Promise.race([
      rp.replay(res.path, res.holed, res.air, res.cause).then(() => false, (err: unknown) => (console.warn("gnogolf: the replay threw", err), true)),
      new Promise<boolean>((r) => (timer = setTimeout(() => r(true), budget))),
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
    void showExtras(); // a timed hole changes for the next stroke
    // a jump or a bounce may have ended mid-air: put him on the ground
    if (!res.holed) ball.position.set(last[0], BALL_R + ground(last[0], last[1]), last[1]);
    g.facing = Math.PI / 2; // at rest he looks at the player
    rightUp();
    if (res.holed) {
      dropConfetti();
      const burst = (confetti = makeConfetti(s.cup, ground(s.cup[0], s.cup[1])));
      sound("pop");
      sound("win", g.strokes === 1 ? 1 : 0); // a hole-in-one gets the longer fanfare
      scene.add(burst.group);
      // let the confetti fly before the banner covers the course
      holedIn = setTimeout(() => {
        if (round !== g.round) return;
        g.holed = true;
        buzz([30, 60, 45]);
        sound("cup");
        void publish();
      }, 1600);
    }
    void publish();
  }

  function rightUp() {
    const body = ball.userData.body;
    const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - g.facing, 0));
    righting = { from: body.quaternion.clone(), to, t: 0 };
  }


  // ----------------------------------------------------------------- boot

  /** The hole as the scene dresses it. Its decor (the theme, the time of
   *  day, every seeded layout) is keyed by the hole's name for the scene: a
   *  course hole that was a realm keeps that realm's, so it looks as it
   *  always did, and any data hole keeps its slot's through its versions. */
  const decorOf = (s: Hole): Hole => ({ ...s, hole: legacyOf(s.slot) || s.slot || s.hole });

  /** hole2 before hole10: the registry is keyed lexicographically, a menu is not. */
  // the chain gives each hole its world and its place in it; an older realm
  // gives neither, and the number in the id orders them
  const byNumber = (a: HoleRow, b: HoleRow) => {
    const n = (h: HoleRow) => {
      if (typeof h.order === "number") return h.order;
      const m = h.id.match(/(\d+)/);
      return m ? Number(m[1]) : Infinity;
    };
    return n(a) - n(b) || a.id.localeCompare(b.id);
  };
  const inWorld = () => g.list.filter((h) => cupOf(h) === g.world);

  /**
   * The hole a link names: a realm id (?hole=gno.land/r/…, the old form), or a
   * cup and its place in it (?cup=island&hole=3: the chain's order, else the
   * 3rd of that cup). null when it names nothing on this chain.
   */
  function linked(link: Link | null): HoleRow | null {
    if (!link || !g.list) return null;
    // an archived hole too, by its id; an alias (a slot, "<address>/<slug>")
    // is its current version, and so is a course hole's old realm id
    if ("id" in link) {
      const all = g.all || g.list, alias = oldToSlot(link.id) || link.id;
      return all.find((h) => h.id === link.id) || all.find((h) => h.slot === alias && !h.next) || null;
    }
    const { cup: want, n } = link;
    if (!want || !n) return null;
    const cup = g.list.filter((h) => cupOf(h) === want);
    return cup.find((h) => Math.round(h.order) === n) || cup[n - 1] || null;
  }

  /** The chain's hole list taken in: every hole, the cups', the community's. */
  function setList(list: HoleRow[]) {
    // a hole another has replaced (same cup, same place) stays playable by its
    // link, but only the current one fills the cup
    g.all = list;
    // the cups hold the course's own holes; anyone else's is a community hole,
    // listed apart and ranked nowhere
    g.list = list.filter((h) => !h.next && h.official !== false).sort(byNumber);
    g.community = list.filter((h) => !h.next && h.official === false);
  }

  async function start(link: string | Link | null) {
    let list = await chain.holes();
    // a link to a hole the tab's kept list does not have yet: the chain's own
    if (typeof link === "string" && link && !list.some((h) => h.id === link || h.slot === (oldToSlot(link) || link))) list = await chain.holes(true);
    if (!alive) return; // destroyed while the chain answered (a remount in dev)
    setList(list);
    if (!g.list.length) throw new Error("no hole is registered on this chain");
    // a string is a realm id, as before
    const asked = linked(typeof link === "string" ? { id: link } : link);
    // an older archived version, past what Holes() lists: the chain may
    // still have it, so it is asked for; one it has not lands on the cups
    if (!asked && typeof link === "string" && link) {
      await load(link);
      if (!alive) return;
      if (g.s) {
        g.linked = true;
        requestAnimationFrame(frame);
        return;
      }
      g.error = null;
      g.failed = null;
    }
    g.linked = !!asked;
    // ?cup=island alone: that cup, on its first hole
    const cupWant = typeof link === "object" && link && "cup" in link ? link.cup : undefined;
    const cupLink = cupWant && g.list.some((h) => cupOf(h) === cupWant) ? cupWant : "";
    g.world = asked ? cupOf(asked) : cupLink || g.world || "garden";
    const first = asked || inWorld()[0] || g.list[0];
    await load(first.id);
    if (!g.s) throw new Error(g.error || "the first hole could not be loaded");
    requestAnimationFrame(frame);
  }

  promo.attach({ g, chain, fire, ball: () => ball, every: () => everyOf(), setClock: (t: number) => (clock = t) }); // ?promo only
  const api = {
    start,
    load,
    /** The hole a cup and place name ({ cup, n }), or null. */
    find: (link: Link) => {
      const h = linked(link);
      // (an archived id past what Holes() lists: the load will ask the chain)
      return h ? h.id : "id" in link && isHoleId(link.id) ? link.id : null;
    },
    /** The hole being played. */
    current: () => g.id,
    /** Whether the page's link named a hole that exists here. */
    linked: () => !!g.linked,
    /** Play a world: its first hole, and its holes in the menu. */
    setWorld(w: string) {
      loadWorld(w).catch(() => {}); // fetched while the player picks a gnome
      // (the cup asked for, and its hole on screen already: nothing to load)
      if (!g.list || (w === g.world && inWorld().some((h) => h.id === g.id))) return;
      g.world = w;
      const first = inWorld()[0];
      if (first) void load(first.id);
      else void publish();
    },
    /** An opaque screen is over the course (or gone): stop drawing it meanwhile. */
    cover(on: boolean) {
      g.covered = !!on;
      canvas.tabIndex = on ? -1 : 0; // a hidden course is not a place for Tab to land
    },
    /** Leave the title screen: show the hole whole, then close on the ball;
     *  direct (a link to this hole): straight to the player's camera. */
    play(direct = false) {
      g.started = true;
      if (!direct) return void (closeIn = setTimeout(intro, OVERVIEW_MS));
      cam.jump(); // in its framing at once, not glided in
      setView(home());
    },
    /**
     * Plays a list of "angle,power" shots as a player would, pulling the
     * elastic on screen before each one — for demos and recordings. Goes
     * through fire(), so the chain resolves every shot exactly as usual.
     */
    async demo(list: readonly string[]) {
      // A person does not pull straight to the right angle: the aim starts a
      // few degrees off and is corrected, the pull goes a little too far and
      // is eased back, and the pause before letting go is never the same
      // twice. Only the moment of release has to be exact.
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let n = 0;
      setSilent(true); // a demo is nobody's pull: no creak, no putt, no knock
      for (const item of list) {
        const [deg, power] = item.split(",").map(Number);
        const off = [9, -7, 5, -11][n % 4], over = [1.18, 1.1, 1.22, 1.14][n % 4];
        const pull = 1300 + (n % 3) * 250;
        await wait([900, 1400, 700, 1100][n % 4]); // looking at the course first
        const t0 = performance.now();
        dragging = g.aiming = true;
        await new Promise<void>((res) => {
          const tick = (now: number) => {
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
            void publish();
            if (k < 1) requestAnimationFrame(tick);
            else res();
          };
          requestAnimationFrame(tick);
        });
        shot = { angle: (deg * Math.PI) / 180, power };
        await wait([450, 700, 350, 600][n % 4]); // holding it, then letting go
        endPull();
        await fire(deg, power);
        if (g.done || !alive) return setSilent(false);
        n++;
      }
      setSilent(false);
    },
    /** A picture to share: the course as it is now, the score on a card over it. */
    snapshot(caption = "") {
      // drawn and read in the same task, so the drawing buffer is still there
      renderer.render(scene, camera);
      const src = renderer.domElement, W = 1200, H = Math.round((W * src.height) / src.width);
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d")!;
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
      return new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    },
    /** Dismiss a shot error and keep playing. */
    clearError() {
      g.error = null;
      g.failed = null;
      void publish();
    },
    /** Swap the gnome; cosmetic only, the chain never sees it. */
    setGnome(id: string) {
      scene.remove(ball);
      disposeCourse(ball);
      ball = makeBall(gnomeById(id));
      scene.add(ball);
      if (g.s) placeBall();
    },
    /** Graphics: "auto" | "high" | "low". The outlines follow at the next hole
     *  built — now, if no stroke has been played on this one. */
    setGfx(m: string) {
      gfxMode = gfxOf(m);
      if (m === "auto") try { localStorage.removeItem(SLOW_KEY); } catch {} // a fresh look at the device
      Object.assign(probe, { t0: 0, prev: 0, gaps: [], done: false });
      if (setTier() && g.id && !g.flying && !g.shots.length) void load(g.id);
      void publish();
    },
    /** Toggle between the whole course and the ball. */
    toggleView: () => setView(g.view === "ball" ? "overview" : "ball"),
    /** The aim mode for the next round ("assisted" | "pro"); a round under way is restarted. */
    setMode(m: string) {
      mode = m === "pro" ? "pro" : "assisted";
      if (g.shots.length && g.roundMode !== mode) (newRound(), setView(home()));
      void publish();
    },
    /** The camera: "classic" | "far" | "third". */
    setCam(m: string) {
      g.cam = camOf(m);
      // every switch starts clean: the chase state reset, a pull under way
      // dropped, and the pose eased from where the camera actually is
      cam.resetFollow();
      cam.finishGlide();
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
      clearInterval(staleTimer);
      window.removeEventListener("resize", dropRect);
      window.removeEventListener("pointermove", cam.hover);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      for (const e of INPUTS) window.removeEventListener(e, onWake, { capture: true });
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
      clearTimeout(toldLater);
      dropAim(); // and any preview on its way
      cut++; // every animation still running stops at its next frame
      if (g.course) disposeCourse(g.course);
      for (const o of [ball, aim, band, confetti && confetti.group, confettiWarm.group]) if (o) disposeCourse(o);
      renderer.dispose();
      pip.remove();
    },
  };
  // the test hooks, only for a page that asks for them
  // (always there in the type: undefined unless the page asked for them)
  const hooked: Partial<ReturnType<typeof Probes>> = probes ? probes(E, { cam, rp, placeBall, onHoled, fakeWeather: (w) => ((fakeWeather = w), applyWeather()) }) : {};
  return Object.assign(api, hooked);
}
