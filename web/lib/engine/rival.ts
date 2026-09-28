// The rival of a ghost duel (ADR-004): another player's best, replayed stroke
// by stroke on a see-through gnome of its own, after each of the player's.
//
// Nothing about the player's round changes: the ghost is drawn only, the two
// balls pass through each other, and its strokes are free reads (the first
// with SimulateRoundIn from the tee, each later one with SimulateFrom from the
// rest before, all in the ghost's own period): one read ahead, each kept once
// it answers (a rematch, or the other mode and back, reads nothing again), a
// failed one asked again at the next turn. Its turn never makes the player
// wait: it plays at twice the speed (its steps in about 2 s), a press that
// starts an aim cuts it (the ghost put at its rest), a replay that outlives
// its time is cut as the player's is, and a
// stroke read late, or once the player aims again, or under reduced motion,
// is not played at all: the ghost appears at its rest. It replays with the
// game's own replay (engine/replay.ts), on a Live of its own like the shot
// clip's: its own ball and cut, silent, the scene's pieces set to its own tick
// while it plays (the engine holds its clock meanwhile). The ghost is built
// at the first duel: a game without one never makes it.
//
// E: the engine's live state (engine/types.ts Live).
import { BackSide } from "three";
import { makeBall } from "../scene";
import { C, THIN_HULL, disposeCourse, ownFade, setFade } from "../scene/materials";
import { reducedMotion } from "../device";
import { BALL_R } from "../terrain";
import { ghostSpeed, shotsOf } from "../duel";
import { makeReplay, outlived, stepsMs } from "./replay";
import type { Ghost, Stroke } from "../types";
import type { Gnome } from "../scene/data";
import type { GameState, Live } from "./types";

// the ghost's look: paper white, inked thin as a gnome is, see-through (and nobody's skin)
const PAPER = { id: "ghost", name: "Ghost", line: "", hat: C.cream, body: C.cream, hair: C.cream, beard: "full" } as const;
const SEEN = 0.7, AIMING = 0.45; // its opacity on its turn, and at rest while the player aims
const WAIT_MS = 1500; // a stroke slower than this to read: the ghost jumps to its rest when it lands
const CUT_MS = 5000; // a ghost's replay past this (a frozen tab) is cut: the engine's safety net, for the ghost
// each ghost's strokes as read, kept with the ghost (the same ghost comes back with a rematch, or a mode toggled back)
const readsOf = new WeakMap<Ghost, (Promise<Stroke> | undefined)[]>();
const reduced = reducedMotion();

