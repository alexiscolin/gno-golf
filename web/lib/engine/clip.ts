// The shot clip (ADR-003): once the hole is won, its holing stroke played
// again and recorded, 1280×720, for the player to post.
//
// The replay is the game's own (engine/replay.ts: the chain's path walked the
// same way every time), seen by the player's own camera controller
// (engine/camera.ts), but on a gnome and a camera of the clip's: the live
// game is left as it is. A second renderer draws the scene on a canvas nobody
// sees, the live gnome hidden and the clip's things (its gnome, its splash
// rings, its confetti) put in for that one draw only; the frame is painted
// over the page's sky on a 2D canvas, which canvas.captureStream() and
// MediaRecorder (native, no library) turn into an MP4. It records in real
// time: a clip takes as long to make as it lasts, a few seconds.
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { makeRenderer, makeBall, gnomeById, makeConfetti, disposeCourse, overviewRig, farRig, courseBox, laneBox } from "../scene";
import { makeCauses } from "../scene/cause";
import { BALL_R } from "../terrain";
import { CLIP, clipWindow, skyStops } from "../clip";
import { drawOutro, drawTerm } from "../brand";
import { makeCamera } from "./camera";
import { makeReplay, stepsMs } from "./replay";
import type { LitScene } from "../scene/data";
import type { Confetti } from "../scene/fx";
import type { Vec2 } from "../types";
import type { GameState, Live } from "./types";

const W = 1280, H = 720, FPS = 30;
const DROP_MS = 320; // the holing step, the ball dropping in (the replay's own)

/** What the engine gives the clip: the holing stroke and the live scene's hooks. */
export interface ClipOf {
  E: Live;
  /** the holing stroke: the chain's path, its air and cause letters, its angle (degrees) */
  stroke: { path: readonly Vec2[]; air: string; cause: string; angle: number };
  gnome: string;
  /** the timed pieces set to a tick of the clock (and back to the live one) */
  showClock: (t: number) => void;
  /** the live things the clip must not show (the gnome, the aim, the confetti...) */
  hide: () => readonly (THREE.Object3D | null | undefined)[];
  /** the score's card, painted over each frame */
  card: (x: CanvasRenderingContext2D, w: number, h: number) => void;
  /** the result in words (Hole in one!), large once the ball is in */
  term?: string;
  /** the shot to beat, on the closing card (Down the Tunnel · 1 stroke) */
  challenge: string;
}
/** How it is run: the format, a way to cancel it, its progress (0..1). */
export interface ClipRun {
  mime: string;
  signal: AbortSignal;
  progress?: (k: number) => void;
}

