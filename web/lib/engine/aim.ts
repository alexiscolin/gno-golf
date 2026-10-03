// The aim preview: while the player pulls, the dots follow the path of the
// shot, bending into place; in fog they see 7 units ahead (in the mines' dark
// galleries, 7 in any weather and 4 in fog). The path is the
// chain's own answer: worked out here, in the page, by the realm's code built
// for it (lib/sim: every pull, at once), or asked of the chain (debounced,
// cached, cancelled when no longer wanted) until that is there, or wherever it
// is not. The chain is still asked once the hand rests, and for the shot let
// go: every answer it gives is checked against the page's own.
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { shotOf, pullShot, pullFull, RULES } from "../chain";
import { angDiff, onAt, segHit, rayCircle, BALL_R } from "../terrain";
import { causeAt } from "../scene/cause";
import { darkGallery, sight } from "../scene/data";
import { ud } from "../scene/data";
import { aimAlong } from "../scene";
import { same, simHole, simReady, simStroke } from "../sim";
import type { MutVec2, Stroke, Vec2 } from "../types";
import type { Live } from "./types";

const MAX_POWER = RULES.maxPower;

// Third person's aim (engine.ts steer, every frame of a pull), two ways at
// once, a slingshot's way round (the hand right turns the aim left). Within
// the zone of the press (a share of the width, and wider than a full pull on
// a narrow screen), left or right, the offset dx is the aim itself (FINE at
// the zone's edge: a pull to full power, even 45° down, never spins); pushed
// past it the aim goes on turning that way as long as it is held, the rate
// coming in gently with the distance past (SPIN_RAMP of the width, up to
// SPIN_MAX: all the way round, straight back), and back inside it stops, the
// fine aim going on from the new heading without a jump. Down from the press
// is the power, as a pull's; back within CANCEL of its height none (shot
// null: letting go there shoots nothing). yaw: the heading the fine aim is
// read from, turned on by dt seconds of spin; returns the new one, the aim
// (dir), which way it spins (-1, 0, 1), and the shot as a pull rounds it.
const FINE = (50 * Math.PI) / 180, SPIN_MAX = (150 * Math.PI) / 180, SPIN_RAMP = 0.2, CANCEL = 6;
export function steerAim(yaw: number, dx: number, down: number, dt: number, vw: number, vh: number) {
  const zone = Math.max(0.28 * vw, 1.15 * pullFull(vw, vh)), past = Math.abs(dx) - zone;
  const k = past <= 0 ? 0 : Math.min(1, past / (SPIN_RAMP * vw)), rate = k * k * (3 - 2 * k) * SPIN_MAX;
  const y = yaw - Math.sign(dx) * rate * dt, dir = y - FINE * Math.max(-1, Math.min(1, dx / zone));
  return { yaw: y, dir, spin: rate > 0 ? Math.sign(dx) : 0, shot: down < CANCEL ? null : pullShot(down, vw, vh, dir, MAX_POWER) };
}
// How much the aim dots give away, by aim mode. Assisted: the chain's whole
// path (the straight line before it answers as far as the pull is strong,
// 2 + power × 1.6 units). Pro: no line at all — the elastic and the gnome
// turning along it are the direction, like a real putter — and the chain is
// not asked. Rounds of each mode are ranked apart on the chain.

/** The first len units along path, the last one cut short. */
function clipPath(path: readonly Vec2[], len: number) {
  const out: Vec2[] = [path[0]];
  let left = len;
  for (let i = 1; i < path.length && left > 0; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = path[i], l = Math.hypot(bx - ax, by - ay);
    if (l <= left) (out.push(path[i]), (left -= l));
    else (out.push([ax + ((bx - ax) * left) / l, ay + ((by - ay) * left) / l]), (left = 0));
  }
  return out;
}


/** One preview asked of the chain: the aim, the round so far, the tick, and the shot string sent. */
interface Question {
  angle: number;
  deg?: number;
  power: number;
  shots: readonly string[];
  id: string;
  rest: Vec2 | null;
  n: number;
  round: number | undefined;
  tick: number | null;
  shot: string;
  key: string;
}
type Wanted = Pick<Question, "angle" | "deg" | "power" | "shots" | "id">;

