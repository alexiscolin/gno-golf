// The replay: the chain's path walked on screen — rolling, flying off ramps,
// through tunnels and tubes, into the water and back — and the jumps a path
// makes, which the aim dots read too.
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { buzz, sound } from "../feel";
import { causeAt } from "../scene/cause";
import { at, makeSplash, disposeCourse } from "../scene";
import { BALL_R, inZone, nearestOnPoly, boxOf } from "../terrain";
import type { MutVec2, Vec2, Zone } from "../types";
import type { Cause } from "../scene/cause";
import type { TubePath } from "../scene/data";
import type { Live } from "./types";

/** One flight of the ball, from the chain's air flags: its length, where each segment starts along it, the crest it leaves from. */
interface Flight {
  len: number;
  starts: number[];
  top: number | null;
  s0?: number;
  pt: (d: number) => MutVec2;
  dir: MutVec2;
  crest: number;
  lx: number;
  lz: number;
}

export const MS_PER_STEP = 72; // one path segment is one substep: a constant slice of time
// how fast the ball may cross the screen, in board units per second: a long
// substep is stretched to this instead of flashing past the elastic
export const SHOW_SPEED = 26;
// what it rolls over sounds like what it is
const SURFACE_SOUNDS: Readonly<Record<string, string | undefined>> = { sand: "sand", wetsand: "sand", ice: "ice", puddle: "puddle", flowerbed: "flowers" };

