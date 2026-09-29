// The replay: the chain's path walked on screen — rolling, flying off ramps,
// through tunnels and tubes, into the water and back — and the jumps a path
// makes, which the aim dots read too.
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { buzz as shake, sound as say, type SoundName } from "../feel";
import { causeAt } from "../scene/cause";
import { at, makePuff, makeSplash, disposeCourse } from "../scene";
import { BALL_R, inZone, nearestOnPoly, boxOf, closest, segDist, onAt, segHit, rayCircle } from "../terrain";
import type { MutVec2, Vec2, Wall, Zone } from "../types";
import type { Cause } from "../scene/cause";
import type { Gnome, TubePath } from "../scene/data";
import type { Live } from "./types";

/** One arc of a flight, in path time (a step is one substep): it leaves at
 *  t0 from `from`, lands at t1 on `to`, its apex h over the line between;
 *  y0 the height it leaves from, read as it leaves. */
export interface Arc {
  t0: number;
  t1: number;
  h: number;
  from: Vec2;
  to: Vec2;
  y0?: number;
  /** a hop after a landing: it leaves from the ground, not from the arc before */
  hop?: boolean;
}

// the chain's flight rules (physics/step.gno), in board units and substeps (G is 1)
const MAX_MOVE = 1.5, SPEED_CAP = 8, MIN_RAMP = 0.12, MAX_SIN = 0.95, GROUND_BOUNCE = 0.4, LAND_FRICTION = 0.3, TANGENT_MASS = 2 / 7, HOP_SPEED = 0.25;
/** The moves a substep at speed v is walked in: a flight starts and ends at the end of one. */
const movesOf = (v: number) => Math.floor(Math.min(v, SPEED_CAP) / MAX_MOVE) + 1;
/** Where the path is at time t (a step is one unit of it). */
function pointAt(path: readonly Vec2[], t: number): MutVec2 {
  const j = Math.max(0, Math.min(Math.floor(t), path.length - 2)), k = Math.min(1, t - j);
  return [path[j][0] + (path[j + 1][0] - path[j][0]) * k, path[j][1] + (path[j + 1][1] - path[j][1]) * k];
}

/** The chain's flights (its air flags, one per point): each step a flight
 *  crosses, and its arcs. The chain takes off where a step crosses a hill's
 *  crest (its uphill edge) climbing, up at the hill's grade, vz = (v·u)·tanθ,
 *  and flies 2vz, on the grid of the substep's moves; it lands, and hops
 *  again at 0.4 of vz while that is over HopSpeed. The flags alone cannot
 *  say it: the chain lands mid-substep, and a hop goes up before a point on
 *  the ground is recorded. ticks: each point's tick (a timed hill counts
 *  while it is there). */
export function flightsOf(path: readonly Vec2[], flags: string, zones: readonly Zone[], ticks: readonly number[]) {
  const out = new Map<number, Arc[]>(); // step index -> the arcs over it
  for (let i = 1; i < path.length; i++) {
    if (flags[i] !== "1" || flags[i - 1] === "1") continue;
    const s = i - 1, p = path[s], q = path[s + 1];
    let e = i;
    while (e < path.length - 1 && flags[e] === "1") e++;
    // the hill it left: the first whose crest the step crosses (overTheTop)
    let f = -1, vz = 0, sp = 0, along = 0;
    for (const z of zones) {
      const gz = Math.hypot(z.vec[0], z.vec[1]);
      if (z.kind !== "slope" || z.air || gz <= MIN_RAMP || !onAt(z, ticks[s])) continue;
      const ux = -z.vec[0] / gz, uz = -z.vec[1] / gz, ax = Math.abs(ux) >= Math.abs(uz) ? 0 : 1, o = 1 - ax;
      const up = (ax ? uz : ux) >= 0 ? 1 : -1, crest = up > 0 ? z.max[ax] : z.min[ax];
      if ((p[ax] - crest) * up >= 0 || (q[ax] - crest) * up < 0) continue;
      const k = (crest - p[ax]) / (q[ax] - p[ax]), oc = p[o] + (q[o] - p[o]) * k;
      if (oc < z.min[o] || oc >= z.max[o]) continue;
      // its speed in the air: a whole step in the air is it, else the take-off's step
      const w = flags[s + 2] === "1" ? s + 1 : s, dx = path[w + 1][0] - path[w][0], dz = path[w + 1][1] - path[w][1];
      const sin = Math.min(gz, MAX_SIN), step = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      (f = k), (sp = Math.hypot(dx, dz)), (vz = (dx * ux + dz * uz) * (sin / Math.sqrt(1 - sin * sin)));
      along = (sin * ((q[0] - p[0]) * ux + (q[1] - p[1]) * uz)) / step; // the hill's pull along the step (it slows the climb)
      break;
    }
    const arcs: Arc[] = [];
    if (f >= 0 && vz > 0) {
      // up at the end of the move that crossed the crest (drawn from the crest itself)
      // (the substep's speed as it started: its average, and what the hill took off it by the crest)
      let n = movesOf(Math.hypot(q[0] - p[0], q[1] - p[1]) + along * f), sub = s, k = Math.floor(f * n) + 1, t0 = s + f;
      do {
        let air = 2 * vz;
        do {
          if (k >= n) (sub++), (k = 0), (n = movesOf(sp));
          k++;
          air -= 1 / n;
        } while (air > 0);
        const t1 = sub + k / n;
        arcs.push({ t0, t1, h: (vz * vz) / 2, from: pointAt(path, t0), to: pointAt(path, t1), hop: arcs.length > 0 });
        // down: friction along, restitution up
        sp -= Math.min(LAND_FRICTION * (1 + GROUND_BOUNCE) * vz, TANGENT_MASS * sp);
        vz *= GROUND_BOUNCE;
        t0 = t1;
      } while (vz > HOP_SPEED);
    } else {
      // no crest found (a hill the client does not have): one arc across the
      // flags, as high as its time in the air flies (apex T²/8)
      const t0 = s + 0.5, t1 = e - 0.5;
      arcs.push({ t0, t1, h: ((t1 - t0) * (t1 - t0)) / 8, from: pointAt(path, t0), to: pointAt(path, t1) });
    }
    for (const a of arcs)
      for (let j = Math.floor(a.t0); j < Math.ceil(a.t1) && j < path.length - 1; j++) {
        const on = out.get(j);
        if (on) on.push(a);
        else out.set(j, [a]);
      }
  }
  return out;
}