export function makeAimer(E: Live) {
  const { g, chain, aim, band, ground } = E;
  const shows = () => (g.roundMode || E.mode) !== "pro";
  let shown: { angle: number } | null = null; // the aim the dots on screen were computed for (see interpolate)
  const straight: [MutVec2, MutVec2] = [[0, 0], [0, 0]]; // the provisional line (reused), until the chain answers
  // The chain's dots bend into place from where the straight ones were: each
  // dot glides to its new spot over 120 ms (one blend of the instance matrices).
  const MORPH_MS = 120;
  let morph: { from: THREE.TypedArray; to: THREE.TypedArray; n: number; t0: number } | null = null;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _q = new THREE.Quaternion(), _mm = new THREE.Matrix4();
  function snapDots() {
    const d = aim.userData.dots;
    if (!d || !d.count || !aim.visible) return null;
    return d.instanceMatrix.array.slice(0, d.count * 16);
  }
  function morphFrom(was: THREE.TypedArray | null) {
    const d = aim.userData.dots;
    if (!was || !d || !d.count) return void (morph = null);
    morph = { from: was, to: d.instanceMatrix.array.slice(0, d.count * 16), n: d.count, t0: performance.now() };
  }
  function stepMorph(now: number) {
    const d = aim.userData.dots;
    if (!morph || !d) return;
    const k = Math.min(1, (now - morph.t0) / MORPH_MS), e = 1 - (1 - k) * (1 - k);
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
  // (the hole's, and the stroke's own: its extras')
  const ghosts = (on: boolean) => {
    for (const o of [g.course, E.extras]) if (o) ud(o).ghosts?.(on);
  };
  const dropAim = () => {
    // a preview on its way is no longer wanted
    if (asked) asked.abort(), (asked = null), (asking = false);
    (mineWant = null), (mineShown = "");
    clearTimeout(later);
    (since = 0), (armed = "");
    morph = null;
    ghosts(false);
    aim.visible = band.visible = false;
    shown = null;
    sent = null; // the next pull draws the kept answer for the same aim
    aim.rotation.set(0, 0, 0);
    aim.position.set(0, 0, 0);
  };
  // The aim is the chain's own answer: while the player pulls, the shot is
  // previewed with Simulate (read-only, free) and the dots follow the path it
  // returns, bounces included. One request in flight at a time; the latest
  // pull wins.
  let asking = false, wanted: Wanted | null = null;
  // Debounced: every preview is a query on a shared node (one stroke's work,
  // from the exact ball: see strokeFrom), so a pull
  // asks once the hand rests PREVIEW_MS (and every PREVIEW_MAX at least while
  // it keeps moving), not at all for a change too small to see, and never
  // twice for one shot: the answers are kept by the very shot the chain was
  // asked (hole, round so far, weather period, angle, power and tick, as
  // rounded for the chain), for this hole. A request the pull no longer
  // wants (let go, cancelled, a new round) is cancelled.
  const PREVIEW_MS = 120, PREVIEW_MAX = 360, KEPT = 256;
  let sent: Question | null = null, armed = "", later: ReturnType<typeof setTimeout> | undefined, since = 0, asked: AbortController | null = null;
  const answers = new Map<string, Stroke>(), mine = new Map<string, Stroke>(); // the chain's answers, the page's own
  const keep = (m: Map<string, Stroke>, k: string, res: Stroke) => {
    m.delete(k);
    m.set(k, res);
    if (m.size > KEPT) m.delete(m.keys().next().value!);
  };
  const keyOf = (q: Pick<Question, "id" | "shots" | "shot">) => `${q.id}|${g.period}|${q.shots.join(";")}|${q.shot}`;
  // One stroke asked of the chain: the first from the tee (SimulateRound of
  // that one shot: the tee exactly), every other one from the exact ball the
  // last answer left (SimulateFrom): one shot of work, whatever the round's
  // length. It is what PlayRoundAt will replay for the same list.
  // Every answer is checked against the page's own for the same call, when
  // it has one: a difference turns the page's previews off (lib/sim).
  // (own: the page's answer for this stroke, not worked out again)
  function strokeFrom(id: string, shots: readonly string[], one: string, rest: Vec2 | null, ms?: number, signal?: AbortSignal, own?: Stroke): Promise<Stroke> {
    const period = g.period, key = keyOf({ id, shots, shot: one });
    return (shots.length && rest && period != null
      ? chain.simulateFrom(id, rest, one, shots.length, period, ms, signal)
      : chain.simulateRound(id, [...shots, one], period, ms, signal)
    ).then((res) => {
      if (period != null && simReady(id))
        void Promise.resolve(own || mine.get(key) || simStroke(id, shots, one, rest, period)).then((o) => simReady(id) && same(res, o, { hole: id, period, shot: one, n: shots.length }));
      return res;
    });
  }
  // The page's own answer for the aim: at most one worked out at a time, the
  // latest pull next; drawn the moment it is there.
  let mineAsking = false, mineWant: Question | null = null, mineShown = "";
  function local(q: Question) {
    mineWant = q;
    if (mineAsking || q.key === mineShown) return;
    mineAsking = true;
    void simStroke(q.id, q.shots, q.shot, q.rest, g.period!)
      .then((res) => {
        if (!res) return;
        keep(mine, q.key, res);
        mineShown = q.key;
        answer(q, res);
      })
      .finally(() => {
        mineAsking = false;
        if (E.dragging && mineWant && mineWant.key !== q.key) local(mineWant);
      });
  }
  // While the new aim is worked out, the dots given for the last one swing
  // round the ball to where the pull points now, so they never lag the hand;
  // the new answer replaces them the moment it lands.
  function interpolate() {
    if (!shown || !aim.visible) return;
    const d = E.shot.angle - shown.angle, bx = g.ball.x, bz = g.ball.y;
    aim.rotation.y = -d;
    const c = Math.cos(d), sn = Math.sin(d);
    aim.position.set(bx - (bx * c - bz * sn), 0, bz - (bx * sn + bz * c));
  }
  // the share of a straight run of len along angle the ball goes before its edge meets a wall or a post (1: nothing)
  const SWING_MAX = 0.12; // radians
  function firstHit(angle: number, len: number) {
    if (!g.s) return 1;
    const ox = g.ball.x, oz = g.ball.y, cx = ox + Math.cos(angle) * len, cz = oz + Math.sin(angle) * len, tick = Math.floor(E.clock);
    let t = 1;
    for (const w of g.s.walls) {
      if (!onAt(w, tick)) continue;
      const h = segHit(ox, oz, cx, cz, w.a, w.b);
      if (h >= 0 && h < t) t = h;
    }
    for (const p of g.s.posts) {
      const h = rayCircle(ox, oz, cx, cz, p.c, p.r + BALL_R);
      if (h > 0 && h < t) t = h;
    }
    return Math.max(0, t - BALL_R / len);
  }
  function preview() {
    interpolate();
    if (!(E.shot.power > 0.3)) return; // too soft to shoot: nothing to ask
    if (!shows()) return void (aim.visible = false); // pro: no line, no request
    // the chain's dots swung round the ball stand for the new aim only while
    // it is close to theirs: past that they would cross walls, and the
    // straight line (stopped at the first thing in the way) says it better
    if (shown && Math.abs(angDiff(E.shot.angle, shown.angle)) > SWING_MAX) shown = null;
    // no answer from the chain yet for this pull: a straight line of dots
    // along the aim, stopped at the first wall or post, replaced by the
    // chain's the moment it lands
    if (!shown && g.ball) {
      const reach = 2 + (E.shot.power / MAX_POWER) * 16, len = reach * firstHit(E.shot.angle, reach);
      straight[0][0] = g.ball.x, straight[0][1] = g.ball.y;
      straight[1][0] = g.ball.x + Math.cos(E.shot.angle) * len, straight[1][1] = g.ball.y + Math.sin(E.shot.angle) * len;
      aimAlong(aim, straight, E.shot.power, ground);
      aim.visible = true;
    }
    if (!g.id) return;
    wanted = { angle: E.shot.angle, deg: E.shot.deg, power: E.shot.power, shots: g.shots, id: g.id };
    // asked (or being asked) already: the aim has not changed enough to see,
    // nor the pieces moved on. The dots stay; but once the hand rests on this
    // exact aim it is asked once, so that the release finds its answer kept
    // (fire: no second round trip)
    const q = question(wanted);
    if (simReady(q.id) && g.period != null) {
      local(q);
      // the chain, once the hand rests on a new aim (not for the timed
      // pieces moving on under a still hand): its answer kept for the
      // release, and checked against this one. The timer is armed once per
      // aim (armed): third person previews every frame, and re-arming it
      // each time would never let it fire
      const moved = !sent || sent.id !== q.id || sent.n !== q.n || sent.angle !== q.angle || sent.power !== q.power;
      const at = `${q.id}|${q.n}|${q.angle}|${q.power}`;
      if (moved && at !== armed && !answers.has(q.key) && !asking) (armed = at), clearTimeout(later), (later = setTimeout(ask, PREVIEW_MS));
      return;
    }
    void simHole(chain, q.id); // the page's own previews, for the next pulls
    if (sent && sent.id === wanted.id && sent.n === wanted.shots.length && sent.tick === E.tickNow() &&
        Math.abs(sent.angle - wanted.angle) < 0.005 && Math.abs(sent.power - wanted.power) < 0.05) {
      if (sent.key !== q.key && !answers.has(q.key) && !asking) (clearTimeout(later), (later = setTimeout(ask, PREVIEW_MS)));
      return;
    }
    const kept = answers.get(q.key);
    if (kept) return void ((since = 0), clearTimeout(later), (sent = q), answer(q, kept));
    if (asking) return; // the one in flight lands first; the latest aim goes out after it
    const now = performance.now();
    if (!since) since = now;
    clearTimeout(later);
    later = setTimeout(ask, Math.max(0, Math.min(PREVIEW_MS, PREVIEW_MAX - (now - since))));
  }
  // the preview for the aim as it is now
  function question(w: Wanted): Question {
    const tick = E.tickNow();
    // in the chain's steps of 0.01, as a pull is (a demo's settling aim is not): a finer one it refuses
    const shot = shotOf(w.deg != null ? w.deg : pullShot(0, 1, 1, w.angle).deg, Math.round(w.power * 100) / 100, tick);
    return { ...w, rest: g.rest, n: w.shots.length, round: g.round, tick, shot, key: keyOf({ id: w.id, shots: w.shots, shot }) };
  }
  function ask() {
    armed = "";
    if (!E.dragging || !wanted || asking) return;
    since = 0;
    const q = (sent = question(wanted));
    const kept = answers.get(q.key);
    if (kept) return void (simReady(q.id) || answer(q, kept));
    asking = true;
    const ac = (asked = new AbortController());
    // a chain slow to answer does not hold the aim: after 1.5 s the request is
    // let go, and the next one (the latest aim) goes out
    strokeFrom(q.id, q.shots, q.shot, q.rest, 1500, ac.signal)
      .then((res) => {
        keep(answers, q.key, res);
        if (!simReady(q.id)) answer(q, res); // (the page's own are drawn already)
      })
      .catch(() => {})
      .finally(() => {
        if (asked === ac) (asked = null), (asking = false);
        if (E.dragging) preview();
      });
  }
  // the chain's dots for q, if the pull still wants them
  function answer(q: Question, res: Stroke) {
    if (!(E.dragging && q.id === g.id && q.round === g.round && q.n === g.shots.length)) return;
    const was = snapDots();
    aimAlong(aim, fogged(res.path), q.power, ground, E.landing, dotTint(q));
    morphFrom(was);
    shown = { angle: q.angle };
    aim.rotation.y = 0;
    aim.position.set(0, 0, 0);
    interpolate();
    Object.assign(drawn, { n: drawn.n + 1, at: performance.now(), angle: q.angle, power: q.power });
  }
  const drawn = { n: 0, at: 0, angle: 0, power: 0 }; // the last answer drawn: its number, when, its aim (the perf rigs: probes aimDrawn)

  // The dots take the colour of what bends them: wind blue, a downhill slope
  // gold, ice or a wet green cyan — the same causes the replay shows.
  const TINT: Record<string, THREE.Color> = { wind: new THREE.Color(0x8fc9ff), slope: new THREE.Color(0xffd36b), tilt: new THREE.Color(0xffd36b), ice: new THREE.Color(0x9ff3ff), wet: new THREE.Color(0x9ff3ff) };
  const dotTint = (q: Question) => {
    const zs = E.zones();
    const vx = Math.cos(q.angle), vy = Math.sin(q.angle), t = q.tick || 0;
    return (_i: number, x: number, z: number) => {
      const c = causeAt(zs, x, z, vx, vy, t);
      return c ? TINT[c.kind] : null;
    };
  };

  // in fog the dots see only 7 units ahead: it hinders the aim without blinding it
  const fogged = (path: readonly Vec2[]) => {
    const reach = sight(!!(g.weather && g.weather.fog), !!g.s && darkGallery({ hole: g.s.slot || g.s.hole }));
    return reach ? clipPath(path, reach) : path;
  };

  return {
    preview,
    dropAim,
    strokeFrom,
    /** The dashed outlines of the timed pieces that are away: shown while aiming. */
    ghosts,
    /** One frame of the dots bending into place. */
    step: stepMorph,
    /** Whether the dots are moving (the frame is busy). */
    moving: () => !!morph,
    /** The answers drawn so far, and when the last one was (performance.now()). */
    drawn: () => ({ ...drawn }),
    /** Whether this round's mode shows the dots at all (pro: no). */
    shows,
    /** The preview answer for exactly this stroke (same hole, period, round so far and shot string), or undefined. */
    known: (id: string, shots: readonly string[], shot: string) => answers.get(keyOf({ id, shots, shot })),
    /** The hole is read anew: so are its previews. */
    forget: () => void (answers.clear(), mine.clear(), (sent = null), (mineShown = "")),
  };
}
