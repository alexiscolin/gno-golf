// The aim preview: while the player pulls, the chain is asked what the shot
// would do (debounced, cached, cancelled when no longer wanted) and the dots
// follow its path, bending into place; in fog they see 7 units ahead.
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { shotOf, RULES } from "../chain";
import { angDiff, onAt, segHit, rayCircle, BALL_R } from "../terrain";
import { causeAt } from "../scene/cause";
import { aimAlong } from "../scene";
import type { Mode, MutVec2, Stroke, Vec2 } from "../types";
import type { Live } from "./types";

const MAX_POWER = RULES.maxPower;

// Third person's aim: the shot flies opposite the pull, like the classic
// slingshot, so every direction is reachable — pull straight down to shoot
// ahead, up to shoot back at the camera, sideways to shoot across. The pull
// (dx right, dy down, on the screen) is read in the camera frame frozen when
// the pull began (yaw0: where the view looked), so the camera trailing the aim
// never feeds back into it. Screen up is yaw0, screen right is yaw0 + 90°.
// Near the start (DEAD px) the direction holds; fine (Shift) moves the aim a
// third as far towards where the drag points; otherwise a light smoothing.
// A move mostly along the pull (mx, my: the pointer's last step), in or out,
// sets the power and leaves the direction: at a short pull a hand's slight
// sideways drift would otherwise swing the aim more than the power changes.
const DEAD = 18, RADIAL = 1.5;
export function thirdAim(yaw0: number, dx: number, dy: number, prev?: number | null, fine = false, mx = 0, my = 0) {
  const r = Math.hypot(dx, dy);
  if (r < DEAD && prev != null) return prev;
  if (prev != null && r > 0) {
    const along = (mx * dx + my * dy) / r, across = (mx * dy - my * dx) / r;
    if (Math.abs(along) > RADIAL * Math.abs(across)) return prev;
  }
  const want = yaw0 + Math.atan2(-dx, dy);
  if (prev == null) return want;
  return prev + angDiff(want, prev) * (fine ? 0.33 : 0.6);
}
// How much the aim dots give away, by aim mode. Assisted: the chain's whole
// path, as far as the pull is strong (2 + power × 1.6 units). Pro: no line at
// all — the elastic and the gnome turning along it are the direction, like a
// real putter — and the chain is not asked. ("first-contact" is kept for a
// middle mode: up to the first thing the ball meets, maxLen units at most.)
// Rounds of each mode are ranked apart on the chain.
/** How far the dots show: to the end, to the first contact, or not at all; and how long at most. */
interface Preview {
  stopAt: "none" | "first-contact" | "hidden";
  maxLen: number;
}
const PREVIEWS: Record<Mode, Preview> = {
  assisted: { stopAt: "none", maxLen: Infinity },
  pro: { stopAt: "hidden", maxLen: 0 },
};
// in pro, aimAlong is given the power that makes its reach maxLen (and the
// dots' size), the same whatever the pull
const proPower = (p: Preview) => Math.min(MAX_POWER, ((p.maxLen - 2) / 16) * MAX_POWER + 0.5);