/** Records the clip: an MP4 Blob, or null (cancelled, the round gone, nothing recorded). */
export function recordClip({ E, stroke, gnome, showClock, hide, card, term, challenge }: ClipOf, { mime, signal, progress = () => {} }: ClipRun): Promise<Blob | null> {
  const { g, scene, ground } = E, s = g.s, round = g.round, { path } = stroke;
  if (!s || signal.aborted || path.length < 2) return Promise.resolve(null);
  // its renderer first: a device out of WebGL contexts refuses here, before anything is built to free
  const renderer = makeRenderer(document.createElement("canvas"));
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  // the clip's framing: the card's band at the bottom kept clear
  const view = { w: W, h: H, top: 24, bottom: 96, side: 24 };
  // the clip's own things, in the scene only while the clip draws
  const own = new THREE.Scene() as LitScene;
  const ball = makeBall(gnomeById(gnome));
  own.add(ball);
  const causes = makeCauses(own);
  const camera = new THREE.PerspectiveCamera(30, W / H, 3, 260);
  // the game as the replay and the camera read it: the live one, the
  // clip's own fields over it (flying, the rigs framed for 16:9)
  const cg: GameState = Object.assign(Object.create(g) as GameState, {
    flying: false, done: false, holed: false, aiming: false, inTube: false, cause: null, rig: null,
    over: overviewRig(courseBox(s.board), view), far: farRig(laneBox(s, ground), view),
  });
  let clock = E.clock, cut = 0;
  const C: Live = {
    g: cg, camera, scene: own, chain: E.chain, aim: E.aim, band: E.band, causes, ground, lift: E.lift, zones: E.zones, log: false, quiet: true,
    mood: { joy() {}, shake() {}, hop: () => 0, tick() {} },
    publish: () => true, screen: () => view, tickNow: () => null, landing: () => null,
    stop: () => cut++, showAt: (t) => (clock = t),
    ball, dragging: false, shot: E.shot, mode: E.mode, strokeZones: E.strokeZones,
    get clock() { return clock; },
    get cut() { return cut; },
  };
  const cam = makeCamera(C), rp = makeReplay(C);
  // each step's time on screen, as the replay takes it: what the window is cut from
  const ms = stepsMs(path);
  ms[ms.length - 1] = DROP_MS;
  const win = clipWindow(ms);
  // the gnome where the clip opens, facing the shot as he was at its release
  ball.position.copy(E.lift(path[win.from]));
  ball.userData.body.rotation.set(0, Math.PI / 2 - (stroke.angle * Math.PI) / 180, 0);
  clock = (g.tick0 || 0) + win.from;
  cam.jump();

  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const x = out.getContext("2d")!;
  // the page's sky (CSS, behind the live canvas), painted behind the course
  const sky = x.createLinearGradient(0, 0, 0, H);
  for (const [k, c] of skyStops(getComputedStyle(document.querySelector(".sky") || document.body).backgroundImage)) sky.addColorStop(k, c);

  let confetti: Confetti | null = null, still: HTMLCanvasElement | null = null, dropped = 0, t0 = 0; // when the ball went in, when the clip began (performance.now)
  // a camera with some life, over the player's own framing: a slow swing round
  // the point it looks at, closing in as the stroke goes, a punch in on the drop
  const UP = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), look = new THREE.Vector3(), rel = new THREE.Vector3();
  function lively(now: number) {
    const t = t0 ? (now - t0) / 1000 : 0, drop = dropped ? Math.min(1, (now - dropped) / 450) : 0;
    camera.getWorldDirection(fwd);
    look.copy(camera.position).addScaledVector(fwd, camera.position.distanceTo(ball.position));
    const k = 1 - 0.14 * Math.min(1, (t * 1000) / win.length) - 0.12 * Math.sin((drop * Math.PI) / 2);
    rel.copy(camera.position).sub(look).applyAxisAngle(UP, 0.3 * Math.sin(t * 0.75)).multiplyScalar(k);
    camera.position.copy(look).add(rel);
    camera.lookAt(look);
  }
  function draw(dt: number, now: number) {
    cam.update(dt);
    lively(now);
    causes.tick(now / 1000);
    if (confetti) confetti.step(dt);
    // his shadow on the ground under him, whatever he is doing above it
    ball.userData.shade.position.y = BALL_R + ground(ball.position.x, ball.position.z) - ball.position.y - BALL_R + 0.02;
    rp.offWalls(); // and clear of the walls he runs along
    // the live gnome and its things out, the clip's in, for this draw only
    // (in one task: the live canvas never shows it)
    const live = hide().filter((o): o is THREE.Object3D => !!o && o.visible);
    for (const o of live) o.visible = false;
    scene.add(own);
    showClock(clock);
    try {
      renderer.render(scene, camera);
    } finally {
      scene.remove(own);
      showClock(E.clock);
      for (const o of live) o.visible = true;
    }
    x.fillStyle = sky;
    x.fillRect(0, 0, W, H);
    x.drawImage(renderer.domElement, 0, 0);
    card(x, W, H);
    // the result over the confetti, then the closing card
    const end = dropped ? now - dropped - CLIP.tail : -1;
    if (dropped && term && end < 0) drawTerm(x, W, H, term, (now - dropped - CLIP.pop) / CLIP.fade);
    if (end >= 0) {
      // the course's last moment, kept: the closing card blurs it behind itself
      if (!still) still = Object.assign(document.createElement("canvas"), { width: W, height: H }), still.getContext("2d")!.drawImage(out, 0, 0);
      drawOutro(x, W, H, end / CLIP.fade, still, challenge);
    }
  }

  return new Promise<Blob | null>((resolve) => {
    const stream = out.captureStream(FPS);
    const chunks: Blob[] = [];
    let rec: MediaRecorder | null = null, raf = 0, last = 0, played = false, told = -1, over = false;
    const finish = (keep: boolean) => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      cut++; // the replay stops where it is
      signal.removeEventListener("abort", cancel);
      const free = () => {
        for (const t of stream.getTracks()) t.stop();
        causes.dispose();
        disposeCourse(own); // (the shared materials are kept: disposeCourse knows them)
        renderer.dispose();
        renderer.forceContextLoss(); // its copy of the course's buffers freed now, not at the next collection
      };
      if (!rec || rec.state === "inactive") return free(), resolve(null);
      rec.onstop = () => (free(), resolve(keep && chunks.length ? new Blob(chunks, { type: "video/mp4" }) : null));
      rec.stop();
    };
    const cancel = () => finish(false);
    signal.addEventListener("abort", cancel);
    const tick = (now: number) => {
      if (over) return;
      if (g.round !== round) return finish(false); // a new round (Play again, another hole): nothing to film
      raf = requestAnimationFrame(tick);
      if (last && now - last < 1000 / FPS - 4) return; // 30 frames a second
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const t = now - t0;
      // the still moment before the release, then the stroke, then the confetti
      if (!played && t >= win.lead) {
        played = true;
        cg.flying = cg.done = true; // (as the live game has it in the holing stroke: the camera closes on the cup)
        void rp.replay(path, true, stroke.air, stroke.cause, win.from).then(() => {
          if (over) return;
          cg.flying = false;
          dropped = performance.now();
          confetti = makeConfetti(s.cup, ground(s.cup[0], s.cup[1]));
          own.add(confetti.group);
        });
      }
      draw(dt, now);
      const k = Math.min(0.99, t / (win.length + CLIP.outro));
      if (Math.floor(k * 20) !== told) progress((told = Math.floor(k * 20)) / 20);
      // done: the tail after the drop; or well past what it should take (a replay stuck)
      if ((dropped && now - dropped >= CLIP.tail + CLIP.outro) || t > win.length + CLIP.outro + 4000) finish(true);
    };
    try {
      // one draw first, not recorded: the second renderer's shaders compiled
      // before the clock starts, not as a freeze in its first second
      draw(0, performance.now());
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
      rec.ondataavailable = (e) => void (e.data.size && chunks.push(e.data));
      rec.start();
    } catch (err) {
      console.warn("gnogolf: no clip", err);
      return finish(false);
    }
    t0 = performance.now();
    raf = requestAnimationFrame(tick);
  });
}