export function makeRival(E: Live, { showClock, restTimed, told, warm }: { showClock: (t: number) => void; restTimed: () => void; told: () => void; warm: () => void }) {
  const { g, scene } = E;
  let ball: Gnome | null = null, mats: ReturnType<typeof ownFade> = [];
  let cut = 0, ghost: Ghost | null = null;
  // what the HUD reads: the rival's strokes replayed so far, and whether their ball is in
  // armed: this round races the ghost (a duel armed mid-round waits for the next)
  let shown = 0, holed = false, busy = false, armed = false;
  // the game as the replay reads it: the live one, the ghost's own fields over it
  const cg: GameState = Object.assign(Object.create(g) as GameState, { flying: false, inTube: false, cause: null, replaying: null, tick0: 0 });
  const R: Live = {
    ...E,
    g: cg,
    quiet: true,
    publish: () => true,
    mood: { joy() {}, shake() {}, hop: () => 0, tick() {} },
    stop: () => cut++,
    showAt: showClock,
    get ball() { return ball!; },
    get cut() { return cut; },
  };
  const rp = makeReplay(R);

  /** The ghost's gnome, made at the first duel, its see-through shaders compiled then. */
  function made() {
    if (ball) return ball;
    ball = makeBall(PAPER);
    mats = ownFade(ball, THIN_HULL);
    ball.userData.shade.visible = false; // no shadow: a ghost
    // its outline drawn after its body, against the body's depth: an ink rim, not an x-ray
    ball.traverse((o) => { if ("material" in o && (o.material as { side?: number }).side === BackSide) o.renderOrder = 1; });
    scene.add(ball);
    fade(AIMING);
    warm();
    return ball;
  }
  // see-through, but each part hides what is behind it (its eyes do not show through its head)
  const fade = (o: number) => mats.forEach((m) => (setFade(m, o), (m.depthWrite = true)));
  const place = (b: Gnome, x: number, y: number) => b.position.set(x, BALL_R + E.ground(x, y), y);
  /** Where the ghost stands at (x, y): beside the player's gnome if it would stand on him,
   *  across the line to the cup, like two karts on a grid (display only). */
  function beside(b: Gnome, x: number, y: number) {
    const s = g.s, dx = x - g.ball.x, dy = y - g.ball.y;
    if (!s || Math.hypot(dx, dy) > BALL_R * 2.5) return place(b, x, y);
    const cx = s.cup[0] - x, cy = s.cup[1] - y, l = Math.hypot(cx, cy) || 1;
    place(b, x - (cy / l) * BALL_R * 3.5, y + (cx / l) * BALL_R * 3.5);
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
    busy = holed = false;
    shown = 0;
    armed = !!ghost && !!g.s && !g.shots.length;
    if (!ball) return;
    ball.visible = armed;
    if (!armed || !g.s) return;
    beside(ball, g.s.start[0], g.s.start[1]); // on the tee both balls sit on one point
    ball.scale.setScalar(1);
    fade(AIMING);
  }

  /** The ghost's stroke n, played after the player's (done: the player holed
   *  it: only a stroke that ties is shown, seeing it drop too is the moment);
   *  resolves when it rests, or is cut. */
  async function turn(n: number, done: boolean) {
    const gh = ghost, b = ball;
    // (a turn missed before, a read that failed: this one still lands, where its own stroke rests)
    if (!gh || !b || !armed || n < shown || n >= gh.strokes || holed || (done && n + 1 < gh.strokes)) return;
    const round = g.round, at = cut, stroke = read(gh, n);
    const s = await Promise.race([stroke, new Promise<"late">((r) => setTimeout(() => r("late"), WAIT_MS))]);
    if (round !== g.round || at !== cut || gh !== ghost) return;
    // late, or the player aiming again (on a timed hole the pieces are theirs): straight to its rest
    const res = s === "late" ? await stroke : s;
    if (round !== g.round || gh !== ghost || n < shown) return;
    if (s === "late" || reduced || g.aiming || g.flying) return land(b, res, n);
    busy = true;
    fade(SEEN);
    cg.tick0 = Number(shotsOf(gh)[n].split(",")[2]) || 0;
    try {
      if (await outlived(rp.replay(res.path, res.holed, res.air, res.cause, 0, ghostSpeed(stepsMs(res.path).reduce((a, x) => a + x, 0))), CUT_MS)) cut++;
    } finally {
      busy = false;
      restTimed(); // the pieces back on the player's clock
      if (round === g.round && gh === ghost) land(b, res, n);
    }
  }

  /** The ghost at the rest of its stroke n, still (in the cup: gone). */
  function land(b: Gnome, res: Stroke, n: number) {
    shown = n + 1;
    if (ghost && !res.holed) ahead(ghost, shown);
    holed = res.holed;
    b.visible = !holed;
    beside(b, res.rest[0], res.rest[1]);
    b.scale.setScalar(1);
    fade(AIMING);
    told();
  }

  return {
    /** Races this ghost from the tee (null: the duel dropped). */
    race(gh: Ghost | null) {
      ghost = gh;
      if (gh) (made(), ahead(gh, 0));
      reset();
      told();
    },
    reset,
    /** The ghost's turn after the player's stroke n; never throws. */
    turn: (n: number, done: boolean) => turn(n, done).catch((err: unknown) => console.warn("gnogolf: the ghost's turn failed", err)),
    /** Cuts the ghost's turn: it jumps to where its stroke rests. */
    skip: () => busy && cut++,
    /** A frame: the ghost clear of the walls it runs along. */
    frame: () => ball && ball.visible && rp.offWalls(),
    busy: () => busy,
    /** The ghost's ball while it plays, for the camera to frame with the player's; null otherwise. */
    at: () => (busy && ball ? ball.position : null),
    /** What the HUD shows: the rival's strokes so far and whether they holed; null without a
     *  duel on this round (none, or one armed mid-round: it starts with the next). */
    state: () => (armed ? { strokes: shown, holed } : null),
    /** The ghost's gnome, for the clip to hide (null: never made). */
    ball: () => ball,
    dispose() {
      cut++;
      if (ball) (scene.remove(ball), disposeCourse(ball));
    },
  };
}