/** The first len units along path (of its first n points), the last one cut short. */
function clipPath(path: readonly Vec2[], len: number, n = path.length) {
  const out: Vec2[] = [path[0]];
  let left = len;
  for (let i = 1; i < n && left > 0; i++) {
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
  const PREVIEW = () => PREVIEWS[g.roundMode || E.mode];
  const dotPower = (p: number) => (PREVIEW().stopAt === "none" ? p : proPower(PREVIEW()));
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
  const ghosts = (on: boolean) => g.course && g.course.userData.ghosts && g.course.userData.ghosts(on);
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
  let sent: Question | null = null, later: ReturnType<typeof setTimeout> | undefined, since = 0, asked: AbortController | null = null;
  const answers = new Map<string, Stroke>();
  const keyOf = (q: Pick<Question, "id" | "shots" | "shot">) => `${q.id}|${g.period}|${q.shots.join(";")}|${q.shot}`;
  // One stroke asked of the chain: the first from the tee (SimulateRound of
  // that one shot: the tee exactly), every other one from the exact ball the
  // last answer left (SimulateFrom): one shot of work, whatever the round's
  // length. It is what PlayRoundAt will replay for the same list.
  function strokeFrom(id: string, shots: readonly string[], one: string, rest: Vec2 | null, ms?: number, signal?: AbortSignal): Promise<Stroke> {
    return shots.length && rest && g.period != null
      ? chain.simulateFrom(id, rest, one, shots.length, g.period, ms, signal)
      : chain.simulateRound(id, [...shots, one], g.period, ms, signal);
  }
  // While the chain works out the new aim, the dots it gave for the last one
  // swing round the ball to where the pull points now, so they never lag the
  // hand; the chain's answer replaces them the moment it lands.
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
    if (PREVIEW().stopAt === "hidden") return void (aim.visible = false); // pro: no line, no request
    // the chain's dots swung round the ball stand for the new aim only while
    // it is close to theirs: past that they would cross walls, and the
    // straight line (stopped at the first thing in the way) says it better
    if (shown && Math.abs(angDiff(E.shot.angle, shown.angle)) > SWING_MAX) shown = null;
    // no answer from the chain yet for this pull: a straight line of dots
    // along the aim, stopped at the first wall or post, replaced by the
    // chain's the moment it lands
    if (!shown && g.ball) {
      const reach = Math.min(PREVIEW().maxLen, 2 + (E.shot.power / MAX_POWER) * 16), len = reach * firstHit(E.shot.angle, reach);
      straight[0][0] = g.ball.x, straight[0][1] = g.ball.y;
      straight[1][0] = g.ball.x + Math.cos(E.shot.angle) * len, straight[1][1] = g.ball.y + Math.sin(E.shot.angle) * len;
      aimAlong(aim, straight, dotPower(E.shot.power), ground);
      aim.visible = true;
    }
    if (!g.id) return;
    wanted = { angle: E.shot.angle, deg: E.shot.deg, power: E.shot.power, shots: g.shots, id: g.id };
    // asked (or being asked) already: the aim has not changed enough to see,
    // nor the pieces moved on. The dots stay; but once the hand rests on this
    // exact aim it is asked once, so that the release finds its answer kept
    // (fire: no second round trip)
    const q = question(wanted);
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
    const shot = shotOf(w.deg != null ? w.deg : (w.angle * 180) / Math.PI, w.power, tick);
    return { ...w, rest: g.rest, n: w.shots.length, round: g.round, tick, shot, key: keyOf({ id: w.id, shots: w.shots, shot }) };
  }
  function ask() {
    if (!E.dragging || !wanted || asking) return;
    since = 0;
    const q = (sent = question(wanted));
    const kept = answers.get(q.key);
    if (kept) return answer(q, kept);
    asking = true;
    const ac = (asked = new AbortController());
    // a chain slow to answer does not hold the aim: after 1.5 s the request is
    // let go, and the next one (the latest aim) goes out
    strokeFrom(q.id, q.shots, q.shot, q.rest, 1500, ac.signal)
      .then((res) => {
        answers.delete(q.key);
        answers.set(q.key, res);
        if (answers.size > KEPT) answers.delete(answers.keys().next().value!);
        answer(q, res);
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
    aimAlong(aim, fogged(previewPath(res)), dotPower(q.power), ground, E.landing, dotTint(q));
    morphFrom(was);
    shown = { angle: q.angle };
    aim.rotation.y = 0;
    aim.position.set(0, 0, 0);
    interpolate();
  }

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

  // The chain's path cut where the preview stops (see PREVIEW): at the first
  // contact, and at maxLen units along it whatever the power.
  function previewPath(res: Stroke) {
    const path = res.path, why = res.cause.length === path.length ? res.cause : "";
    let stop = path.length;
    const P = PREVIEW();
    if (P.stopAt === "first-contact") {
      for (let i = 1; i < path.length; i++) {
        const c = why[i];
        const hit = (c && c !== "-") || E.landing(path[i - 1], path[i]) != null;
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
    return clipPath(path, P.maxLen, stop);
  }

  // in fog the dots see only 7 units ahead: it hinders the aim without blinding it
  const fogged = (path: readonly Vec2[]) => (g.weather && g.weather.fog ? clipPath(path, 7) : path);

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
    /** Whether this round's mode shows the dots at all (pro: no). */
    shows: () => PREVIEW().stopAt !== "hidden",
    /** The preview answer for exactly this stroke (same hole, period, round so far and shot string), or undefined. */
    known: (id: string, shots: readonly string[], shot: string) => answers.get(keyOf({ id, shots, shot })),
    /** The hole is read anew: so are its previews. */
    forget: () => answers.clear(),
  };
}