const NO_WALLS: readonly Wall[] = []; // (no hole loaded)

export const MS_PER_STEP = 72; // one path segment is one substep: a constant slice of time
// the speed the engine's safety net budgets a replay at (board units a second)
export const SHOW_SPEED = 26;
// How fast the ball crosses the screen, in board units a second, for a chain
// speed of v: its own up to SHOW_FROM, then eased (v0 + k·ln(1 + (v − v0)/k)),
// so a fast shot stays watchable and a faster step is always drawn faster —
// never a hard cap, under which a slower step could look quicker.
const SHOW_FROM = 16, SHOW_EASE = 12;
/** The time, in ms, one substep that runs d board units takes on screen. */
function showMs(d: number) {
  const v = (d / MS_PER_STEP) * 1000;
  const s = v <= SHOW_FROM ? v : SHOW_FROM + SHOW_EASE * Math.log(1 + (v - SHOW_FROM) / SHOW_EASE);
  return s > 0 ? Math.max(MS_PER_STEP, (d / s) * 1000) : MS_PER_STEP;
}
/** A replay's safety net: whether it outlived ms (a promise that never
 *  settles, a frozen tab) or threw; the caller then cuts what is left of it. */
export function outlived(play: Promise<unknown>, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    play.then(() => false, (err: unknown) => (console.warn("gnogolf: the replay threw", err), true)),
    new Promise<boolean>((r) => (t = setTimeout(() => r(true), ms))),
  ]).finally(() => clearTimeout(t));
}
/** Each step of a path's time on screen, in ms, at the player's pace. */
export const stepsMs = (path: readonly Vec2[]) => path.slice(1).map((q, i) => showMs(Math.hypot(q[0] - path[i][0], q[1] - path[i][1])));
/** A ray from p along unit u, and the point on it a run of d away from p by way of q: the ellipse of foci p, q. */
function viaEllipse(p: Vec2, u: Vec2, q: Vec2, d: number): Vec2 | null {
  const rx = q[0] - p[0], ry = q[1] - p[1], r2 = rx * rx + ry * ry, ru = rx * u[0] + ry * u[1];
  if (d * d <= r2 + 1e-6 || d - ru < 1e-6) return null;
  const a = (d * d - r2) / (2 * (d - ru));
  return [p[0] + u[0] * a, p[1] + u[1] * a];
}
// what it rolls over sounds like what it is
const SURFACE_SOUNDS: Readonly<Record<string, SoundName | undefined>> = { sand: "sand", wetsand: "sand", ice: "ice", puddle: "puddle", flowerbed: "flowers" };

