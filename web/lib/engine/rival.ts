// The rival of a ghost duel (ADR-004): another player's best, replayed stroke
// by stroke on a see-through gnome of its own, after each of the player's.
//
// Nothing about the player's round changes: the ghost is drawn only, the two
// balls pass through each other, and its strokes are free reads (the first
// with SimulateRoundIn from the tee, each later one with SimulateFrom from the
// rest before, all in the ghost's own period): one read ahead, each kept once
// it answers (a rematch, or the other mode and back, reads nothing again), a
// failed one asked again at the next turn. A turn each: its turn is said at
// once and the player's next aim waits for it; a beat, then it glides onto its
// stroke's start and plays a little faster than the player's pace (about 3 s
// at most), a beat at its rest, and the turn is the player's again. A replay
// that outlives its time is cut as the player's is, and a stroke read late
// (a slow node), or under reduced motion, is not played at all: the ghost
// appears at its rest. Holed, it gets the cup's confetti. It replays with the
// game's own replay (engine/replay.ts), on a Live of its own like the shot
// clip's: its own ball and cut, silent, the scene's pieces set to its own tick
// while it plays (the engine holds its clock meanwhile). The ghost is built
// at the first duel: a game without one never makes it.
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { makeGhost, rivalSkin } from "../scene/gnome";
import { disposeCourse, motion } from "../scene/materials";
import { BALL_R } from "../terrain";
import { ghostSpeed, shotsOf } from "../duel";
import { makeReplay, outlived, stepsMs } from "./replay";
import type { Ghost, Stroke, Vec2 } from "../types";
import type { Gnome } from "../scene/data";
import type { GameState, Live } from "./types";

const SEEN = 0.7, AIMING = 0.45; // its opacity on its turn, and at rest while the player aims
const WAIT_MS = 4000; // a stroke slower than this to read: the turn is the player's again, the ghost at its rest once read
const BEAT_MS = 600, AFTER_MS = 1000; // its turn said before it moves; at its rest, seen, before the player's turn
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const CUT_MS = 5000; // a ghost's replay past this (a frozen tab) is cut: the engine's safety net, for the ghost
const GLIDE_MS = 450; // its walk onto its stroke's start (the tee: where the player stood), before it plays
// each ghost's strokes as read, kept with the ghost (the same ghost comes back with a rematch, or a mode toggled back)
const readsOf = new WeakMap<Ghost, (Promise<Stroke> | undefined)[]>();
const look = new THREE.Vector3(); // the camera's direction, for beside()