export function makeReplay(E: Live) {
  const { g, scene, ground, lift } = E;
  /** A tunnel is the one place the ball is somewhere else: the step lands on a
   *  tunnel's destination from inside that tunnel. Distance alone cannot tell —
   *  a full-power first substep is longer than some tunnels. */
  // Recognised by where the step lands, not where it starts: the physics
  // checks zones between recorded points, so a fast ball enters the zone after
  // the last point it recorded outside it.
  // Several zones may send the ball to the same point (a tunnel exit and a
  // pond's "back to" can coincide), so the zone is the one the step came
  // from: of those that land there, the nearest to where the ball was.
  const jumpFrom = (p: Vec2, q: Vec2): Zone | null => {
    if (!g.s || Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3) return null;
    let best: Zone | null = null, bd = Infinity;
    for (const z of g.s.zones) {
      // a loop with a tube (island7's castle tube) is ridden like a tunnel
      if ((z.kind !== "tunnel" && z.kind !== "hazard" && z.kind !== "loop") || Math.abs(q[0] - z.vec[0]) > 1e-3 || Math.abs(q[1] - z.vec[1]) > 1e-3) continue;
      const dx = Math.max(z.min[0] - p[0], 0, p[0] - z.max[0]), dz = Math.max(z.min[1] - p[1], 0, p[1] - z.max[1]);
      const d = Math.hypot(dx, dz);
      if (d < bd) (bd = d), (best = z);
    }
    return best;
  };
  const tunnelled = (p: Vec2, q: Vec2) => { const z = jumpFrom(p, q); return z && (z.kind === "tunnel" || z.kind === "loop") ? z : null; };

  const landing = (p: Vec2, q: Vec2) => {
    const z = jumpFrom(p, q);
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
  function sinkPoint(p: Vec2, q: Vec2, from: THREE.Vector3) {
    const z = jumpFrom(p, q);
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
  function through(z: Zone, from: THREE.Vector3, to: THREE.Vector3, round: number | undefined) {
    const cutAt = E.cut;
    const tube = g.course?.userData.tubes.get(z);
    sound("whoosh");
    // in the tube, the ball is hidden on purpose (the camera shows where it is)
    g.inTube = true;
    return new Promise<void>((settle) => {
      const done = () => ((g.inTube = false), settle());
      // a longer tube (a spiral slide) takes longer, at the same pace as a straight one
      const start = performance.now(), T = tube ? Math.min(2400, Math.max(900, tube.getLength() * 75)) : 350;
      const tick = (now: number) => {
        if (round !== g.round || E.cut !== cutAt) return done();
        const k = Math.min((now - start) / T, 1);
        if (tube) {
          tube.getPoint(k, E.ball.position); // written in place: no vector a frame
          E.ball.scale.setScalar(tube.userData && tube.userData.arc ? 1 : 0.7); // inside the pipe, a size smaller (thrown through the air: full size)
        } else {
          E.ball.position.lerpVectors(from, to, k);
          E.ball.scale.setScalar(0.2 + 0.8 * k);
        }
        if (k < 1) return void requestAnimationFrame(tick);
        E.ball.position.copy(to);
        E.ball.scale.setScalar(1);
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
      const start = performance.now();
      const tick = (now: number) => {
        if (round !== g.round || E.cut !== cutAt) return done();
        const k = Math.min((now - start) / T, 1);
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
  const drowned = (p: Vec2, q: Vec2) => { const z = jumpFrom(p, q); return !!z && z.kind === "hazard"; };

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
    const fall = drop > 0.25 ? Math.sqrt((2 * drop) / GRAVITY) : 0; // seconds, under gravity
    const from = edge || at.clone();
    const land = at.clone().setY(surf + BALL_R * 0.4);
    return new Promise<void>((done) => {
      const t0 = performance.now();
      let rings: { group: THREE.Object3D; step(t: number): void } | null = null, start = 0;
      const tick = (now: number) => {
        if (round !== g.round || E.cut !== cutAt) {
          if (rings) (scene.remove(rings.group), disposeCourse(rings.group));
          return done();
        }
        // the fall first
        const tf = (now - t0) / 1000;
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
            // a fall, not a splash: a thud and a puff of dust in the street (makeSplash gives the puff there)
            sound("thud");
            rings = makeSplash(land.clone().setY(surf + 0.5), { open: false });
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

  /** Walk the path the chain returned. One segment, one slice of time. */
  // The chain says where the ball is in the air ("air": one 0/1 per path
  // point). Each run of 1s is one flight: from the ground point before it to
  // the ground point after, drawn as the arc a ball thrown off that ramp flies.
  function flightsOf(path: readonly Vec2[], flags: string) {
    const at = new Map<number, { f: Flight; off: number; seg: number }>(); // segment index -> its flight, where it starts along it, where it ends
    for (let i = 0; i < path.length; i++) {
      if (flags[i] !== "1" || (i > 0 && flags[i - 1] === "1")) continue;
      const s = Math.max(i - 1, 0);
      let e = i;
      while (e < path.length - 1 && flags[e] === "1") e++;
      let len = 0;
      const starts: number[] = [];
      for (let j = s; j < e; j++) {
        starts.push(len);
        len += Math.hypot(path[j + 1][0] - path[j][0], path[j + 1][1] - path[j][1]);
      }
      // one flight, one arc. The flight's first point is still on the ramp:
      // the ball rolls up it to the crest (the highest ground under the
      // flight) and leaves the ground there; from the crest it flies one
      // parabola down to where the chain lands it. Adding the arc on top of
      // the ground (as before) put the ramp's own hump under the arc: two
      // humps, a "double jump".
      const pt = (d: number): MutVec2 => {
        let j = s;
        while (j < e - 1 && starts[j - s + 1] <= d) j++;
        const a0 = starts[j - s], a1 = (starts[j - s + 1] as number | undefined) ?? len, k = a1 > a0 ? (d - a0) / (a1 - a0) : 0;
        return [path[j][0] + (path[j + 1][0] - path[j][0]) * k, path[j][1] + (path[j + 1][1] - path[j][1]) * k];
      };
      // sampled finely: a kicker's lip is narrower than a 24th of a long flight,
      // and a crest found past the real one leaves from a point already falling
      let crest = 0, top = -Infinity;
      const n = Math.max(24, Math.ceil(len / 0.05));
      for (let q = 0; q <= n; q++) {
        const d = (q / n) * len, [x, z] = pt(d), gh = ground(x, z);
        if (gh > top + 1e-6) (top = gh), (crest = d);
      }
      const dl = Math.hypot(path[s + 1][0] - path[s][0], path[s + 1][1] - path[s][1]) || 1;
      const f: Flight = {
        len, starts,
        top: null, // the height he leaves at: taken as he leaves
        pt,
        dir: [(path[s + 1][0] - path[s][0]) / dl, (path[s + 1][1] - path[s][1]) / dl],
        crest, lx: path[e][0], lz: path[e][1],
      };
      for (let j = s; j < e; j++) at.set(j, { f, off: starts[j - s], seg: starts[j - s + 1] ?? len });
    }
    return at;
  }

  function replay(path0: readonly Vec2[], holed: boolean, flags: string, why = "") {
    const cutAt = E.cut;
    const path = path0.slice();
    const round = g.round;
    // without flags (an older realm) the heights are guessed from the ground
    const flights = flags.length === path.length ? flightsOf(path, flags) : null;
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
      let i = 0;
      rolledBack = -1;
      air.y = BALL_R + ground(path[0][0], path[0][1]);
      air.vy = air.gvy = 0;
      air.up = false;
      air.t = 0;
      const replaying = (g.replaying = { flags, at: 0 }); // (?camlog's ballLift: which step of which flags)
      const step = (): void => {
        // a restart or a new hole mid-flight ends this replay where it is
        const s = g.s;
        if (i >= path.length - 1 || round !== g.round || E.cut !== cutAt || !s) return done();
        replaying.at = i;

        const from = lift(path[i]), to = lift(path[i + 1]);
        const jump = tunnelled(path[i], path[i + 1]); // do not slide across the board
        // the last step of a holed shot is the ball dropping in: an easy glide
        // to the pin, then down — never a snap across the cup
        const drop = holed && i === path.length - 2;
        // into the water: splash, sink, a beat, then back where the hazard sends it
        if (drowned(path[i], path[i + 1])) {
          const hz = jumpFrom(path[i], path[i + 1]);
          // off a rooftop: it drops into the street just past the edge it left
          // from, not well inside the hazard as into water
          const at = hz && hz.skin === "roof" ? offEdge(hz, path[Math.max(0, i - 1)], path[i], from) : sinkPoint(path[i], path[i + 1], from);
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
        if (i > 0) {
          const ax = path[i][0] - path[i - 1][0], ay = path[i][1] - path[i - 1][1], l0 = Math.hypot(ax, ay);
          const cos = l0 > 0.15 && len > 0.15 ? (ax * (path[i + 1][0] - path[i][0]) + ay * (path[i + 1][1] - path[i][1])) / (l0 * len) : 1;
          const marked = typeof why === "string" && why.length === path.length;
          if (marked ? why[i] === "b" : cos < 0.6) {
            const post = s.posts.some((p) => Math.hypot(p.c[0] - path[i][0], p.c[1] - path[i][1]) < p.r + 1.2);
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
          return void climbBack(back, round).then(() => {
            air.t = 0;
            step();
          });
        }
        if (jump) {
          // the timed pieces where the chain had them as the ball went in (a blowhole spouting)
          E.showAt((g.tick0 || 0) + i);
          return void through(jump, from, to, round).then(() => {
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
        const guess = () => causeAt(zs, path[i][0], path[i][1], vx, vy, (g.tick0 || 0) + i);
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
          const raw = jump ? 1 : Math.min((now - start) / ms, 1);
          // one path step is one substep: the sails are where the chain had them
          // the pieces where the chain had them: the release tick, plus the step
          E.showAt((g.tick0 || 0) + i + raw);
          const k = drop ? 1 - Math.pow(1 - raw, 2) : raw;
          E.ball.position.lerpVectors(from, to, k);
          if (!jump && !drop) {
            const fl = flights && flights.get(i);
            if (fl) {
              const F = fl.f, d = fl.off + (fl.seg - fl.off) * k, gh = ground(E.ball.position.x, E.ball.position.z);
              if (d <= F.crest) E.ball.position.y = BALL_R + gh; // still rolling up to the lip
              else {
                const L = Math.max(1e-6, F.len - F.crest), u = d - F.crest;
                // One parabola from the lip to where the chain lands him: it
                // leaves at least as steep as the ramp (its slope under the
                // lip, read as he leaves: a timed deck, a seesaw's plank,
                // moves), one hump, no second rise; never through the ground
                // it flies over. The heights too
                // are read as the flight goes (one taken before the shot put a
                // dip, then a hop, at the lip)
                if (F.top == null) {
                  const [cx, cz] = F.pt(F.crest);
                  // from the lip itself: the last frame on the ramp can be well
                  // short of it (a long frame, a fast ball), and a throw from
                  // there hid under the lip and rose a second time past it
                  F.top = Math.max(ground(cx, cz), prev.y - BALL_R);
                  F.s0 = Math.max(0, Math.min(2, (ground(cx, cz) - ground(cx - F.dir[0] * 0.4, cz - F.dir[1] * 0.4)) / 0.4));
                }
                const top = F.top, s0 = F.s0 ?? 0;
                const land = ground(F.lx, F.lz), v = u / L, a = land - top;
                // The arc over the lip-to-landing line: its top at least a hop
                // D over the lip (or a higher landing), and a start at least
                // as steep as the ramp. A shallow lip alone threw him flat, a
                // few hundredths up, and a steep fall after it ate any hop.
                const D = Math.max(0, a) + Math.min(0.35 + L * 0.16, 2.6);
                const h = Math.max((s0 * L - a) / 4, (2 * D - a + 2 * Math.sqrt(D * (D - a))) / 4);
                const y = top + a * v + h * 4 * v * (1 - v);
                E.ball.position.y = BALL_R + Math.max(gh, y);
              }
            } else if (flights) E.ball.position.y = BALL_R + ground(E.ball.position.x, E.ball.position.z);
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


  return {
    replay,
    /** The kind of jump a step makes, for the aim dots: "tunnel", "hazard", "loop" or null. */
    landing,
    /** The slopes' glow fading, a frame of dt seconds. */
    fadeSlopes: (dt: number) => glowing.size && fadeSlopes(dt),
    /** No slope glowing (a new round). */
    clearGlow: () => glowing.clear(),
  };
}