export function makeReplay(E: Live) {
  const { g, scene, ground, lift } = E;
  // a replay nobody watches live (the shot clip's) makes no sound
  const sound: typeof say = E.quiet ? () => {} : say, buzz: typeof shake = E.quiet ? () => {} : shake;
  /** A tunnel is the one place the ball is somewhere else: the step lands on a
   *  tunnel's destination from inside that tunnel. Distance alone cannot tell —
   *  a full-power first substep is longer than some tunnels. */
  // Recognised by where the step lands, not where it starts: the physics
  // checks zones between recorded points, so a fast ball enters the zone after
  // the last point it recorded outside it.
  // A hazard sends the ball back to where the stroke was played from, the
  // path's first point (start); an older realm sent it to the zone's vec.
  // Several zones may send the ball to the same point, so the zone is the one
  // the step came from: of those that land there, the nearest to where the
  // ball was.
  // None, and still back to the start: the next stroke's hazard (town10's
  // canal opening under the bridge, course.gno PreviewWith) takes the ball
  // where it stopped. The client has none of that stroke's zones: one a unit
  // round the ball stands for it, so it sinks where it stands.
  const jumpFrom = (p: Vec2, q: Vec2, start?: Vec2): Zone | null => {
    if (!g.s || Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3) return null;
    const at = (v: Vec2) => Math.abs(q[0] - v[0]) <= 1e-3 && Math.abs(q[1] - v[1]) <= 1e-3;
    let best: Zone | null = null, bd = Infinity;
    for (const z of g.s.zones) {
      // a loop with a tube (island7's castle tube) is ridden like a tunnel
      if ((z.kind !== "tunnel" && z.kind !== "hazard" && z.kind !== "loop") || !(at(z.vec) || (z.kind === "hazard" && start && at(start)))) continue;
      const dx = Math.max(z.min[0] - p[0], 0, p[0] - z.max[0]), dz = Math.max(z.min[1] - p[1], 0, p[1] - z.max[1]);
      const d = Math.hypot(dx, dz);
      if (d < bd) (bd = d), (best = z);
    }
    if (!best && start && at(start)) return { kind: "hazard", min: [p[0] - 1, p[1] - 1], max: [p[0] + 1, p[1] + 1], vec: start, scale: 0, round: false, skin: "" };
    return best;
  };
  const tunnelled = (p: Vec2, q: Vec2) => { const z = jumpFrom(p, q); return z && (z.kind === "tunnel" || z.kind === "loop") ? z : null; };

  const landing = (p: Vec2, q: Vec2, start?: Vec2) => {
    const z = jumpFrom(p, q, start);
    return z ? z.kind : null;
  };

  // The ball really rolls: turned about the axis across its motion by distance
  // over radius. It is cosmetic — the chain moves a point — and when it stops
  // the gnome rights himself and looks at the player again.
  const axis = new THREE.Vector3(), spin = new THREE.Quaternion();
  function roll(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    axis.set(dz / d, 0, -dx / d);
    spin.setFromAxisAngle(axis, d / BALL_R);
    E.ball.userData.body.quaternion.premultiply(spin);
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
  // On the ground (no air flag) the ball is on the drawn ground, down a slope
  // or off a ledge alike: the chain says when it leaves the ground (a take-off
  // is flagged), so a step it does not flag is never drawn in the air.
  const GRAVITY = 30;
  function fly(p: THREE.Vector3) {
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
  // On the ground the chain has (no air flag), the ball keeps to the drawn
  // ground; where that drops away steeper than 45° (a drawn ledge, a
  // kicker's face) it falls to it under gravity (gv, the chain's own at the
  // step's pace), it does not snap down. prev: where the last frame had it.
  function fall(p: THREE.Vector3, prev: THREE.Vector3, now: number, gv: number) {
    const dt = air.t ? Math.min((now - air.t) / 1000, 0.05) : 0, floor = BALL_R + ground(p.x, p.z);
    air.t = now;
    const y = air.y + (air.vy - gv * dt) * dt;
    if (dt && y > floor && (air.up || air.y - floor > Math.hypot(p.x - prev.x, p.z - prev.z))) (air.up = true), (air.vy -= gv * dt), (air.y = y);
    else (air.up = false), (air.vy = dt ? Math.min(0, (floor - air.y) / dt) : 0), (air.y = floor);
    p.y = air.y;
  }

  // whether a wind (the weather's) or a gust covers (x, y), by the zones' skins
  // a timed slope that is not wind: a seesaw's plank, a tilting board
  const tilting = (zs: readonly Zone[], x: number, y: number) => zs.some((z) => z.kind === "slope" && z.every && z.skin !== "wind" && z.skin !== "gust" && inZone(z, x, y));
  const windy = (zs: readonly Zone[], x: number, y: number) => zs.some((z) => z.kind === "slope" && (z.skin === "wind" || z.skin === "gust") && inZone(z, x, y)) || !!(g.weather && g.weather.wind && !zs.some((z) => z.kind === "slope" && z.every && inZone(z, x, y)));

  // A slope's contour arrows light up while the ball rolls down it, and fade after.
  const glowing = new Map<Zone, number>(); // zone -> glow level 0..1
  function glowSlope(x: number, y: number) {
    const slopes = g.course && g.course.userData.slopes;
    if (!slopes) return;
    for (const [z] of slopes) if (inZone(z, x, y)) glowing.set(z, 1);
  }
  function fadeSlopes(dt: number) {
    const slopes = g.course && g.course.userData.slopes;
    for (const [z, k] of glowing) {
      const n = Math.max(0, k - dt * 1.5);
      slopes?.get(z)?.glow(n);
      if (n <= 0) glowing.delete(z);
      else glowing.set(z, n);
    }
  }

  /** Where a ball sinks: the pond's nearest point to where it went in — the
   *  recorded point is outside the water when a fast ball enters mid-step. */
  function sinkPoint(p: Vec2, q: Vec2, from: THREE.Vector3, start?: Vec2) {
    const z = jumpFrom(p, q, start);
    if (!z) return from;
    // a shaped sea (a polygon, or all but one): it sinks where it went in,
    // a little further on
    if (z.poly) {
      // it went in at p (the last point before the chain sends it back): a
      // little further out from the lane's edge, over the water
      const best = nearestOnPoly(p[0], p[1], z.poly);
      // the chain records the substep before it went over, still on the deck
      // (p inside the lane): then the edge is ahead of it, and it goes in
      // just past the edge on the far side
      const wet = inZone(z, p[0], p[1]);
      let ox = p[0] - best[0], oy = p[1] - best[1];
      const ol = Math.hypot(ox, oy);
      if (ol < 1e-6) return at(p, BALL_R + ground(p[0], p[1]));
      if (!wet) (ox = -ox), (oy = -oy);
      const out = wet ? Math.max(ol, 0.9) : 0.9;
      const x = best[0] + (ox / ol) * out, y = best[1] + (oy / ol) * out;
      return at([x, y], BALL_R + ground(x, y));
    }
    const { cx, cz, hx, hz } = boxOf(z);
    // well inside the water, not on the bank: the rings then have water round them
    let x = Math.min(Math.max(p[0], z.min[0] + 1), z.max[0] - 1);
    let y = Math.min(Math.max(p[1], z.min[1] + 1), z.max[1] - 1);
    if (z.round) {
      const ex = (x - cx) / hx, ez = (y - cz) / hz, k = Math.hypot(ex, ez);
      if (k > 0.55) (x = cx + (ex / k) * 0.55 * hx), (y = cz + (ez / k) * 0.55 * hz);
    }
    return at([x, y], BALL_R + ground(x, y));
  }

  /** Through a tunnel: down the mouth, along the tube, out of the exit pipe. */
  // A frame of a tunnel, a climb back or a splash that throws ends that move:
  // warned, the ball put right (E.stop), and the move settled, so the replay
  // awaiting it goes on instead of waiting for good.
  const framesOf = (done: () => void) => (f: FrameRequestCallback) =>
    window.requestAnimationFrame((now) => {
      try {
        f(now);
      } catch (err) {
        console.warn("gnogolf: the replay threw", err);
        E.stop();
        done();
      }
    });

  function through(z: Zone, to: THREE.Vector3, round: number | undefined) {
    const cutAt = E.cut;
    const tube = g.course?.userData.tubes.get(z);
    sound("whoosh");
    // in the tube, the ball is hidden on purpose
    g.inTube = true;
    return new Promise<void>((settle) => {
      const done = () => ((g.inTube = false), settle());
      const requestAnimationFrame = framesOf(done);
      // a longer tube (a spiral slide) takes longer, at the same pace as a straight one
      const start = performance.now(), T = tube ? Math.min(2400, Math.max(900, tube.getLength() * 75)) : 350;
      const tick = (now: number) => {
        if (round !== g.round || E.cut !== cutAt) return done();
        const k = Math.max(0, Math.min((now - start) / T, 1));
        if (tube) {
          tube.getPoint(k, E.ball.position); // written in place: no vector a frame
          E.ball.scale.setScalar(tube.userData && tube.userData.arc ? 1 : 0.7); // inside the pipe, a size smaller (thrown through the air: full size)
        } else E.ball.visible = false; // no tube (a door, a cave): inside, unseen, until it comes out
        if (k < 1) return void requestAnimationFrame(tick);
        E.ball.position.copy(to);
        E.ball.scale.setScalar(1);
        E.ball.visible = true; // out (a cut leaves it as its owner set it: a ghost dropped stays gone)
        done();
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * A roll-back into a tube (a loop zone with a tube: island7's castle): the
   * ball reached the mouth moving in, and the chain sends it back out the way
   * it came. Returns { tube, reach } or null. reach is how far up it gets, a
   * fraction of the tube: entry speed / the zone's scale, of half the tube.
   */
  function rollBackAt(path: readonly Vec2[], i: number) {
    const tubes = g.course && g.course.userData.tubes;
    if (!tubes || !g.s || !path[i + 1]) return null;
    const [px, py] = path[i - 1], [x, y] = path[i], [nx, ny] = path[i + 1];
    const ix = x - px, iy = y - py, ox = nx - x, oy = ny - y;
    if (ix * ox + iy * oy >= 0) return null; // not a reversal
    for (const z of g.s.zones) {
      const tube = tubes.get(z);
      if (z.kind !== "loop" || !tube) continue;
      const dx = Math.max(z.min[0] - x, 0, x - z.max[0]), dy = Math.max(z.min[1] - y, 0, y - z.max[1]);
      if (Math.hypot(dx, dy) > 0.7) continue;
      const t0 = tube.getTangentAt(0);
      if (ix * t0.x + iy * t0.z <= 0) continue; // it was not going in
      const speed = Math.hypot(ix, iy), frac = Math.min(0.97, speed / (z.scale || 2));
      return { tube, reach: frac * 0.5, speed };
    }
    return null;
  }
  let rolledBack = -1;
  /** Up the tube and back down, like a ball under gravity: slower as it
   *  climbs, faster as it comes down, out at the mouth. */
  function climbBack({ tube, reach }: { tube: TubePath; reach: number }, round: number | undefined) {
    const cutAt = E.cut;
    const L = tube.getLength(), T = Math.max(450, Math.min(2200, 350 + Math.sqrt(reach * L) * 520));
    return new Promise<void>((done) => {
      const requestAnimationFrame = framesOf(done);
      const start = performance.now();
      const tick = (now: number) => {
        if (round !== g.round || E.cut !== cutAt) return done();
        const k = Math.max(0, Math.min((now - start) / T, 1));
        const u = reach * (1 - (2 * k - 1) * (2 * k - 1)); // up, a pause at the top, down
        tube.getPointAt(Math.max(0, u), E.ball.position);
        E.ball.scale.setScalar(0.7 + 0.3 * (1 - Math.min(1, u * 20))); // into the pipe, a size smaller
        if (k < 1) return void requestAnimationFrame(tick);
        E.ball.scale.setScalar(1);
        done();
      };
      requestAnimationFrame(tick);
    });
  }

  /** A hazard step: from inside a hazard zone, straight to its destination. */
  const drowned = (p: Vec2, q: Vec2, start?: Vec2) => { const z = jumpFrom(p, q, start); return !!z && z.kind === "hazard"; };

  /** The ball sinks where it went in — ripples, a pause — then pops up at the
   *  hazard's destination. 1.4 s in all: long enough to feel the loss. */
  // skin: the hazard's — a serac (mountain) catches the ball in falling ice:
  // no water there, so no rings and no splash, a burst of ice shards instead
  /** Just past the edge of zone z a ball left the lane at p (the last point
   *  on it; prev the one before): the nearest point of the zone's outline, a
   *  little beyond it, or along its way when the zone has no outline. (The
   *  path's next point is where the hazard sends it back, not where it fell.) */
  function offEdge(z: Zone, prev: Vec2, p: Vec2, from: THREE.Vector3) {
    if (z.poly) {
      const e = nearestOnPoly(p[0], p[1], z.poly), dx = e[0] - p[0], dz = e[1] - p[1], l = Math.hypot(dx, dz);
      if (l > 1e-3) return from.clone().set(e[0] + (dx / l) * 0.3, from.y, e[1] + (dz / l) * 0.3);
    }
    const dx = p[0] - prev[0], dz = p[1] - prev[1], l = Math.hypot(dx, dz) || 1;
    return from.clone().set(p[0] + (dx / l) * 0.6, from.y, p[1] + (dz / l) * 0.6);
  }

  function splashDown(at: THREE.Vector3, back: THREE.Vector3, round: number | undefined, edge: THREE.Vector3 | null = null, skin = "") {
    const cutAt = E.cut;
    buzz(25);
    // Off a raised edge (a pier, a boardwalk, a crevasse's lip): the water is
    // below. The ball carries on outward in a short falling arc from the edge
    // down to it, and splashes there. It never hovers at deck height.
    const surf = g.course && g.course.userData.surfaceAt ? g.course.userData.surfaceAt(at.x, at.z) : at.y - BALL_R;
    const drop = at.y - BALL_R - surf;
    // seconds, under gravity; with no drop to speak of, still a glide to where it sinks
    const fall = Math.max(Math.sqrt((2 * Math.max(drop, 0)) / GRAVITY), 0.2);
    const from = edge || at.clone();
    const land = at.clone().setY(surf + BALL_R * 0.4);
    return new Promise<void>((done) => {
      const requestAnimationFrame = framesOf(done);
      const t0 = performance.now();
      let rings: { group: THREE.Object3D; step(t: number): void } | null = null, start = 0;
      const tick = (now: number) => {
        if (round !== g.round || E.cut !== cutAt) {
          if (rings) (scene.remove(rings.group), disposeCourse(rings.group));
          return done();
        }
        // the fall first
        const tf = Math.max(0, (now - t0) / 1000);
        if (tf < fall) {
          const k = tf / fall;
          E.ball.position.lerpVectors(from, land, k); // on outward at its speed
          E.ball.position.y = from.y + (land.y - from.y) * k * k; // and down, faster and faster
          return void requestAnimationFrame(tick);
        }
        if (!rings) {
          start = now;
          at = land;
          if (skin === "roof") {
            // a fall, not a splash: a thud and a puff of dust where it lands (off a bridge too, where
            // makeSplash's own test finds no fall and would ring water)
            sound("thud");
            rings = makePuff(land.clone().setY(surf));
          } else if (skin === "serac") {
            sound("thud");
            for (let n = 0; n < 6; n++) E.causes.at(E.ball.position, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, { kind: "ice" });
            rings = { group: new THREE.Group(), step() {} };
          } else {
            sound("splash");
            rings = makeSplash(land.clone().setY(surf + 0.5), { open: drop > 0.25 });
          }
          scene.add(rings.group);
        }
        const t = (now - start) / 1000;
        if (round !== g.round || E.cut !== cutAt) {
          scene.remove(rings.group);
          disposeCourse(rings.group);
          return done();
        }
        rings.step(t);
        if (t < 0.7) {
          // (in the street it lies where it fell, whole: it only sinks in water)
          const k = skin === "roof" ? 0 : t / 0.7;
          E.ball.position.set(at.x, at.y - k * 1.1, at.z);
          E.ball.scale.setScalar(1 - k * 0.6);
        } else if (t < 1.1) {
          E.ball.visible = false;
        } else {
          E.ball.visible = true;
          const k = Math.min((t - 1.1) / 0.3, 1);
          E.ball.position.copy(back);
          E.ball.scale.setScalar(0.3 + 0.7 * k);
        }
        if (t < 1.4) return void requestAnimationFrame(tick);
        scene.remove(rings.group);
        disposeCourse(rings.group);
        E.ball.scale.setScalar(1);
        done();
      };
      requestAnimationFrame(tick);
    });
  }

  /** How far from p along unit u the ball first meets a wall or a post
   *  (its centre BALL_R off them), within far; null: none there. */
  function hitAlong(p: Vec2, u: Vec2, far: number, tick: number) {
    if (!g.s) return null;
    const ex = p[0] + u[0] * far, ez = p[1] + u[1] * far;
    let k = Infinity;
    const take = (t: number) => void (t > 0 && t < k && (k = t));
    for (const w of g.s.walls) {
      if (!onAt(w, tick)) continue;
      const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], l = Math.hypot(dx, dz);
      if (l > 1e-9) {
        // the face on p's side, BALL_R out
        let nx = (-dz / l) * BALL_R, nz = (dx / l) * BALL_R;
        if ((p[0] - w.a[0]) * nx + (p[1] - w.a[1]) * nz < 0) (nx = -nx), (nz = -nz);
        take(segHit(p[0], p[1], ex, ez, [w.a[0] + nx, w.a[1] + nz], [w.b[0] + nx, w.b[1] + nz]));
      }
      take(rayCircle(p[0], p[1], ex, ez, w.a, BALL_R));
      take(rayCircle(p[0], p[1], ex, ez, w.b, BALL_R));
    }
    for (const q of g.s.posts) take(rayCircle(p[0], p[1], ex, ez, q.c, q.r + BALL_R));
    return k <= 1 ? k * far : null;
  }

  /** Where each bounce hit, a step's corner (null: none, or none to be found).
   *  The chain records one point a substep, so a substep that hits a rail
   *  ends past it: drawn as the chord, it cuts the corner and looks slow, and
   *  the step after looks fast. The corner is where the line in (from the
   *  step before, or its own corner) meets a wall or a post (BALL_R off it,
   *  as the chain keeps the ball); none there, where it meets the line out
   *  (the step after); a head-on hit, the two lines near parallel, at the
   *  run the speeds either side give. ticks: each point's tick (a timed wall
   *  is met while it is there). */
  function cornersOf(path: readonly Vec2[], why: string, flights: ReturnType<typeof flightsOf> | null, ticks: readonly number[]) {
    const out: (Vec2 | null)[] = [];
    const run = (j: number) => { const c = out[j], a = path[j], b = path[j + 1]; return c ? Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(b[0] - c[0], b[1] - c[1]) : Math.hypot(b[0] - a[0], b[1] - a[1]); };
    const jumps = (j: number) => j >= 0 && j + 1 < path.length && !!jumpFrom(path[j], path[j + 1], path[0]);
    for (let i = 0; i + 1 < path.length; i++) {
      out.push(null);
      if (why.length !== path.length || why[i + 1] !== "b" || i === 0 || (flights && (flights.has(i) || flights.has(i - 1))) || jumps(i - 1) || jumps(i) || jumps(i + 1)) continue;
      const p = path[i], q = path[i + 1], o = out[i - 1] || path[i - 1];
      let ux = p[0] - o[0], uy = p[1] - o[1];
      const ul = Math.hypot(ux, uy);
      if (ul < 1e-3) continue;
      (ux /= ul), (uy /= ul);
      // the speed out: the first step after it that hits nothing (a bounce's
      // own chord cuts its corner), no faster than a step before it
      let j = i + 1;
      while (j + 1 < path.length && why[j + 1] === "b") j++;
      const chord = (k: number) => (k + 1 < path.length ? Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]) : 0);
      const vin = run(i - 1), vout = chord(j);
      const rx = q[0] - p[0], ry = q[1] - p[1], len = Math.hypot(rx, ry);
      // a run between the speeds either side (a bumper's out faster), a little over
      const fits = (a: number, b: number) => a >= 0 && b >= 0 && a + b >= 0.9 * Math.min(vin, vout) && a + b <= 1.1 * Math.max(vin, vout) + 0.05;
      const hit = hitAlong(p, [ux, uy], 1.1 * Math.max(vin, len) + 0.05, ticks[i]);
      let c: Vec2 | null = hit != null && fits(hit, Math.hypot(q[0] - p[0] - ux * hit, q[1] - p[1] - uy * hit)) ? [p[0] + ux * hit, p[1] + uy * hit] : null;
      if (!c && j === i + 1 && vout > 1e-3) {
        const wx = (path[i + 2][0] - q[0]) / vout, wy = (path[i + 2][1] - q[1]) / vout;
        const x = ux * wy - uy * wx;
        if (Math.abs(x) > 0.25) {
          const a = (rx * wy - ry * wx) / x, b = (ux * ry - uy * rx) / x;
          if (fits(a, b)) c = [p[0] + ux * a, p[1] + uy * a];
        }
      }
      out[i] = c || viaEllipse(p, [ux, uy], q, Math.max(len, (vin + vout) / 2));
    }
    return out;
  }

  /** Walk the path the chain returned. One segment, one slice of time.
   *  from: the step it starts at (the clip of a long putt opens mid-roll). */
  // speed: how many times faster than the player's own pace (a duel's ghost:
  // its steps and its drop; a splash or a tube keeps its own time)
  function replay(path0: readonly Vec2[], holed: boolean, flags: string, why = "", from = 0, speed = 1) {
    const cutAt = E.cut;
    const path = path0.slice();
    const round = g.round;
    // each point's tick: the release's, plus a substep a step, but for a
    // tunnel's jump (the chain records the way out as a point of its own,
    // mid-substep)
    const ticks = [g.tick0 || 0];
    for (let j = 0; j + 1 < path.length; j++) ticks.push(ticks[j] + (tunnelled(path[j], path[j + 1]) ? 0 : 1));
    // without flags (an older realm) the heights are guessed from the ground
    const flights = flags.length === path.length && g.s ? flightsOf(path, flags, g.s.zones, ticks) : null;
    const corners = cornersOf(path, why, flights, ticks);
    return new Promise<void>((settle) => {
      // a frame that throws ends the replay (the shot's finally puts things right)
      const done = () => settle();
      const guard = (f: FrameRequestCallback): FrameRequestCallback => (now) => {
        try {
          f(now);
        } catch (err) {
          console.warn("gnogolf: the replay threw", err);
          E.stop();
          done();
        }
      };
      const requestAnimationFrame = (f: FrameRequestCallback) => window.requestAnimationFrame(guard(f));
      let i = from;
      rolledBack = -1;
      air.y = BALL_R + ground(path[i][0], path[i][1]);
      air.vy = air.gvy = 0;
      air.up = false;
      air.t = 0;
      const replaying = (g.replaying = { flags, at: 0 }); // (?camlog's ballLift: which step of which flags)
      const step = (): void => {
        // a restart or a new hole mid-flight ends this replay where it is
        const s = g.s;
        if (i >= path.length - 1 || round !== g.round || E.cut !== cutAt || !s) return done();
        replaying.at = i;

        const jump = tunnelled(path[i], path[i + 1]); // do not slide across the board
        // the step into a tube ends at its mouth, not at the chain's point in
        // the zone (beside or under the pipe): the ball rolls in, and the ride
        // (through) starts where it is. With no tube (a door, a cave) it rolls
        // on to the zone's middle, where the door is drawn: the chain's point
        // is the last before it went in, short of it
        const into = !jump && path[i + 2] ? tunnelled(path[i + 1], path[i + 2]) : null;
        const mouth = into && g.course?.userData.tubes.get(into);
        const door = into && !mouth ? boxOf(into) : null;
        const from = lift(path[i]), to = mouth ? mouth.getPoint(0) : door ? lift([door.cx, door.cz]) : lift(path[i + 1]);
        // the last step of a holed shot is the ball dropping in: an easy glide
        // to the pin, then down — never a snap across the cup
        const drop = holed && i === path.length - 2;
        // into the water: splash, sink, a beat, then back where the hazard sends it
        if (drowned(path[i], path[i + 1], path[0])) {
          const hz = jumpFrom(path[i], path[i + 1], path[0]);
          // off a rooftop: it drops into the street just past the edge it left
          // from, not well inside the hazard as into water
          const at = hz && hz.skin === "roof" ? offEdge(hz, path[Math.max(0, i - 1)], path[i], from) : sinkPoint(path[i], path[i + 1], from, path[0]);
          return void splashDown(at, to, round, E.ball.position.clone(), hz ? hz.skin : "").then(() => {
            E.mood.shake(performance.now());
            air.t = 0;
            i++;
            step();
          });
        }
        const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
        // what it rolls over sounds like what it is
        if (len > 0.08) {
          const [x, y] = path[i];
          const on = s.zones.find((z) => z.kind === "surface" && inZone(z, x, y));
          const kind = on && SURFACE_SOUNDS[on.skin];
          if (kind && !(flights && flights.get(i))) sound(kind, Math.min(1, 0.25 + len / 2.2));
        }
        // a bounce: a knock off timber, a boing off a mushroom. The chain marks
        // every one ("b"), glancing and slow ones too; an older realm says
        // nothing, and a sharp turn in the path stands in for it
        // (a step drawn through its corner knocks there, not after it)
        if (i > 0 && !corners[i - 1]) {
          const ax = path[i][0] - path[i - 1][0], ay = path[i][1] - path[i - 1][1], l0 = Math.hypot(ax, ay);
          const cos = l0 > 0.15 && len > 0.15 ? (ax * (path[i + 1][0] - path[i][0]) + ay * (path[i + 1][1] - path[i][1])) / (l0 * len) : 1;
          const marked = typeof why === "string" && why.length === path.length;
          if (marked ? why[i] === "b" : cos < 0.6) {
            const post = s.posts.some((p) => Math.hypot(p.c[0] - path[i][0], p.c[1] - path[i][1]) < p.r + 1.2);
            // louder the faster it hits, never silent
            sound(post ? "boing" : "knock", Math.max(0.2, Math.min(1, Math.max(l0, len) / 2)));
          }
        }
        // a bounce's step runs through where it hit: in, then out, at the one speed of its run
        const corner = !drop && corners[i];
        const via = corner ? lift(corner) : null;
        const reach = corner ? Math.hypot(corner[0] - path[i][0], corner[1] - path[i][1]) : 0;
        const run = corner ? reach + Math.hypot(path[i + 1][0] - corner[0], path[i + 1][1] - corner[1]) : len;
        let knocked = false;
        // (the step into a tunnel is drawn longer than the chain's, to the mouth:
        // at the chain's own speed, at most four times as long)
        const ms = (drop ? 320 : showMs(run) * (into ? Math.min(4, from.distanceTo(to) / Math.max(run, 1e-3)) : 1)) / speed;
        // a roll-back at a tube's mouth: the ball climbs part way into it and
        // slides back down before the path goes on (once per point)
        const back = !jump && i > 0 && rolledBack !== i && rollBackAt(path, i);
        if (back) {
          rolledBack = i;
          return void climbBack(back, round).then(() => {
            air.t = 0;
            step();
          });
        }
        if (jump) {
          // the timed pieces where the chain had them as the ball went in (a blowhole spouting)
          E.showAt(ticks[i]);
          return void through(jump, to, round).then(() => {
            air.t = 0;
            i++;
            step();
          });
        }
        const start = performance.now();
        // what pushes the ball on this step, from the zones under it: drawn as
        // it rolls, and named the first time in the shot
        const zs = E.zones();
        const vx = path[i + 1][0] - path[i][0], vy = path[i + 1][1] - path[i][1];
        // the chain says what acts on each point ("cause": s slope, w wind, i
        // ice or wet, b bounce, - none); an older realm says nothing, and the
        // zones under the ball are read instead
        const said = typeof why === "string" && why.length === path.length ? why[i + 1] : null;
        const guess = () => causeAt(zs, path[i][0], path[i][1], vx, vy, ticks[i]);
        const guessVec = () => { const c = guess(); return c && "vec" in c ? c.vec : null; };
        // (a slope's and a tilt's own direction is the ball's: causes.at reads a vec for wind only)
        const along: Vec2 = [vx, vy];
        const push: Cause | null = jump || drop ? null
          : said == null ? guess()
          // "w" is anything airy to the chain, a timed slope included: it is wind
          // only where a wind or a gust covers the point — a seesaw's plank, a
          // tilting board (another skin) is a slope
          : said === "w" ? (windy(zs, path[i][0], path[i][1]) ? { kind: "wind", vec: guessVec() || (g.weather && g.weather.wind) || along } : { kind: "tilt", vec: along })
          : said === "s" ? (tilting(zs, path[i][0], path[i][1]) ? { kind: "tilt", vec: along } : { kind: "slope", vec: along })
          : said === "i" ? { kind: g.weather && (g.weather.rain || g.weather.storm) ? "wet" : "ice" }
          : null;
        const perSec = 1000 / ms;

        const prev = from.clone();
        const tick = (now: number) => {
          if (round !== g.round || E.cut !== cutAt) return done();
          // (a frame stamped before the step began, on a slow device: at its start)
          const raw = jump ? 1 : Math.max(0, Math.min((now - start) / ms, 1));
          // one path step is one substep: the sails are where the chain had them
          // the pieces where the chain had them: the release tick, plus the step
          E.showAt(ticks[i] + raw);
          const k = drop ? 1 - Math.pow(1 - raw, 2) : raw;
          if (via) {
            const d = k * run;
            if (d < reach) E.ball.position.lerpVectors(from, via, d / reach);
            else E.ball.position.lerpVectors(via, to, run > reach ? (d - reach) / (run - reach) : 1);
            if (d >= reach && !knocked && corner) {
              knocked = true;
              const post = s.posts.some((p) => Math.hypot(p.c[0] - corner[0], p.c[1] - corner[1]) < p.r + 1.2);
              sound(post ? "boing" : "knock", Math.max(0.2, Math.min(1, run / 2)));
            }
          } else E.ball.position.lerpVectors(from, to, k);
          if (!jump && !drop) {
            const t = i + k, arc = flights && flights.get(i)?.find((q) => t >= q.t0 && t <= q.t1);
            if (arc) {
              // The chain's arc: up to its apex, vz²/2 over where it left,
              // then down to where it lands (the ground there may be lower,
              // or higher), never through the ground it flies over. The
              // heights are read as it flies (a timed deck, a seesaw's plank,
              // moves); the one it leaves from as it leaves, from the lip
              // itself (the last frame on the ramp can be well short of it)
              arc.y0 ??= arc.hop ? ground(arc.from[0], arc.from[1]) : Math.max(ground(arc.from[0], arc.from[1]), prev.y - BALL_R);
              const v = (t - arc.t0) / (arc.t1 - arc.t0), top = arc.y0 + arc.h, y1 = ground(arc.to[0], arc.to[1]);
              const y = v < 0.5 ? top - arc.h * (1 - 2 * v) ** 2 : top + (y1 - top) * (2 * v - 1) ** 2;
              E.ball.position.y = BALL_R + Math.max(ground(E.ball.position.x, E.ball.position.z), y);
              (air.y = E.ball.position.y), (air.vy = 0), (air.up = false), (air.t = now);
            } else if (flights) fall(E.ball.position, prev, now, 1e6 / (ms * ms));
            else fly(E.ball.position);
          }
          if (drop && raw > 0.6) {
            const sink = (raw - 0.6) / 0.4;
            E.ball.position.y -= sink * 0.9;
            E.ball.scale.setScalar(1 - sink * 0.5);
          }
          if (push && (push.kind === "slope" || push.kind === "tilt")) glowSlope(path[i][0], path[i][1]);
          if (push) {
            const label = E.causes.at(E.ball.position, vx * perSec, vy * perSec, push);
            if (label) (g.cause = { label, at: performance.now() }), void E.publish();
          }
          if (!jump) roll(prev, E.ball.position);
          prev.copy(E.ball.position);
          if (jump) E.ball.scale.setScalar(0.2 + 0.8 * Math.min((now - start) / 160, 1));
          if (raw < 1 || (jump && E.ball.scale.x < 1)) return void requestAnimationFrame(tick);
          if (!drop) E.ball.scale.setScalar(1);
          i++;
          step();
        };
        requestAnimationFrame(tick);
      };
      step();
    });
  }

  // The chain keeps the ball's centre BALL_R off a wall; the gnome drawn round
  // it reaches further (his nose, his beard, a brim), so against a wall he is
  // drawn pushed off it by the difference, along the wall's normal. Display
  // only: the ball (E.ball.position) stays where the chain has it. Riding a
  // tube he is clear of every wall (the pipe passes over and under them). The
  // walls near him are gathered again once he has gone a unit (not every
  // frame); a gnome that has not moved costs a few comparisons.
  const near: Wall[] = [];
  let seenBall: Gnome | null = null, seenWalls: readonly Wall[] | null = null, sx = NaN, sz = NaN, nx = NaN, nz = NaN;
  function offWalls() {
    const B = E.ball, { x, z } = B.position, walls = g.s && !g.inTube ? g.s.walls : NO_WALLS;
    if (x === sx && z === sz && B === seenBall && walls === seenWalls) return;
    const { body, shade, reach } = B.userData;
    if (walls !== seenWalls || B !== seenBall || Math.hypot(x - nx, z - nz) > 1) {
      near.length = 0;
      // (a timed wall is drawn by what it belongs to, a sail or a tram, moving)
      for (const w of walls) if (!w.every && segDist(x, z, w.a, w.b) < reach + 1) near.push(w);
      (nx = x), (nz = z);
    }
    (sx = x), (sz = z), (seenBall = B), (seenWalls = walls);
    // one wall at a time, from where the walls before put him: at a corner or
    // a join the second wall sees him already pushed, and adds only what is left
    let px = 0, pz = 0;
    for (const w of near) {
      const qx = x + px, qz = z + pz, c = closest(qx, qz, w.a, w.b);
      if (c.d < reach && c.d > 1e-6) (px += ((qx - c.x) * (reach - c.d)) / c.d), (pz += ((qz - c.z) * (reach - c.d)) / c.d);
    }
    body.position.x = shade.position.x = px;
    body.position.z = shade.position.z = pz;
  }

  return {
    replay,
    /** The gnome drawn clear of the walls, for this frame (the engine's and the clip's). */
    offWalls,
    /** The kind of jump a step makes, for the aim dots: "tunnel", "hazard", "loop" or null. */
    landing,
    /** The slopes' glow fading, a frame of dt seconds. */
    fadeSlopes: (dt: number) => glowing.size && fadeSlopes(dt),
    /** No slope glowing (a new round). */
    clearGlow: () => glowing.clear(),
  };
}
