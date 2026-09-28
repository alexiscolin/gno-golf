// The rival of a ghost duel (ADR-004): another player's best, replayed stroke
// by stroke on a see-through gnome of its own, after each of the player's.
//
// Nothing about the player's round changes: the ghost is drawn only, the two
// balls pass through each other, and its strokes are free reads (the first
// with SimulateRoundIn from the tee, each later one with SimulateFrom from the
// rest before, all in the ghost's own period), read ahead in the background.
// Its turn never makes the player wait: it plays at twice the speed (at most
// 2 s), and a press that starts an aim cuts it, the ghost put at its rest. It
// replays with the game's own replay (engine/replay.ts), on a Live of its own
// like the shot clip's: its own ball and cut, silent, the scene's pieces set
// to its own tick while it plays (the engine holds its clock meanwhile).
//
// E: the engine's live state (engine/types.ts Live).
import { makeBall } from "../scene";
import { C, disposeCourse, ownFade, setFade } from "../scene/materials";
import { BALL_R } from "../terrain";
import { ghostSpeed, shotsOf } from "../duel";
import { makeReplay, showMs } from "./replay";
import type { Ghost, Stroke } from "../types";
import type { GameState, Live } from "./types";

// the ghost's look: paper white, inked thin, see-through (and nobody's skin)
const PAPER = { id: "ghost", name: "Ghost", line: "", hat: C.cream, body: C.cream, hair: C.cream, beard: "full" } as const;
const SEEN = 0.45, AIMING = 0.2; // its opacity on its turn, and while the player aims
const WAIT_MS = 1500; // a stroke slower than this to read: the ghost jumps to its rest when it lands

export function makeRival(E: Live, { showClock, restTimed, told }: { showClock: (t: number) => void; restTimed: () => void; told: () => void }) {
  const { g, scene } = E;
  const ball = makeBall(PAPER);
  const mats = ownFade(ball, 0.028);
  ball.userData.shade.visible = false; // no shadow: a ghost
  ball.visible = false;
  scene.add(ball);

  let cut = 0, ghost: Ghost | null = null, strokes: Promise<Stroke | null>[] = [];
  // what the HUD reads: the rival's strokes replayed so far, and whether their ball is in
  let shown = 0, holed = false, busy = false;
  // the game as the replay reads it: the live one, the ghost's own fields over it
  const cg: GameState = Object.assign(Object.create(g) as GameState, { flying: false, inTube: false, cause: null, replaying: null, tick0: 0 });
  const R: Live = {
    ...E,
    g: cg,
    quiet: true,
    ball,
    publish: () => true,
    mood: { joy() {}, shake() {}, hop: () => 0, tick() {} },
    stop: () => cut++,
    showAt: showClock,
    landing: () => null,
    get clock() { return E.clock; },
    get cut() { return cut; },
    get dragging() { return E.dragging; },
    get shot() { return E.shot; },
    get mode() { return E.mode; },
    get strokeZones() { return E.strokeZones; },
  };
  const rp = makeReplay(R);

  const fade = (o: number) => mats.forEach((m) => setFade(m, o));
  const place = (x: number, y: number) => ball.position.set(x, BALL_R + E.ground(x, y), y);

  /** Reads the ghost's strokes one after the other, each from the rest before, ahead of play. */
  function readAll(gh: Ghost) {
    const shots = shotsOf(gh);
    let prev: Promise<Stroke | null> = Promise.resolve(null);
    strokes = shots.map((shot, i) => (prev = prev.then((before) =>
      i === 0 ? E.chain.replayRound(gh.hole, [shot], gh.period)
        : before ? E.chain.simulateFrom(gh.hole, before.rest, shot, i, gh.period) : null).catch(() => null)));
  }

  /** Puts the ghost back on the tee, nothing replayed (a new round). */
  function reset() {
    cut++;
    busy = holed = false;
    shown = 0;
    ball.scale.setScalar(1);
    if (!ghost || !g.s) return void (ball.visible = false);
    // on the tee both balls sit on one point: the ghost stands on its far side (display only)
    place(g.s.start[0], g.s.start[1]);
    ball.userData.body.position.set(0, 0, -BALL_R * 1.2);
    ball.visible = true;
    fade(AIMING);
  }

  /** The ghost's stroke n, played after the player's (done: the player's holed it:
   *  only a stroke that ties is shown, seeing it drop too is the moment);
   *  resolves when it rests, or is cut. */
  async function turn(n: number, done: boolean) {
    if (!ghost || n >= ghost.strokes || holed || (done && n + 1 < ghost.strokes)) return;
    const round = g.round, at = cut, gh = ghost;
    const s = await Promise.race([strokes[n], new Promise<"late">((r) => setTimeout(() => r("late"), WAIT_MS))]);
    if (round !== g.round || at !== cut || gh !== ghost) return;
    // a slow answer: the aim comes back; the ghost jumps to its rest when it lands
    const res = s === "late" ? await strokes[n] : s;
    if (!res || round !== g.round || gh !== ghost) return;
    if (s === "late" || at !== cut) return land(res, n);
    busy = true;
    ball.userData.body.position.set(0, 0, 0);
    fade(SEEN);
    cg.tick0 = Number(shotsOf(gh)[n].split(",")[2]) || 0;
    let ms = 0;
    for (let i = 0; i + 1 < res.path.length; i++) ms += showMs(Math.hypot(res.path[i + 1][0] - res.path[i][0], res.path[i + 1][1] - res.path[i][1]));
    try {
      await rp.replay(res.path, res.holed, res.air, res.cause, 0, ghostSpeed(ms));
    } finally {
      busy = false;
      restTimed(); // the pieces back on the player's clock
      if (round === g.round && gh === ghost) land(res, n);
    }
  }

  /** The ghost at the rest of its stroke n, still. */
  function land(res: Stroke, n: number) {
    shown = n + 1;
    holed = res.holed;
    if (!holed) place(res.rest[0], res.rest[1]), ball.scale.setScalar(1);
    else ball.visible = false; // in the cup
    ball.userData.body.position.set(0, 0, 0);
    fade(AIMING);
    told();
  }

  return {
    /** Races this ghost from the tee (null: the duel dropped). */
    race(gh: Ghost | null) {
      ghost = gh;
      strokes = [];
      if (gh) readAll(gh);
      reset();
      told();
    },
    reset: () => (reset(), told()),
    turn,
    /** Cuts the ghost's turn: it jumps to where its stroke rests. */
    skip: () => busy && cut++,
    /** A frame: the ghost clear of the walls it runs along. */
    frame: () => ball.visible && rp.offWalls(),
    busy: () => busy,
    /** What the HUD shows: the rival's strokes so far and whether they holed; null without a duel. */
    state: () => (ghost ? { strokes: shown, holed } : null),
    ball,
    dispose() {
      cut++;
      scene.remove(ball);
      disposeCourse(ball);
    },
  };
}