// gnome: the player's gnome's id (the rival wears another); cheer: the cup's confetti
export function makeRival(E: Live, { showClock, restTimed, told, warm, gnome, cheer }: { showClock: (t: number) => void; restTimed: () => void; told: () => void; warm: () => void; gnome: () => string; cheer: () => void }) {
  const { g, scene } = E;
  let ball: Gnome | null = null;
  let cut = 0, ghost: Ghost | null = null;
  // what the HUD reads: the rival's strokes replayed so far, and whether their ball is in
  // armed: this round races the ghost (a duel armed mid-round waits for the next)
  // peek: the player looking at the ghost's ball (the score card), until their next aim
  let shown = 0, holed = false, busy = false, armed = false, peek = false;
  // the game as the replay reads it: the live one, the ghost's own fields over it
  const cg: GameState = Object.assign(Object.create(g) as GameState, { flying: false, inTube: false, cause: null, replaying: null, tick0: 0 });
  // (field by field, as the clip's: what moves is read through, never copied)
  const R: Live = {
    g: cg, camera: E.camera, scene, chain: E.chain, aim: E.aim, band: E.band, causes: E.causes, screen: E.screen, ground: E.ground, lift: E.lift, zones: E.zones, log: false, quiet: true,
    mood: { joy() {}, shake() {}, hop: () => 0, tick() {} },
    publish: () => true, tickNow: () => null, landing: () => null,
    stop: () => cut++,
    showAt: showClock,
    get ball() { return ball!; },
    get cut() { return cut; },
    get dragging() { return E.dragging; },
    get shot() { return E.shot; },
    get clock() { return E.clock; },
    get mode() { return E.mode; },
    get strokeZones() { return E.strokeZones; },
  };
  const rp = makeReplay(R);

  /** The ghost's gnome, made at the first duel (again for another rival, or the
   *  player now in its skin), its see-through shaders compiled then. */
  let skin = "";
  function made(gh: Ghost) {
    const want = rivalSkin(gh.player, gnome());
    if (ball && skin === want.id) return ball;
    if (ball) (scene.remove(ball), disposeCourse(ball));
    const ghostly = makeGhost(AIMING, want);
    ball = ghostly.ball;
    fade = ghostly.fade;
    skin = want.id;
    scene.add(ball);
    warm();
    return ball;
  }
  let fade = (_: number) => {}; // the ghost's see-through, once made
  const place = (b: Gnome, x: number, y: number) => b.position.set(x, BALL_R + E.ground(x, y), y);
  /** Where the ghost stands at (x, y): beside the player's gnome if it would stand on him,
   *  side by side on screen, like two karts on a grid (display only): across the
   *  view (classic and far look one fixed way), or across the line to the cup the
   *  third-person camera looks down (on the tee it is still on the overview). */
  function beside(b: Gnome, x: number, y: number) {
    const s = g.s;
    if (!s || Math.hypot(x - g.ball.x, y - g.ball.y) > BALL_R * 2.5) return place(b, x, y);
    const d = g.cam === "third" ? { x: s.cup[0] - x, z: s.cup[1] - y } : E.camera.getWorldDirection(look), l = Math.hypot(d.x, d.z) || 1;
    place(b, x - (d.z / l) * BALL_R * 3.5, y + (d.x / l) * BALL_R * 3.5);
  }

  /** The ghost onto (x, y), gliding upright, not rolling; ends at once when cut (its turn skipped). */
  function glide(b: Gnome, [x, y]: Vec2, at: number) {
    const x0 = b.position.x, y0 = b.position.z, t0 = performance.now();
    return new Promise<void>((done) => {
      const step = (now: number) => {
        const k = Math.min((now - t0) / GLIDE_MS, 1), e = k * k * (3 - 2 * k);
        place(b, x0 + (x - x0) * e, y0 + (y - y0) * e);
        if (k < 1 && at === cut) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
  }

  /** The ghost's stroke n as the chain replays it, from the rest of stroke n - 1: read once, a failure forgotten. */
  function read(gh: Ghost, n: number): Promise<Stroke> {
    const kept = readsOf.get(gh) || [];
    readsOf.set(gh, kept);
    const shot = shotsOf(gh)[n];
    return (kept[n] ||= (n === 0 ? E.chain.replayRound(gh.hole, [shot], gh.period)
      : read(gh, n - 1).then((before) => E.chain.simulateFrom(gh.hole, before.rest, shot, n, gh.period))
    ).catch((err: unknown) => {
      kept[n] = undefined; // asked again next time
      throw err;
    }));
  }
  /** The next stroke read while the player plays theirs (none past the ghost's last). */
  const ahead = (gh: Ghost, n: number) => n < gh.strokes && void read(gh, n).catch(() => {});

  /** The ghost on the tee, nothing replayed: a new round. A duel armed mid-round waits for the next. */
  function reset() {
    cut++;
    busy = holed = peek = false;
    shown = 0;
    armed = !!ghost && !!g.s && !g.shots.length;
    if (ghost) made(ghost); // (the player may have taken its skin meanwhile)
    if (!ball) return;
    ball.visible = armed;
    if (!armed || !g.s) return;
    beside(ball, g.s.start[0], g.s.start[1]); // on the tee both balls sit on one point
    ball.scale.setScalar(1);
    ball.userData.body.quaternion.identity(); // standing, as a gnome at rest
    fade(AIMING);
  }

  /** The ghost's stroke n, played after the player's (done: the player holed
   *  it: only a stroke that ties is shown, seeing it drop too is the moment).
   *  Resolves once the turn is the player's again: the ghost at rest, cut, or
   *  its read late (it then lands when its read does). */
  async function turn(n: number, done: boolean) {
    const gh = ghost, b = ball;
    // (a turn missed before, a read that failed: this one still lands, where its own stroke rests)
    if (!gh || !b || !armed || n < shown || n >= gh.strokes || holed || (done && n + 1 < gh.strokes)) return;
    const round = g.round, at = cut, stroke = read(gh, n);
    const late = () => round === g.round && gh === ghost && armed && n >= shown;
    const mine = () => round === g.round && at === cut && gh === ghost;
    // its turn, said at once: the player's next aim waits for it
    busy = true;
    told();
    try {
      const s = await Promise.race([stroke, wait(WAIT_MS).then(() => "late" as const)]);
      if (!mine()) return;
      if (s === "late") return void stroke.then((res) => late() && land(b, res, n), () => {});
      if (motion) {
        fade(SEEN);
        cg.tick0 = Number(shotsOf(gh)[n].split(",")[2]) || 0;
        try {
          await wait(BEAT_MS);
          if (mine()) await glide(b, s.path[0], at);
          if (mine() && (await outlived(rp.replay(s.path, s.holed, s.air, s.cause, 0, ghostSpeed(stepsMs(s.path).reduce((a, x) => a + x, 0))), CUT_MS))) cut++;
        } finally {
          restTimed(); // the pieces back on the player's clock
        }
      }
      if (round !== g.round || gh !== ghost) return;
      land(b, s, n);
      if (motion) await wait(AFTER_MS);
    } finally {
      busy = false;
      told();
    }
  }

  /** The ghost at the rest of its stroke n, still (in the cup: gone). */
  function land(b: Gnome, res: Stroke, n: number) {
    shown = n + 1;
    if (ghost && !res.holed) ahead(ghost, shown);
    if (res.holed && !holed) cheer();
    holed = res.holed;
    b.visible = !holed;
    beside(b, res.rest[0], res.rest[1]);
    b.scale.setScalar(1);
    b.userData.body.quaternion.identity(); // rolled on its way: standing again at its rest
    fade(AIMING);
    told();
  }

  return {
    /** Races this ghost from the tee (null: the duel dropped). */
    race(gh: Ghost | null) {
      if (gh === ghost) return; // (the same ghost again: the race goes on)
      ghost = gh;
      if (gh) (made(gh), ahead(gh, 0));
      reset();
      told();
    },
    reset,
    /** The ghost's turn after the player's stroke n; never throws. */
    turn: (n: number, done: boolean) => turn(n, done).catch((err: unknown) => console.warn("gnogolf: the ghost's turn failed", err)),
    /** A frame: the ghost clear of the walls it runs along. */
    frame: () => ball && ball.visible && rp.offWalls(),
    busy: () => busy,
    /** The ghost's ball while it plays (and a moment at its rest), or while the player looks at it: the camera's; null otherwise. */
    at: () => ((busy || peek) && ball ? ball.position : null),
    /** The player looks at the ghost's ball, or back at theirs. */
    peek(on: boolean) {
      if ((on = on && armed && !!ball) === peek) return;
      peek = on;
      told();
    },
    /** What the HUD shows: the rival's strokes so far (null without a duel on this round:
     *  none, or one armed mid-round, which starts with the next), whether they holed, and whether they are playing. */
    state: () => ({ rival: armed ? shown : null, rivalIn: armed && holed, rivalTurn: busy, rivalPeek: peek }),
    /** The ghost's gnome, for the clip to hide (null: never made). */
    ball: () => ball,
    dispose() {
      cut++;
      if (ball) (scene.remove(ball), disposeCourse(ball));
    },
  };
}
