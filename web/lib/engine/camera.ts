// The camera controller: where the camera wants to be for the mode and the
// state the game is in, and the springs that take it there; the chase
// camera's collision tests (walls, posts, tubes, the ground between).
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { behind, chaseState } from "../chase";
import { focusRig, applyRig, ORBIT, overviewRig, courseBox } from "../scene";
import { BALL_R, CELL, onAt, closest, segHit, rayCircle, angDiff, inZone } from "../terrain";
import { worldOf } from "../scene/worlds";
import { ud, md } from "../scene/data";
import type { Extras, Post, Wall } from "../types";
import type { Rig } from "../scene/camera";
import type { Height } from "../scene/data";
import type { Live } from "./types";

/** What the camera is framing: the ball at rest, the pull, the replay, a tube, the hole won. */
type CamState = "rest" | "aiming" | "replay" | "tube" | "holed";
/** One pose the springs read: the position, the look-at point and the lens. */
interface Polar {
  d: number;
  az: number;
  el: number;
  look: THREE.Vector3;
  fov: number;
  oy: number;
}
/** A ?camlog row (see update: yaw, distance, widening, seen, ...). */
type CamRow = (number | string)[];

const N4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NO_WALLS: readonly Wall[] = [], NO_POSTS: readonly Post[] = [];
const FOLLOW_CLOSER = 0.7; // the follow camera, nearer the gnome than the rig frames it

export function makeCamera(E: Live) {
  const { g, camera, screen, ground } = E;
  let settled = false; // the springs at rest: a still scene may be drawn less often
  const cupAt = new THREE.Vector3();
  // the camera's goal, filled in place every frame instead of made anew
  const focus: Rig = { target: new THREE.Vector3(), dist: 0, ox: 0, oy: 0 };
  // In the Far view the mouse orbits the camera a few degrees round the hole:
  // over to the side it is on, a little higher or lower — as far as the whole
  // hole stays in frame. A pointer that is not a mouse (a finger) leaves it still.
  const lean = { x: 0, y: 0 };
  const onHover = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse" || E.dragging) return;
    lean.x = Math.max(-1, Math.min(1, (ev.clientX / window.innerWidth - 0.5) * 2));
    lean.y = Math.max(-1, Math.min(1, (ev.clientY / window.innerHeight - 0.5) * 2));
  };
  const leant = { target: new THREE.Vector3(), dist: 0, ox: 0, oy: 0, tilt: 0, yaw: 0 };
  // The camera on the ball stands off half the overview's distance. A board
  // longer or wider than any of the first four cups' (garden13's 90, town18's
  // 47: the mines' marathons, 96 by 80) would put it off so far the gnome is
  // a speck on a phone: it stands off as it would on the largest of those
  // (the overview of the board cut down to that size); any other hole, as ever.
  const FOLLOW_BOARD = { w: 90, h: 47 };
  let followFor: Rig | null = null;
  const followOver = { dist: 0 };
  const follow = () => {
    const o = g.over!;
    if (!g.s) return o;
    const b = g.s.board;
    if (followFor !== o) {
      followFor = o;
      followOver.dist = b.w > FOLLOW_BOARD.w || b.h > FOLLOW_BOARD.h ? Math.min(o.dist, overviewRig(courseBox({ w: Math.min(b.w, FOLLOW_BOARD.w), h: Math.min(b.h, FOLLOW_BOARD.h) }), screen()).dist) : o.dist;
    }
    return followOver;
  };
  function goal(): Rig | null {
    // Far is the whole hole, whatever the view: never the ball's framing
    const far = g.cam === "far" && g.far;
    if (g.view !== "ball" || far) {
      const o = far || g.over;
      if (!o || !g.s) return o;
      const k = o.orbit || 0;
      leant.target.copy(o.target);
      leant.dist = o.dist;
      leant.ox = o.ox;
      leant.oy = o.oy;
      leant.yaw = lean.x * k * ORBIT.yaw;
      leant.tilt = (o.tilt || 0) + lean.y * k * ORBIT.tilt;
      return leant;
    }
    // a duel's ghost playing (and a moment at its rest after), or its ball
    // looked at from the score card: the camera on it, close, as on the
    // player's own ball in flight
    const ghost = E.rivalAt && E.rivalAt();
    if (ghost && !g.flying) {
      const r = focusRig(ghost, follow(), screen(), null, focus);
      r.dist *= FOLLOW_CLOSER;
      return r;
    }
    // in flight, follow the ball; at rest, keep the cup in the picture too
    if (g.flying || !g.s) {
      const r = focusRig(E.ball.position, follow(), screen(), null, focus);
      r.dist *= FOLLOW_CLOSER;
      return r;
    }
    cupAt.set(g.s.cup[0], E.ball.position.y, g.s.cup[1]);
    // following the gnome: 30 % closer than the rig's own framing, the cup
    // still leaned toward; tall decor in the way is faded by the canopy
    const r = focusRig(E.ball.position, follow(), screen(), cupAt, focus);
    r.dist *= FOLLOW_CLOSER;
    return r;
  }

  // ------------------------------------------------------------ the camera
  //
  // One controller. A MODE says where the camera wants to be — classic (the
  // rig on the gnome), far (the whole hole, high and wide), third person (low
  // behind the gnome) — for the STATE the game is in: at rest, aiming, the
  // replay, a tube, the hole won. Each frame the mode gives a target pose
  // (position, look-at point, lens, view offset) and one smoother brings the
  // real camera to it: critically damped springs, so a mode change, a state
  // change or a new hole always eases from the pose the camera actually has
  // (about half a second), never from a stale one and never with overshoot.
  // holed: from when the winning ball is near the cup (not from the stroke's start: it has to roll there first)
  const nearCup = () => g.s && Math.hypot(E.ball.position.x - g.s.cup[0], E.ball.position.z - g.s.cup[1]) < 2.5;
  const camState = (): CamState => (g.holed || (g.done && nearCup()) ? "holed" : g.inTube ? "tube" : g.flying ? "replay" : E.dragging || g.aiming ? "aiming" : "rest");
  // the target pose, and the springs' own state (position, look-at, lens, offset)
  const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30, oy: 0, near: 3, far: 260 };
  const sp = { pos: new THREE.Vector3(), vp: new THREE.Vector3(), look: new THREE.Vector3(), vl: new THREE.Vector3(), fov: 30, vf: 0, oy: 0, vo: 0, live: false };
  const rigCam = new THREE.PerspectiveCamera(30, 1, 3, 260); // where the rig would put the camera
  const _d = new THREE.Vector3();
  // x'' = ω²(x* − x) − 2ωx': critically damped, settled in ~4.7/ω seconds
  function springV(x: THREE.Vector3, v: THREE.Vector3, target: THREE.Vector3, w: number, dt: number) {
    _d.subVectors(target, x).multiplyScalar(w * w).addScaledVector(v, -2 * w);
    v.addScaledVector(_d, dt);
    x.addScaledVector(v, dt);
  }
  const _sn = { x: 0, v: 0 }; // springN's answer, reused: it runs twice a frame
  function springN(x: number, v: number, target: number, w: number, dt: number) {
    const a = w * w * (target - x) - 2 * w * v;
    v += a * dt;
    return ((_sn.x = x + v * dt), (_sn.v = v), _sn);
  }
  let lastMode: "third" | "rig" | null = null;
  // the third-person follow's own state, reset whenever the mode or the hole changes
  const chase = chaseState(), cdir = new THREE.Vector3(1, 0, 0), prevB = new THREE.Vector3(), vel = new THREE.Vector3(), inst = new THREE.Vector3();
  let yaw = 0, wide = 0, hold = 0, rise = 0, swing = 0, swingTo = 0, swingTick = 0, pen = 0, fresh = true, urgent = false;
  const resetFollow = () => ((fresh = true), (wide = hold = rise = swing = 0), (held = null), (dodge = dodgeTo = 0), (stuck = false), vel.set(0, 0, 0));
  // Third person: the heading the player turned the view to (a pull, the
  // arrow keys, the wheel), kept at rest until the next stroke — the route,
  // the clearance and the swing round a wall only set the view an aim starts
  // from, never turn it back against the player.
  let held: number | null = null;
  // the heading the view has (the camera to the gnome, across the ground: its
  // swing round a wall, a post's push in it), which the player takes as it is
  const viewYaw = () => (sp.live ? Math.atan2(E.ball.position.z - sp.pos.z, E.ball.position.x - sp.pos.x) : yaw + swing);
  const takeView = () => { if (held == null) (yaw = viewYaw()), (swingTo = swing = 0), (dodge = dodgeTo = 0); };
  const ndcB = new THREE.Vector3(), ndcTop = new THREE.Vector3(), ndcBot = new THREE.Vector3(), camLog: CamRow[] = [];
  let sightOk = true, sightTick = 0, clearTick = 0;
  const lensWho: Record<number, number> = {};
  const rawPos = new THREE.Vector3(), push = new THREE.Vector3();

  // Where the course goes next from a point: a distance field over the green
  // cells, from the cup (made once per hole), walked downhill a few cells —
  // so on a lane that doubles back the camera faces the next stretch, not
  // the cup across the rough.
  let field: { id: string | null; dist: Float32Array; idx: (i: number, j: number) => number; inGrid: (i: number, j: number) => boolean } | null = null;
  const CHAMFER: readonly (readonly [number, number, number])[] = [[-1, 0, 1], [0, -1, 1], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2]]; // the neighbours already swept
  function courseField() {
    const t = g.course && g.course.userData.terrain;
    if (!t || !g.s) return null;
    if (field && field.id === g.id) return field;
    const { nx, nz, idx, inGrid, green } = t;
    const dist = new Float32Array(nx * nz).fill(Infinity), q = new Int32Array(nx * nz);
    const ci = Math.floor(g.s.cup[0] / CELL), cj = Math.floor(g.s.cup[1] / CELL);
    let head = 0, tail = 0;
    if (inGrid(ci, cj)) (dist[idx(ci, cj)] = 0), (q[tail++] = idx(ci, cj));
    while (head < tail) {
      const k = q[head++], i = k % nx, j = (k / nx) | 0;
      for (const [di, dj] of N4) {
        const a = i + di, b = j + dj;
        if (!inGrid(a, b)) continue;
        const n = idx(a, b);
        if (!green[n] || dist[n] !== Infinity) continue;
        dist[n] = dist[k] + 1;
        q[tail++] = n;
      }
    }
    // then relaxed over the diagonals too (1 and √2 a step, passes both ways):
    // the 4-connected count alone walks a straight lane in a staircase, 45° off
    for (let pass = 0, changed = true; pass < 24 && changed; pass++) {
      changed = false;
      for (const dir of [1, -1])
        for (let j0 = 0; j0 < nz; j0++)
          for (let i0 = 0; i0 < nx; i0++) {
            const i = dir > 0 ? i0 : nx - 1 - i0, j = dir > 0 ? j0 : nz - 1 - j0, k = idx(i, j);
            if (!green[k]) continue;
            for (const [di, dj, c] of CHAMFER) {
              const a = i + di * dir, b = j + dj * dir;
              if (!inGrid(a, b)) continue;
              const v = dist[idx(a, b)] + c;
              if (v < dist[k] - 1e-6) (dist[k] = v), (changed = true);
            }
          }
    }
    return (field = { id: g.id, dist, idx, inGrid });
  }
  // A world's route (worlds.ts route): the distance to the cup along the
  // lane, from each cell a ball can stand on — the walls (the stroke's too,
  // not the timed ones), the posts and the hazards in the way, a tunnel or a
  // loop one step from its mouth to where it lets the ball out (one the next
  // strokes bring, a world's ahead, a few more: a lift the player waits for)
  // — made once per hole and stroke (Dijkstra over 8 neighbours, no corner
  // cut past a wall). The green's field above crosses a wall between two
  // legs of a winding lane, and knows no lift.
  let forceRoute: boolean | null = null; // the probes' (?camlog): on or off whatever the world
  const routeOn = () => forceRoute ?? !!(g.s && worldOf(g.s).route);
  let route: { id: string | null; ex: Extras | null | undefined; walls: readonly Wall[]; dist: Float32Array; free: Uint8Array; idx: (i: number, j: number) => number; inGrid: (i: number, j: number) => boolean; at: number; head: number | null } | null = null;
  const AHEAD_STEP = 6; // a tunnel a stroke ahead: as far again
  const N8: readonly (readonly [number, number, number])[] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  function routeField() {
    const t = g.course && g.course.userData.terrain, s = g.s;
    if (!t || !s) return null;
    const ex = E.strokeExtras;
    if (route && route.id === g.id && route.ex === ex) return route;
    const { nx, nz, idx, inGrid, green, centre } = t, n = nx * nz;
    const zones = [...s.zones, ...((ex && ex.zones) || [])], free = new Uint8Array(n);
    const walls = [...s.walls, ...((ex && ex.walls) || [])].filter((w) => !w.every);
    for (let k = 0; k < n; k++) {
      if (!green[k]) continue;
      const [x, z] = centre(k % nx, (k / nx) | 0), q = zones.find((q) => inZone(q, x, z));
      free[k] = q && q.kind === "hazard" ? 0 : 1;
    }
    // (a cell whose centre a ball could not reach: within 0.4 of a wall, inside a post)
    const stamp = (x0: number, z0: number, x1: number, z1: number, r: number, d: (x: number, z: number) => number) => {
      for (let j = Math.max(0, Math.floor((z0 - r) / CELL)); j <= Math.min(nz - 1, Math.floor((z1 + r) / CELL)); j++)
        for (let i = Math.max(0, Math.floor((x0 - r) / CELL)); i <= Math.min(nx - 1, Math.floor((x1 + r) / CELL)); i++) {
          const [x, z] = centre(i, j);
          if (d(x, z) < r) free[idx(i, j)] = 0;
        }
    };
    for (const w of walls) stamp(Math.min(w.a[0], w.b[0]), Math.min(w.a[1], w.b[1]), Math.max(w.a[0], w.b[0]), Math.max(w.a[1], w.b[1]), 0.4, (x, z) => closest(x, z, w.a, w.b).d);
    for (const p of s.posts) if (p.c) stamp(p.c[0], p.c[1], p.c[0], p.c[1], p.r || 0.5, (x, z) => Math.hypot(x - p.c[0], z - p.c[1]));
    // a tunnel or a loop: its mouth's cells one step from the cell it lets out on
    const into = new Map<number, [number, number][]>();
    const steps = [...zones.map((q) => [q, 1] as const), ...((ex && ex.ahead) || []).flatMap((a, k) => (a ? a.zones.map((q) => [q, 1 + (k + 1) * AHEAD_STEP] as const) : []))];
    for (const [q, cost] of steps) {
      if (q.kind !== "tunnel" && q.kind !== "loop") continue;
      const ei = Math.floor(q.vec[0] / CELL), ej = Math.floor(q.vec[1] / CELL);
      if (!inGrid(ei, ej)) continue;
      const mouth: [number, number][] = [];
      for (let j = Math.max(0, Math.floor(q.min[1] / CELL)); j <= Math.min(nz - 1, Math.floor(q.max[1] / CELL)); j++)
        for (let i = Math.max(0, Math.floor(q.min[0] / CELL)); i <= Math.min(nx - 1, Math.floor(q.max[0] / CELL)); i++) if (inZone(q, ...centre(i, j))) mouth.push([idx(i, j), cost]);
      const e = idx(ei, ej);
      into.set(e, [...(into.get(e) || []), ...mouth]);
    }
    // Dijkstra from the cup, on a binary heap of cells
    const dist = new Float32Array(n).fill(Infinity), heap: number[] = [];
    const push = (k: number, d: number) => {
      dist[k] = d;
      let c = heap.push(k) - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (dist[heap[p]] <= d) break;
        (heap[c] = heap[p]), (heap[p] = k), (c = p);
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        let c = 0;
        heap[0] = last;
        for (;;) {
          const l = 2 * c + 1, r = l + 1;
          let m = c;
          if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
          if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
          if (m === c) break;
          (heap[c] = heap[m]), (heap[m] = last), (c = m);
        }
      }
      return top;
    };
    const done = new Uint8Array(n), ci = Math.floor(s.cup[0] / CELL), cj = Math.floor(s.cup[1] / CELL);
    if (inGrid(ci, cj)) push(idx(ci, cj), 0);
    while (heap.length) {
      const k = pop();
      if (done[k]) continue;
      done[k] = 1;
      const i = k % nx, j = (k / nx) | 0, d0 = dist[k];
      for (const [di, dj, c] of N8) {
        const a = i + di, b = j + dj;
        if (!inGrid(a, b)) continue;
        const m = idx(a, b);
        if (!free[m] || done[m] || (di && dj && !(free[idx(a, j)] && free[idx(i, b)]))) continue;
        if (d0 + c < dist[m]) push(m, d0 + c);
      }
      for (const [m, c] of into.get(k) || []) if (!done[m] && d0 + c < dist[m]) push(m, d0 + c);
    }
    return (route = { id: g.id, ex, walls, dist, free, idx, inGrid, at: -1, head: null });
  }
  // the heading from (x, z) to the farthest point up to ROUTE_AHEAD along the
  // route that it sees (no wall between: the route hugs a bend's inside, and
  // the line to a point round it would cut the corner), or null; kept per cell
  const ROUTE_AHEAD = 5;
  function routeHeading(x: number, z: number) {
    const f = routeField();
    if (!f) return null;
    const { dist, free, idx, inGrid } = f;
    let i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (f.at === idx(i, j)) return f.head;
    f.at = idx(i, j);
    // (a ball against a wall: its own cell may be one the route leaves out; the nearest it has, 2 cells round)
    if (!inGrid(i, j) || dist[idx(i, j)] === Infinity) {
      let best = Infinity, bi = i, bj = j;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const a = i + di, b = j + dj, d = inGrid(a, b) ? dist[idx(a, b)] + Math.hypot(di, dj) : Infinity;
          if (d < best) (best = d), (bi = a), (bj = b);
        }
      if (best === Infinity) return (f.head = null);
      (i = bi), (j = bj);
    }
    let ti = i, tj = j;
    const sees = (a: number, b: number) => { const cx = (a + 0.5) * CELL, cz = (b + 0.5) * CELL; for (const w of f.walls) if (segHit(x, z, cx, cz, w.a, w.b) >= 0) return false; return true; };
    for (let run = 0, n = 0; run < ROUTE_AHEAD && n < 24; n++) {
      let best = dist[idx(i, j)], bi = i, bj = j, step = 0;
      for (const [di, dj, c] of N8) {
        const a = i + di, b = j + dj;
        if (!inGrid(a, b) || (di && dj && !(free[idx(a, j)] && free[idx(i, b)]))) continue;
        const d = dist[idx(a, b)];
        if (d < best) (best = d), (bi = a), (bj = b), (step = c);
      }
      if (!step) break; // the cup, or a tunnel's mouth: the route goes on from elsewhere
      (i = bi), (j = bj), (run += step * CELL);
      if (sees(i, j)) (ti = i), (tj = j);
    }
    const tx = (ti + 0.5) * CELL, tz = (tj + 0.5) * CELL;
    return (f.head = Math.hypot(tx - x, tz - z) > 0.5 ? Math.atan2(tz - z, tx - x) : null);
  }
  /** The heading from (x, z) towards where the lane leads, or null. */
  function aheadHeading(x: number, z: number) {
    if (routeOn()) return routeHeading(x, z);
    const f = courseField();
    if (!f) return null;
    let i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (!f.inGrid(i, j) || f.dist[f.idx(i, j)] === Infinity) return null;
    // ~5 units along the lane, cell by cell towards the cup
    for (let n = 0; n < 10; n++) {
      let best = f.dist[f.idx(i, j)], bi = i, bj = j;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const a = i + di, b = j + dj;
          if (!f.inGrid(a, b)) continue;
          const d = f.dist[f.idx(a, b)];
          if (d < best) (best = d), (bi = a), (bj = b);
        }
      if (bi === i && bj === j) break;
      (i = bi), (j = bj);
    }
    const tx = (i + 0.5) * CELL, tz = (j + 0.5) * CELL;
    return Math.hypot(tx - x, tz - z) > 0.5 ? Math.atan2(tz - z, tx - x) : null;
  }

  // The lane's own axis at (x, z): the rails beside the ball run along it.
  // The walls within RAIL_R are averaged as axes (180° apart is the same rail
  // direction), the nearer far more (1/d³) and the longer more; twice — first
  // those roughly the way the course goes (the distance field's heading, which
  // cuts a bend's corner), then those along that first axis — so an end wall
  // across the lane or a bar in it does not count. An open board with no rail
  // near keeps the field's heading. Never the straight line to the cup, through walls.
  const RAIL_R = 6;
  function railAxis(x: number, z: number, ref: number, minAlong: number) {
    let c2 = 0, s2 = 0, wsum = 0;
    for (const w of walls()) {
      if (w.every || !wallOn(w)) continue;
      const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const d = closest(x, z, w.a, w.b).d;
      if (d > RAIL_R) continue;
      const th = Math.atan2(dz, dx), along = Math.cos(th - ref);
      if (along * along < minAlong) continue;
      const wt = (along * along * Math.min(len, 4)) / (d + 0.5) ** 3;
      c2 += Math.cos(2 * th) * wt;
      s2 += Math.sin(2 * th) * wt;
      wsum += wt;
    }
    // no rail near, or rails that disagree
    return !wsum || Math.hypot(c2, s2) < 0.5 * wsum ? null : Math.atan2(s2, c2) / 2;
  }
  function laneHeading(x: number, z: number) {
    const a0 = aheadHeading(x, z);
    if (routeOn()) return a0 ?? (g.s ? Math.atan2(g.s.cup[1] - z, g.s.cup[0] - x) : 0); // (the route sees round its bends: no rail to follow)
    if (a0 == null) return g.s ? Math.atan2(g.s.cup[1] - z, g.s.cup[0] - x) : 0;
    const a1 = railAxis(x, z, a0, 0.1); // within ~72° of the field's heading
    if (a1 == null) return a0;
    const ax = railAxis(x, z, a1, 0.4) ?? a1; // within ~50° of that axis
    return Math.cos(ax - a0) >= 0 ? ax : ax + Math.PI;
  }

  // Inside the board: over the green (inside the outline, never out in the
  // scenery beyond a rail) and at least `gap` from every rail — RAIL_GAP for a
  // spot of its own; straight behind the ball NEAR_GAP will do, with the
  // camera then above the rail (keepInside)
  const RAIL_GAP = 1.5, NEAR_GAP = 0.6;
  function railGap(x: number, z: number) {
    let d = Infinity;
    for (const w of walls()) if (wallOn(w)) d = Math.min(d, closest(x, z, w.a, w.b).d);
    return d;
  }
  function inside(x: number, z: number, gap = RAIL_GAP) {
    const t = g.course && g.course.userData.terrain;
    if (t && !t.onGreen(x, z)) return false;
    return railGap(x, z) >= gap;
  }

  /** Third person's target, per state: 7 behind, 3 up, looking along the aim, the ball's run, or at the cup. */
  const cupPt = new THREE.Vector3(), fallPt = new THREE.Vector3();
  let laneY = 0; // the ball's height the last time it was over the lane
  function thirdTarget(dt: number, state: CamState) {
    // holed: framed on the cup, up and back a little — the ball sinking into
    // it is not followed down (that was a close-up of the hat)
    // off the lane in a replay (off the rooftops into the street, into the
    // sea): followed across at the height it left at, never down among the houses
    const P = E.ball.position, t = g.course && g.course.userData.terrain;
    const off = state === "replay" && !g.inTube && !!t && !t.onGreen(P.x, P.z);
    if (!off) laneY = P.y;
    const B = state === "holed" && g.s ? cupPt.set(g.s.cup[0], BALL_R + ground(g.s.cup[0], g.s.cup[1]), g.s.cup[1]) : off ? fallPt.copy(P).setY(Math.max(P.y, laneY)) : P;
    let target = yaw, turning = false;
    const pulling = state === "aiming";
    aimView = pulling;
    flatFloor = state === "rest" || state === "aiming" ? REST_FLAT : MIN_FLAT;
    if (state === "replay" || state === "tube" || state === "holed") held = null; // (the next stroke's view is the route's again)
    else if (pulling) (takeView(), (held = E.shot.angle));
    // (which way the player turns: a way round what hides the gnome is looked for that way first)
    if (held != null && !Number.isNaN(lastHeld) && Math.abs(angDiff(held, lastHeld)) > 1e-4) (turnSign = Math.sign(angDiff(held, lastHeld))), (turnedAt = performance.now());
    lastHeld = held ?? NaN;
    // (turned by the player: trailed as an aim is, never swung round a wall)
    const manual = pulling || (state === "rest" && held != null);
    orbiting = manual;
    if (pulling) target = E.shot.angle; // trailing the aim (from the pull's start heading: where the view looked)
    else if (manual) target = held!;
    else if (state === "replay" && dt > 0) {
      inst.subVectors(B, prevB).setY(0).divideScalar(dt);
      // a step that turns hard against the averaged run is a bounce or a sharp curve: hold the heading
      if (inst.length() > 0.5 && vel.lengthSq() > 0.25 && inst.angleTo(vel) > Math.PI / 4) hold = 0.6;
      vel.lerp(inst, 1 - Math.exp(-dt / 0.6));
      hold = Math.max(0, hold - dt);
      turning = hold > 0;
      if (!turning && vel.length() > 1.5) target = Math.atan2(vel.z, vel.x);
    } else if (state === "rest" && g.s) {
      // along the lane's axis here (an S or a spiral turns the camera with it)
      target = laneHeading(B.x, B.z);
    }
    // a jump, a tunnel exit: the ball is elsewhere at once, and so is the camera
    const teleport = !fresh && B.distanceTo(prevB) > 2.5;
    if (fresh || teleport) (yaw = target), vel.set(0, 0, 0), (rise = 0);
    prevB.copy(B);
    const d = angDiff(target, yaw);
    // coming back at the camera: rise and back off rather than spin round
    // (unless the board leaves no room to back off into: then it turns round)
    const reversing = state === "replay" && Math.abs(d) > (2 * Math.PI) / 3 && pen < 1 && squeezed < 0.25;
    if (!reversing) {
      const step = manual ? d * (1 - Math.exp(-dt / 0.14)) : d; // aiming: a 0.14 s trail (a U-turn within 15° in 0.5 s)
      const cap = dt * (manual ? (8 * Math.PI) / 3 : Math.PI / 2); // at most 480°/s aiming, 90°/s rolling
      yaw += Math.max(-cap, Math.min(cap, step));
    }
    const widen = turning || reversing || state === "holed" || (pulling && Math.abs(d) > Math.PI / 2);
    wide += ((widen ? 1 : 0) - wide) * (1 - Math.exp(-dt * (widen ? 5 : 1.5)));
    // behind along the heading — swung round a little if a wall right behind blocks the view
    // an upright screen shows little of the lane either side: further back and
    // higher there, or the gnome fills a third of the picture
    const sv = screen(), far = sv.w < sv.h ? 1 + (1 - sv.w / sv.h) * 0.9 : 1;
    const up = ((state === "holed" ? 4.2 : 3) + wide * 2.5) * far + rise;
    if (fresh || ++swingTick % 10 === 0) swingTo = clearHeading(B, (7 + wide * 4) * far, up, manual);
    swing += (swingTo - swing) * (1 - Math.exp(-dt * 3));
    const back = (7 + wide * 4) * far - pen;
    // (a world's solids: round what hides the gnome from every stand on this heading, at rest)
    if (state !== "rest") dodgeTo = 0;
    dodge += (dodgeTo - dodge) * (1 - Math.exp(-dt * 4));
    cdir.set(Math.cos(yaw + swing + dodge), 0, Math.sin(yaw + swing + dodge));
    behind(chase, B, cdir, { back, up, ahead: 0, lookUp: 0 });
    // the collision pass (walls, posts, ground under the line) three times in
    // four frames' worth of time is plenty: between passes its push is reused
    if (fresh || ++clearTick % 3 === 0) {
      rawPos.copy(chase.pos);
      keepClear(chase.pos, B);
      push.subVectors(chase.pos, rawPos);
    } else (chase.pos.add(push), keepInside(chase.pos, B)); // (the reused push may drift it out of the board)
    if (stuck && state === "rest" && ++dodgeTick % 6 === 0) dodgeFrom(B, back, up, manual);
    squeezed = fresh ? squeeze : squeezed + (squeeze - squeezed) * (1 - Math.exp(-dt * 4));
    // the gnome in the lower third: look a little past it, less the steeper the view
    const hz = Math.hypot(chase.pos.x - B.x, chase.pos.z - B.z), hy = chase.pos.y - B.y;
    // (squeezed, steep and close: on the gnome itself, or he drops off the bottom)
    chase.look.copy(B).addScaledVector(cdir, Math.max(0, 1.8 - Math.max(0, hy - hz * 0.5) * 0.4) * (1 - squeezed));
    want.pos.copy(chase.pos);
    want.look.copy(chase.look);
    want.fov = TP_FOV + squeezed * SQUEEZE_FOV;
    want.oy = 0;
    want.near = 0.5;
    // the whole scenery, sea and far hills to the horizon: a nearer far plane
    // cut them off with a hard edge and culled nothing (the merged decor spans it)
    want.far = 260;
    fresh = false;
    return teleport; // a teleport jumps; a mode switch eases from the actual pose
  }

  /** The rig modes' target: where applyRig would put the camera for the rig's goal. */
  function rigTarget() {
    const to = goal();
    if (!to) return false;
    const v = screen();
    // Classic keeps one side for the whole hole: it pans and trucks, never turns
    applyRig(rigCam, to, v);
    want.pos.copy(rigCam.position);
    want.look.copy(to.target);
    want.fov = 30;
    want.oy = to.oy || 0;
    want.near = 3;
    want.far = rigCam.far;
    // kept for what reads the rig (the fog's distance, the far plane)
    if (!g.rig) g.rig = { ...to, target: to.target.clone() };
    g.rig.target.copy(to.target);
    g.rig.dist = to.dist;
    g.rig.ox = to.ox;
    g.rig.oy = to.oy;
    return false;
  }

  // The intro glide: from the hole shown whole to the player's camera, once,
  // on one eased path. The end pose is picked once, before it starts (the
  // heading search runs that once; nothing leans, searches or pushes during
  // it); the camera then orbits the gnome — its heading and its distance to
  // him each eased from the actual pose to that one, so neither ever turns
  // back — while the look, the lens and the view offset ease along. It starts
  // on the frame after the one drawn when asked (the hole is built and its
  // shaders ready: nothing is drawn before); a click or an aim finishes it in
  // GLIDE_CUT_MS.
  const GLIDE_MS = 1400, GLIDE_CUT_MS = 250;
  const _v = new THREE.Vector3();
  const glide: { on: boolean; wait: number; t0: number; cut: number; e0: number; off0: number; readonly B: THREE.Vector3; readonly from: Polar; readonly to: Polar } = { on: false, wait: 0, t0: 0, cut: 0, e0: 0, off0: 0, B: new THREE.Vector3(), from: { d: 0, az: 0, el: 0, look: new THREE.Vector3(), fov: 0, oy: 0 }, to: { d: 0, az: 0, el: 0, look: new THREE.Vector3(), fov: 0, oy: 0 } };
  const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const polar = (o: Polar, P: THREE.Vector3, B: THREE.Vector3) => {
    const dx = P.x - B.x, dy = P.y - B.y, dz = P.z - B.z;
    o.d = Math.hypot(dx, dy, dz) || 1e-3;
    o.az = Math.atan2(dz, dx);
    o.el = Math.asin(Math.max(-1, Math.min(1, dy / o.d)));
  };
  // this frame's glide, or -1: the share of the path done
  function glideStep(mode: "third" | "rig", state: CamState) {
    if (!glide.on) return -1;
    if (!sp.live) return (glide.on = false), -1; // nothing drawn yet to glide from: the first pose is a snap
    if (glide.wait > 0) return glide.wait--, 0; // the frame drawn as it is
    const now = performance.now();
    if (!glide.t0) {
      glide.t0 = now;
      glide.B.copy(E.ball.position);
      polar(glide.from, sp.pos, glide.B);
      glide.from.look.copy(sp.look);
      glide.from.fov = sp.fov;
      glide.from.oy = sp.oy;
      // how far off the look the gnome starts (the whole hole's view): the
      // look is kept that close to him at first, as close as LOOK_OFF at the end
      _d.subVectors(sp.look, sp.pos);
      glide.off0 = _d.angleTo(_v.subVectors(E.ball.position, sp.pos));
      // the end pose, once
      if (mode === "third") (resetFollow(), thirdTarget(0, state));
      else rigTarget();
      polar(glide.to, want.pos, glide.B);
      glide.to.look.copy(want.look);
      glide.to.fov = want.fov;
      glide.to.oy = want.oy;
    }
    const t = Math.min(1, (now - glide.t0) / GLIDE_MS);
    let e = inOut(t);
    if (glide.cut) e = glide.e0 + (1 - glide.e0) * (1 - Math.pow(1 - Math.min(1, (now - glide.cut) / GLIDE_CUT_MS), 2));
    const f = glide.from, o = glide.to, d = f.d + (o.d - f.d) * e, az = f.az + angDiff(o.az, f.az) * e, el = f.el + (o.el - f.el) * e;
    sp.pos.set(glide.B.x + Math.cos(el) * Math.cos(az) * d, glide.B.y + Math.sin(el) * d, glide.B.z + Math.cos(el) * Math.sin(az) * d);
    sp.look.lerpVectors(f.look, o.look, e);
    sp.fov = f.fov + (o.fov - f.fov) * e;
    sp.oy = f.oy + (o.oy - f.oy) * e;
    sp.vp.set(0, 0, 0), sp.vl.set(0, 0, 0), (sp.vf = sp.vo = 0);
    if (e >= 1 - 1e-6) (glide.on = false), (glide.t0 = glide.cut = 0);
    return e;
  }

  function updateCamera(dt: number) {
    if (!g.s || !g.over) return;
    const s = g.s;
    // (a duel's ghost playing, or its ball looked at: the rig, which follows it, the third person back after)
    const mode = g.cam === "third" && g.view === "ball" && !(E.rivalAt && E.rivalAt()) ? "third" : "rig";
    const state = camState();
    if (mode !== lastMode && !glide.on) resetFollow();
    lastMode = mode;
    const gl = glideStep(mode, state);
    const snap = gl >= 0 ? false : mode === "third" ? thirdTarget(dt, state) : rigTarget();
    // a ride (a set piece carrying the ball) puts the camera where it wants it,
    // in any mode, close behind it
    const ride = gl < 0 ? g.ride : null;
    if (ride) (want.pos.copy(ride.pos), want.look.copy(ride.look), (want.fov = ride.fov ?? TP_FOV), (want.oy = 0), (want.near = 0.3), (want.far = 260));
    const snapped = snap || !sp.live || !!(ride && ride.cut);
    // faster in flight, a touch faster still when the ball would leave the frame
    const w = ride ? 14 : urgent ? 16 : state === "replay" ? 11 : 9;
    if (gl >= 0) {
      // (the glide has put the pose itself)
    } else if (!sp.live || snap || (ride && ride.cut)) {
      sp.pos.copy(want.pos), sp.look.copy(want.look), (sp.fov = want.fov), (sp.oy = want.oy), sp.vp.set(0, 0, 0), sp.vl.set(0, 0, 0), (sp.vf = sp.vo = 0), (sp.live = true);
    } else {
      // in steps of 1/60 s at most: one step over an idle frame (0.1 s) is
      // unstable at these rates, and the springs never came to rest — the
      // still scene kept being drawn twice as often as it should
      const n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n;
      for (let k = 0; k < n; k++) {
        springV(sp.pos, sp.vp, want.pos, w, h);
        springV(sp.look, sp.vl, want.look, urgent ? 18 : w, h);
        ({ x: sp.fov, v: sp.vf } = springN(sp.fov, sp.vf, want.fov, 9, h));
        ({ x: sp.oy, v: sp.vo } = springN(sp.oy, sp.vo, want.oy, 9, h));
      }
    }
    // a hard floor on the real pose too (the spring lags a ball rolling back
    // at the camera): never nearer than MIN_FLAT across the ground in third person
    if (mode === "third" && gl < 0 && !ride) {
      const B0 = E.ball.position, fx = sp.pos.x - B0.x, fz = sp.pos.z - B0.z, fl = Math.hypot(fx, fz);
      if (fl < MIN_FLAT - 0.3 && !steep && inside(B0.x + (fx / Math.max(fl, 1e-3)) * (MIN_FLAT - 0.3), B0.z + (fz / Math.max(fl, 1e-3)) * (MIN_FLAT - 0.3), NEAR_GAP)) {
        const k = (MIN_FLAT - 0.3) / Math.max(fl, 1e-3);
        if (fl > 1e-3) (sp.pos.x = B0.x + fx * k), (sp.pos.z = B0.z + fz * k);
        else (sp.pos.x = B0.x - cdir.x * MIN_FLAT), (sp.pos.z = B0.z - cdir.z * MIN_FLAT);
      }
      sp.pos.y = Math.min(sp.pos.y, B0.y + Math.tan(steep ? STEEP : MAX_PITCH + squeezed * SQUEEZE_PITCH + 0.1) * Math.max(Math.hypot(sp.pos.x - B0.x, sp.pos.z - B0.z), MIN_D));
    }
    // (the springs lag a target that moves: behind a ball leaving a round
    // end that lag is out past the rail — the real pose slides back in along
    // its line to the target, which is inside; not while aiming, whose target
    // may sit just over the rail: pulled in there, the pose sawed back and forth)
    if (mode === "third" && gl < 0 && !ride && !aimView && !inside(sp.pos.x, sp.pos.z, NEAR_GAP)) {
      _d.subVectors(want.pos, sp.pos);
      let q = 1;
      while (q < 8 && !inside(sp.pos.x + (_d.x * q) / 8, sp.pos.z + (_d.z * q) / 8, NEAR_GAP)) q++;
      sp.pos.addScaledVector(_d, q / 8);
    }
    if (orbiting && mode === "third" && gl < 0 && !ride) {
      const B0 = E.ball.position, fl = Math.hypot(sp.pos.x - B0.x, sp.pos.z - B0.z), vr = sp.vp.x * -cdir.x + sp.vp.z * -cdir.z;
      (sp.pos.x = B0.x - cdir.x * fl), (sp.pos.z = B0.z - cdir.z * fl);
      (sp.vp.x = -cdir.x * vr), (sp.vp.z = -cdir.z * vr); // (radial only: nothing left to kick it sideways after)
    }
    // a world's relief and solids: the real pose too (the springs cut corners)
    if (mode === "third" && gl < 0 && !ride && hasSolids()) {
      refreshDyn();
      const B0 = E.ball.position;
      sp.pos.y = Math.max(sp.pos.y, floorAt(sp.pos.x, sp.pos.z) + 0.6);
      unbox(sp.pos, B0, want.pos);
    }
    // the gnome never off the picture: the look turned toward him when it is
    // more than LOOK_OFF of the lens off him — the springs lagging a ball
    // rolling back at a camera the board leaves no room to back off in, or
    // the glide's look still on the middle of a long hole
    if ((mode === "third" && gl < 0 && !ride) || gl > 0) {
      const lens = Math.atan(LOOK_OFF * Math.tan(((sp.fov / 2) * Math.PI) / 180));
      const off = gl > 0 ? Math.max(lens, glide.off0) + (lens - Math.max(lens, glide.off0)) * gl : lens;
      _d.subVectors(sp.look, sp.pos);
      const B1 = E.ball.position, bx = B1.x - sp.pos.x, by = B1.y - sp.pos.y, bz = B1.z - sp.pos.z, bl = Math.hypot(bx, by, bz), ll = _d.length();
      const cos = ll && bl ? (_d.x * bx + _d.y * by + _d.z * bz) / (ll * bl) : 1;
      if (cos < Math.cos(off)) {
        const k = 1 - Math.tan(off) / Math.tan(Math.acos(Math.max(-1, cos))); // the share of the way to him
        sp.look.lerp(B1, Math.max(0, Math.min(1, k)));
      }
    }
    const v = screen();
    camera.position.copy(sp.pos);
    camera.lookAt(sp.look);
    // the lens: rebuilt only when one of its numbers moved (a camera at rest
    // rebuilds nothing), and once (setViewOffset and clearViewOffset rebuild it themselves)
    const aspect = v.w / v.h, oy = Math.abs(sp.oy) > 0.5 ? sp.oy : 0;
    const near = Math.min(want.near, sp.pos.distanceTo(E.ball.position) * 0.5);
    // (gliding in from the whole hole: the far plane as far as the pose needs, not the end pose's)
    const far = gl >= 0 ? Math.max(want.far, sp.pos.distanceTo(sp.look) + 220) : want.far;
    const vw = camera.view && camera.view.enabled ? camera.view : null;
    const viewNow = oy ? !!vw && vw.offsetX === 0 && vw.offsetY === oy && vw.fullWidth === v.w && vw.fullHeight === v.h && vw.width === v.w && vw.height === v.h : !vw;
    if (camera.aspect !== aspect || camera.fov !== sp.fov || camera.near !== near || camera.far !== far || !viewNow) {
      camera.aspect = aspect;
      camera.fov = sp.fov;
      camera.near = near;
      camera.far = far;
      if (oy) camera.setViewOffset(v.w, v.h, 0, oy, v.w, v.h);
      else if (vw) camera.clearViewOffset();
      else camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    // the ball on screen and in sight: in the middle 70 %, nothing between it
    // and the camera (board-space test, no ray); out of frame → catch up fast;
    // hidden by a wall → rise a little
    const B = E.ball.position;
    ndcB.copy(B).project(camera);
    const inFrame = ndcB.z < 1 && Math.abs(ndcB.x) < 0.7 && Math.abs(ndcB.y) < 0.7;
    // in sight: the gnome's head over any kerb between (the hat is what the player looks for)
    if (!inFrame) sightOk = false;
    else if (++sightTick % 2 === 0 || !sightOk) sightOk = !hidden(camera.position, B);
    const seen = inFrame && sightOk;
    // (decor between is the canopy's to fade; a ray through the whole baked course each frame cost 3× the frame)
    const blocked = inFrame && !seen;
    // out of frame or behind a wall: the springs catch up fast until it is back in sight
    urgent = mode === "third" && gl < 0 && (!inFrame || blocked);
    // (a world's solids: the collision pass itself finds where he is seen from)
    rise = blocked && !hasSolids() ? Math.min(3, rise + dt * 12) : Math.max(0, rise - dt * 6);
    settled = !glide.on && sp.vp.lengthSq() < 1e-4 && sp.vl.lengthSq() < 1e-4 && Math.abs(sp.vf) < 1e-3;
    if (E.log) {
      // [yaw°, distance, widening, seen, hidden on purpose (in a tube, under the ground), pitch°, flat distance, gnome height (share of screen), ball ndc y, cup ndc x, state, near-wall, in frame, snapped, ball ndc x, ms, squeezed, glide share (-1: none), camera azimuth°]
      const fl = Math.hypot(camera.position.x - B.x, camera.position.z - B.z);
      const top = ndcTop.copy(B).setY(B.y + 1.1).project(camera).y, bot = ndcBot.copy(B).setY(B.y - BALL_R).project(camera).y;
      const cupX = ndcTop.set(s.cup[0], B.y, s.cup[1]).project(camera).x;
      camLog.push([+((yaw * 180) / Math.PI).toFixed(1), +camera.position.distanceTo(B).toFixed(1), +wide.toFixed(2), seen ? 1 : 0, g.inTube || B.y < ground(B.x, B.z) - 0.3 ? 1 : 0,
        +((Math.atan2(camera.position.y - B.y, fl) * 180) / Math.PI).toFixed(1), +fl.toFixed(1), +((top - bot) / 2).toFixed(3), +ndcB.y.toFixed(2), +cupX.toFixed(2), state, wallHug(camera.position) ? 1 : 0, inFrame ? 1 : 0, snapped ? 1 : 0, +ndcB.x.toFixed(2), Math.round(performance.now()), +squeezed.toFixed(2), +gl.toFixed(3), +((Math.atan2(B.z - camera.position.z, B.x - camera.position.x) * 180) / Math.PI).toFixed(2)]);
    }
  }
  // a camera in a wall's face: within 1 of a wall and below its kerb top
  function wallHug(P: THREE.Vector3) {
    for (const w of walls()) {
      if (wallOn(w) && closest(P.x, P.z, w.a, w.b).d < 1 && P.y < ground(P.x, P.z) + KERB + 0.3) return true;
    }
    return false;
  }

  // The chase camera never sits in or behind a wall: the line from the ball to
  // it is tested against the hole's walls and posts, and a hit brings it in
  // front of the wall and up over the kerb. It stays inside the board, clear
  // of the rails, at least MIN_D from the ball and looking down at least
  // MIN_PITCH. The chase's own easing then smooths every push.
  const TP_FOV = 58; // third person's lens (the others keep 30)
  const LOOK_OFF = 0.55; // the gnome at most this share of the half lens off the view's centre
  const KERB = 1.1, MIN_D = 3, MIN_PITCH = (18 * Math.PI) / 180, MAX_PITCH = (40 * Math.PI) / 180;
  const SQUEEZE_PITCH = (16 * Math.PI) / 180, SQUEEZE_FOV = 14;
  let squeeze = 0, squeezed = 0; // how cramped the last pass found it (0..1), and that eased
  const STEEP = (65 * Math.PI) / 180; // a world's solids: looking over one right by the gnome
  let steep = false; // the last collision pass looked over one so
  const maxPitch = () => MAX_PITCH + (aimView ? 0 : squeeze * SQUEEZE_PITCH); // (aiming, never steeper: the view along the aim is the point)
  /** Whether the line from B (raised by lift) to C clears the ground (from 1.5 out). */
  function lineClear(B: THREE.Vector3, cx: number, cy: number, cz: number, lift = 0.7) {
    const L = Math.hypot(cx - B.x, cz - B.z) || 1;
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (t * L < 1.5) continue;
      const x = B.x + (cx - B.x) * t, z = B.z + (cz - B.z) * t;
      if (B.y + lift + (cy - B.y - lift) * t < floorAt(x, z) + 0.15) return false;
    }
    return true;
  }

  // A world's solids (worlds.ts camSolids): what stands round the lane as
  // drawn — a pillar, a prop, a stalagmite, a machine's frame, the rock on a
  // rail — as boxes taken from the course's pieces before they are merged
  // (collect), with the relief round the board under them (camFloor). The
  // chase camera stands clear of them and over the relief, and sees the gnome
  // past them; a world without them has the kerb's height and the lane's ground.
  let solids = new Float32Array(0), solidsFor: object | null = null, reliefFor: object | null = null, reliefFn: Height | null = null;
  const near: number[] = [], nearAt = new THREE.Vector3(Infinity, 0, 0), _m = new THREE.Matrix4(), _box = new THREE.Box3();
  /** The pieces' boxes, from the course built but not yet merged (a world's camSolids);
   *  null for a world without them: the last one's boxes, relief and walls let go. */
  function collect(course: THREE.Object3D | null) {
    if (!course) return void ((fixed = solids = new Float32Array(0)), (solidsFor = reliefFor = reliefFn = null), (wallsFor = null), (wallsAll = NO_WALLS));
    const out: number[] = [];
    course.updateMatrixWorld(true);
    boxesOf(course, course, false, out);
    (fixed = new Float32Array(out)), (solids = fixed), (solidsFor = course), nearAt.set(Infinity, 0, 0), (dynTick = 0);
  }
  // what moves (a machine, a ride, a stroke's pieces: built after the merge,
  // or moving) is boxed again every DYN_EVERY frames as it stands then
  const DYN_EVERY = 6;
  let fixed = new Float32Array(0), dynTick = 0;
  const CHUNK = 1.5;
  function refreshDyn() {
    if (!g.course || !hasSolids() || dynTick++ % DYN_EVERY) return;
    const out: number[] = [];
    boxesOf(g.course, g.course, true, out, E.ball.position);
    const n = fixed.length + out.length;
    if (dynBuf.length < n) dynBuf = new Float32Array(n * 2);
    solids = dynBuf.subarray(0, n);
    solids.set(fixed), solids.set(out, fixed.length), nearAt.set(Infinity, 0, 0);
  }
  let dynBuf = new Float32Array(0);
  // a moving mesh's boxes as last taken, again only once it has moved (its
  // matrixWorld, its instances or its geometry changed): most "live" pieces
  // stand still on the CPU (the lamps swing in their shader, a stroke's
  // pieces wait between strokes), and a big one is boxed vertex by vertex
  const boxed = new WeakMap<THREE.Mesh, { at: number[]; geo: THREE.BufferGeometry; v: number; out: number[] }>();
  // the boxes of root's opaque meshes, the ones that stand still (moving
  // false) or the moving ones and a stroke's pieces (true), into out
  // (near: only what stands within NEAR_R of it — a moving piece further off is no camera's business yet)
  const NEAR_R = 20, _s = new THREE.Sphere();
  function boxesOf(course: THREE.Object3D, root: THREE.Object3D, moving: boolean, out: number[], near?: THREE.Vector3) {
    const height = (course.userData as { height: Height }).height;
    const moves = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== course; p = p.parent) if (ud(p).live || p === E.extras) return true; return false; };
    root.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh) || moves(o) !== moving) return;
      const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material | undefined;
      // (a crystal is see-through but solid: what is nearly clear, a glow, an ink hull, is not)
      if (!mat || (mat.transparent && mat.opacity < 0.5) || mat.blending === THREE.AdditiveBlending || md(mat).hull) return;
      const geo = o.geometry as THREE.BufferGeometry;
      if (near && !(o instanceof THREE.InstancedMesh)) {
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        _s.copy(geo.boundingSphere!).applyMatrix4(o.matrixWorld);
        if (Math.hypot(_s.center.x - near.x, _s.center.z - near.z) - _s.radius > NEAR_R) return;
      }
      const ver = o instanceof THREE.InstancedMesh ? o.instanceMatrix.version * 65536 + o.count : (geo.getAttribute("position") as THREE.BufferAttribute).version;
      const was = moving ? boxed.get(o) : undefined, at = o.matrixWorld.elements;
      if (was && was.geo === geo && was.v === ver && was.at.every((x, i) => x === at[i])) {
        for (const x of was.out) out.push(x);
        return;
      }
      const from = out.length;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const n = o instanceof THREE.InstancedMesh ? o.count : 1;
      for (let i = 0; i < n; i++) {
        _box.copy(geo.boundingBox!);
        if (o instanceof THREE.InstancedMesh) (o.getMatrixAt(i, _m), _box.applyMatrix4(_m.premultiply(o.matrixWorld)));
        else _box.applyMatrix4(o.matrixWorld);
        const { min: a, max: b } = _box, w = b.x - a.x, d = b.z - a.z;
        // a big one (a ridge of rock along a rail, a stroke's pieces merged, a
        // machine; a wall's rock on a slant, its box over the lane): its
        // vertices in cells of CHUNK across the ground, a box each
        if (Math.max(w, d) > 3 && n === 1) {
          const pos = geo.getAttribute("position") as THREE.BufferAttribute, bins = new Map<number, THREE.Box3>(), v = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            const q = Math.floor((v.x - a.x) / CHUNK) * 4096 + Math.floor((v.z - a.z) / CHUNK);
            (bins.get(q) || bins.set(q, new THREE.Box3()).get(q)!).expandByPoint(v);
          }
          for (const bb of bins.values()) keep(bb.min, bb.max);
        } else keep(a, b);
      }
      if (moving) boxed.set(o, { at: [...at], geo, v: ver, out: out.slice(from) });
    });
    // (not the shell's wall nor its floors; nothing low, thin or high overhead)
    function keep(a: THREE.Vector3, b: THREE.Vector3) {
      const g0 = height((a.x + b.x) / 2, (a.z + b.z) / 2), w = b.x - a.x, d = b.z - a.z;
      // (a tower's cell as high as a camera goes, not to the vault: out of one, never launched up it)
      if (Math.max(w, d) > 12 || (w < 0.08 && d < 0.08) || b.y - g0 < 0.8 || a.y > g0 + 6) return;
      out.push(a.x, a.y, a.z, b.x, Math.min(b.y, g0 + 12), b.z);
    }
  }
  const hasSolids = () => !!g.course && solidsFor === g.course;
  /** The ground under (x, z): the lane's, or over a world's relief round it (camFloor). */
  function floorAt(x: number, z: number) {
    if (g.course && reliefFor !== g.course) {
      reliefFor = g.course;
      const s = g.course.userData.state, cf = s && worldOf(s).camFloor;
      reliefFn = cf ? cf(s) : null;
    }
    return reliefFn ? Math.max(ground(x, z), reliefFn(x, z)) : ground(x, z);
  }
  // the boxes within 16 of the ball, found again once it has moved 1
  function nearSolids() {
    if (!hasSolids()) return (near.length = 0), near;
    const B = E.ball.position;
    if (nearAt.distanceToSquared(B) > 1) {
      nearAt.copy(B);
      near.length = 0;
      for (let k = 0; k < solids.length; k += 6) if (solids[k] < B.x + 16 && solids[k + 3] > B.x - 16 && solids[k + 2] < B.z + 16 && solids[k + 5] > B.z - 16) near.push(k);
    }
    return near;
  }
  // where the segment o→p enters box k grown by pad (a fraction of it), -1 if
  // it misses or starts inside (flat: across the ground only, the box as tall
  // as it likes, and from inside at once); where it leaves it, in boxOut
  const O3 = [0, 0, 0], D3 = [0, 0, 0];
  let boxOut = 1;
  function boxT(k: number, ox: number, oy: number, oz: number, px: number, py: number, pz: number, pad = 0, flat = false, any = false, arr: Float32Array = solids) {
    (O3[0] = ox), (O3[1] = oy), (O3[2] = oz), (D3[0] = px - ox), (D3[1] = py - oy), (D3[2] = pz - oz);
    let t0 = 0, t1 = 1;
    for (let a = 0; a < 3; a++) {
      if (flat && a === 1) continue;
      const lo = arr[k + a] - pad, hi = arr[k + 3 + a] + pad;
      if (Math.abs(D3[a]) < 1e-9) {
        if (O3[a] < lo || O3[a] > hi) return -1;
        continue;
      }
      const u = (lo - O3[a]) / D3[a], v = (hi - O3[a]) / D3[a];
      (t0 = Math.max(t0, Math.min(u, v))), (t1 = Math.min(t1, Math.max(u, v)));
      if (t0 > t1) return -1;
    }
    boxOut = t1;
    return t0 > 0 ? t0 : flat ? 1e-3 : any ? 0 : -1;
  }
  const inBox = (k: number, P: THREE.Vector3, pad: number) => P.x > solids[k] - pad && P.x < solids[k + 3] + pad && P.y > solids[k + 1] - pad && P.y < solids[k + 4] + pad && P.z > solids[k + 2] - pad && P.z < solids[k + 5] + pad;
  // a camera in a box, or under one within UNDER (the springs cutting a
  // corner, a pitch clamp lowering it; a timber over it): out by the shortest
  // way, over it or off a side, PAD clear
  const PAD = 0.5, UNDER = 3;
  const inRoom = (k: number, P: THREE.Vector3) => P.x > solids[k] - PAD && P.x < solids[k + 3] + PAD && P.z > solids[k + 2] - PAD && P.z < solids[k + 5] + PAD && P.y > solids[k + 1] - UNDER && P.y < solids[k + 4] + PAD;
  // (to: where the camera is going, the exit on its way taken — the springs'
  // target in front of a plate the camera stands behind; else the shortest)
  const EX = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // exits: [dx, dy, dz] × 5
  function unbox(P: THREE.Vector3, B: THREE.Vector3, to?: THREE.Vector3) {
    for (const k of nearSolids()) {
      if (!inRoom(k, P) || inBox(k, B, PAD)) continue;
      let n = 0;
      const put = (dx: number, dy: number, dz: number) => void ((EX[n * 3] = dx), (EX[n * 3 + 1] = dy), (EX[n * 3 + 2] = dz), n++);
      put(0, solids[k + 4] + PAD - P.y, 0);
      // (turned by the player, the camera stays on his heading: over it, or in or out along it)
      if (orbiting) {
        const fx = P.x - B.x, fz = P.z - B.z, f = Math.hypot(fx, fz) || 1, ux = fx / f, uz = fz / f;
        const din = (1 - boxT(k, B.x, 0, B.z, P.x, 0, P.z, PAD, true)) * f;
        boxT(k, B.x, 0, B.z, B.x + fx * 3, 0, B.z + fz * 3, PAD, true); // (out along it: where the line leaves it, past the camera)
        const dout = boxOut * 3 * f - f;
        if (din < f - 0.5) put(-ux * din, 0, -uz * din);
        if (dout > 0) put(ux * dout, 0, uz * dout);
      } else {
        put(solids[k] - PAD - P.x, 0, 0), put(solids[k + 3] + PAD - P.x, 0, 0);
        put(0, 0, solids[k + 2] - PAD - P.z), put(0, 0, solids[k + 5] + PAD - P.z);
      }
      let best = 0, bv = Infinity;
      for (let q = 0; q < n; q++) {
        const dx = EX[q * 3], dy = EX[q * 3 + 1], dz = EX[q * 3 + 2];
        const v = to ? Math.hypot(P.x + dx - to.x, P.y + dy - to.y, P.z + dz - to.z) : Math.hypot(dx, dy, dz);
        if (v < bv) (bv = v), (best = q);
      }
      const dx = EX[best * 3], dy = EX[best * 3 + 1], dz = EX[best * 3 + 2], len = Math.hypot(dx, dy, dz), s = len > 1.5 ? 1.5 / len : 1; // (a slide, not a jump: the rest next frame)
      (P.x += dx * s), (P.y += dy * s), (P.z += dz * s);
    }
  }
  // a wall's height over the ground, as drawn: a world's own for a tall machine (wallHeight), else the kerb's
  const tallOf = (w: Wall) => { const f = w.skin && g.s ? worldOf(g.s).wallHeight : undefined; return f ? f(w.skin) : undefined; };
  function wallH(w: Wall) {
    const h = tallOf(w);
    return h == null ? KERB : h;
  }
  // (a tall machine is in the way whatever its clock: its frame, a door drawn up, stand there all the time)
  const inWay = (w: Wall) => wallOn(w) || tallOf(w) != null;

  // a timed wall (a tram, a gate) counts only while the clock has it standing
  const wallOn = (w: Wall) => onAt(w, Math.floor(E.clock));
  // the hole's walls and posts, none before it is loaded; a world's solids
  // count the stroke's own walls too (a vault door, a gate the stroke brings)
  let wallsFor: object | null | undefined = null, wallsAll: readonly Wall[] = NO_WALLS;
  const walls = () => {
    if (!g.s) return NO_WALLS;
    const ex = E.strokeExtras;
    if (!ex || !ex.walls.length || !hasSolids()) return g.s.walls;
    if (wallsFor !== ex) (wallsFor = ex), (wallsAll = [...g.s.walls, ...ex.walls]);
    return wallsAll;
  };
  const posts = () => (g.s ? g.s.posts : NO_POSTS);
  // whether the course hides B from P: a wall or a post between them, higher
  // than the sight line where it crosses (no allocation, no ray)
  const POST_H = 1.6;
  let why = ""; // what occluded() last found in the way (the probes')
  function occluded(P: THREE.Vector3, B: THREE.Vector3) {
    if (!g.s) return false;
    // the ground and the decor between (from 1.5 out: what the ball sits in is not in the way)
    if (!lineClear(B, P.x, P.y, P.z, 0)) return (why = "ground"), true;
    for (const w of walls()) {
      if (!inWay(w)) continue;
      const t = segHit(B.x, B.z, P.x, P.z, w.a, w.b); // from the ball towards the camera
      if (t < 0) continue;
      const x = B.x + (P.x - B.x) * t, z = B.z + (P.z - B.z) * t;
      if (B.y + (P.y - B.y) * t < ground(x, z) + wallH(w)) return (why = "wall " + w.skin), true;
    }
    for (const p of posts()) {
      if (!p.c) continue;
      const t = rayCircle(B.x, B.z, P.x, P.z, p.c, p.r || 0.5);
      if (t > 0 && t < 1 && B.y + (P.y - B.y) * t < ground(p.c[0], p.c[1]) + POST_H) return (why = "post " + p.skin), true;
    }
    for (const k of nearSolids()) if (boxT(k, B.x, B.y, B.z, P.x, P.y, P.z) >= 0) return (why = "box " + Array.from(solids.subarray(k, k + 6), (v) => v.toFixed(1)).join(",")), true;
    return (why = ""), false;
  }
  // the nearest wall, post or solid on the line from (ox, oz) to (cx, cz), as
  // a fraction (1: none); its top (hitTop) for the sight line to clear there
  let hitH = KERB, hitY = NaN, hitOut = 0; // the kerb's height over the ground there, or a solid's top (and where the line leaves it)
  const hitTop = (x: number, z: number) => (Number.isNaN(hitY) ? ground(x, z) + hitH : hitY);
  // where the sight line must be over that top: a wall's line, a solid's far side
  const clearAt = (t: number) => (Number.isNaN(hitY) ? t : Math.min(1, hitOut));
  function firstHit(ox: number, oz: number, cx: number, cz: number) {
    let t = 1;
    (hitH = KERB), (hitY = NaN);
    for (const w of walls()) {
      if (!inWay(w)) continue;
      const h = segHit(ox, oz, cx, cz, w.a, w.b);
      if (h >= 0 && h < t) (t = h), (hitH = wallH(w));
    }
    for (const p of posts()) {
      if (!p.c) continue;
      const h = rayCircle(ox, oz, cx, cz, p.c, (p.r || 0.5) + 0.3);
      if (h > 0 && h < t) (t = h), (hitH = KERB);
    }
    // (a solid standing up from the ground, not one overhead)
    const by = E.ball.position.y;
    for (const k of nearSolids()) {
      if (solids[k + 1] > by + 1.2) continue;
      const h = boxT(k, ox, 0, oz, cx, 0, cz, 0.1, true);
      if (h > 0 && h < t) (t = h), (hitY = solids[k + 4]), (hitH = KERB), (hitOut = boxOut);
    }
    return t;
  }
  // A wall right behind the ball (a ball at rest against the kerb) cannot be
  // seen over from 7 behind at a sane pitch: the camera swings round a little,
  // either way, to the nearest heading it can look from — it never comes in
  // closer than MIN_FLAT, nor ends up over the ball's head.
  // at rest and aiming the framing wants 6.5 at least; rolling, 4.5 will do
  const MIN_FLAT = 4.5, REST_FLAT = 6.5;
  let flatFloor = MIN_FLAT;
  // Aiming, the camera stays straight behind the aim, and at least AIM_FLAT
  // back across the ground: over the rail if the board has no room there,
  // never swung to one side nor climbed over the gnome's head
  const AIM_FLAT = 4.5, AIM_NEAR = 3;
  let aimView = false;
  // turned by the player: the camera goes round the gnome on
  // the heading itself (its distance and height sprung), not along a spring's
  // chord — close in, a chord turned the view back before it came round
  let orbiting = false;
  // A world's solids: the gnome hidden from every stand the collision pass
  // tries on the heading (stuck), at rest: the heading goes round till he is
  // seen — the player's own, once he has stopped turning it, on the way he
  // turned (turnSign, less than a half turn), the route's by dodge, back at
  // the next stroke
  let stuck = false, dodge = 0, dodgeTo = 0, dodgeTick = 0, turnSign = 1, lastHeld = NaN, turnedAt = 0;
  const TURN_REST_MS = 600; // (the player's own heading goes round only once he has stopped turning it)
  function dodgeFrom(B: THREE.Vector3, dist: number, up: number, manual: boolean) {
    if (manual && performance.now() - turnedAt < TURN_REST_MS) return;
    const base = yaw + swing + dodge;
    for (let n = 1; n <= (manual ? 8 : 17); n++)
      for (const sg of manual ? [turnSign] : [turnSign, -turnSign]) { // (the player's own turn: on past it, never back)
        const a = base + sg * n * 0.35;
        _c0.set(B.x - Math.cos(a) * dist, 0, B.z - Math.sin(a) * dist);
        if (!inside(_c0.x, _c0.z, NEAR_GAP)) continue;
        for (const y of [B.y + up, B.y + Math.tan(MAX_PITCH) * dist]) {
          _c0.y = Math.max(y, floorAt(_c0.x, _c0.z) + 1);
          if (hidden(_c0, B) || nearSolids().some((k) => inRoom(k, _c0))) continue;
          if (manual) held = (held ?? yaw) + (a - base);
          else dodgeTo += a - base;
          return void (stuck = false);
        }
      }
  }
  const SWINGS: readonly number[] = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];
  const B_ = new THREE.Vector3(); // clearHeading's ball, for room()
  function clearHeading(B: THREE.Vector3, dist: number, up: number, aiming = false) {
    B_.copy(B);
    // first a heading it can look from at its own height, then one it can
    // look from by rising (up to MAX_PITCH)
    // (a tight pen: a unit closer is still the framing, and needs no climb)
    // (straight behind first, by rising if it must: the heading is the lane's
    // axis, or the aim; a swing only when it cannot see from there at all)
    for (const off of aiming ? [0] : SWINGS)
      for (const [lim, dd0] of [[up, dist], [up, dist - 1], [Math.tan(MAX_PITCH) * dist, dist]] as const) {
        // straight behind, the board may bring it in (keepInside: closer and
        // higher), aiming no nearer than AIM_FLAT; swung, only a spot inside
        // the board at the distance will do
        const r = off ? dd0 : Math.max(Math.min(dd0, room(0, dd0)), aiming ? AIM_FLAT : 0);
        if (r < (off ? dd0 : 2)) continue;
        const dd = r, a = yaw + off, cx = B.x - Math.cos(a) * dd, cz = B.z - Math.sin(a) * dd;
        if (off && !inside(cx, cz)) continue;
        const t = firstHit(B.x, B.z, cx, cz);
        if (t >= 1) return (pen = dist - dd), off;
        const need = (hitTop(B.x + (cx - B.x) * t, B.z + (cz - B.z) * t) + 0.35 - B.y) / Math.max(clearAt(t), 0.05);
        if (need <= lim && t * dd >= 1) return (pen = dist - dd), off;
      }
    pen = 0;
    // nowhere to see from: cramped straight behind (a ball against an end
    // rail) and much roomier to one side, it looks from that side instead
    // (not while aiming: the view stays behind the aim, closer in if it must)
    const r0 = room(0, dist);
    if (r0 >= 3 || aiming) return 0;
    let best = 0, br = r0;
    for (const off of SWINGS) { const r = room(off, dist); if (r > br + 1e-6) (best = off), (br = r); }
    return br >= 2 * r0 ? best : 0;
  }
  // how far behind B (along yaw + off) the board leaves inside, up to dist
  function room(off: number, dist: number) {
    const a = yaw + off, ux = -Math.cos(a), uz = -Math.sin(a);
    let r = 0;
    for (let q = 1; q <= 14; q++) if (inside(B_.x + ux * (dist * q) / 14, B_.z + uz * (dist * q) / 14, NEAR_GAP)) r = (dist * q) / 14; else break;
    return r;
  }
  // points along every closed tube that stands off the ground (a loop zone's
  // curve, not a thrown ball's arc) or runs along it (a tunnel), made once per hole
  const TUBE_CLEAR = 2.6; // the tube's 0.6 and the lens probe's 2
  let tubeFor: object | null = null, tubeList: THREE.Vector3[] = [];
  function tubeBits() {
    const tubes = g.course && g.course.userData.tubes;
    if (tubeFor === g.course) return tubeList;
    tubeFor = g.course;
    tubeList = [];
    // (and a tunnel's tube along the ground: its mouth is no place for the lens either)
    if (tubes) for (const [z, curve] of tubes) if ((z.kind === "tunnel" || (z.kind === "loop" && /tube/.test(z.skin || ""))) && !(curve.userData && (curve.userData.arc || curve.userData.ride))) for (let k = 0; k <= 48; k++) tubeList.push(curve.getPointAt(k / 48));
    return tubeList;
  }
  function keepInside(C: THREE.Vector3, B: THREE.Vector3) {
    const ox = B.x, oz = B.z;
    if (!inside(C.x, C.z, NEAR_GAP)) {
      const fx = C.x - ox, fz = C.z - oz, f0 = Math.hypot(fx, fz) || 1, want = Math.hypot(f0, C.y - B.y);
      // the farthest spot along its line to the ball that is; failing that
      // (a ball against a rail) the farthest still over the green
      let k = 0;
      for (const gap of [NEAR_GAP, 0]) {
        for (let q = 1; q <= 16 && !k; q++) if (inside(ox + (fx * (16 - q)) / 16, oz + (fz * (16 - q)) / 16, gap)) k = (16 - q) / 16;
        if (k) break;
      }
      if (!k) k = 0.03; // (not even that: over the gnome himself, raised below)
      // aiming: back to AIM_FLAT if it can, over the rail rather than over his
      // head, no further out than just past a rail; with no such spot (a
      // round end right behind), AIM_NEAR back all the same, never overhead
      if (aimView) {
        let q = Math.min(1, AIM_FLAT / f0);
        for (; q > k; q -= 0.05) {
          const x = ox + fx * q, z = oz + fz * q, t = g.course && g.course.userData.terrain;
          if ((t && t.onGreen(x, z)) || railGap(x, z) < 0.8) break;
        }
        k = Math.max(k, q, Math.min(1, AIM_NEAR / f0));
      }
      C.x = ox + fx * k;
      C.z = oz + fz * k;
      const fl = f0 * k;
      squeeze = Math.min(1, Math.max(0, (flatFloor - fl) / (flatFloor - 2)));
      C.y = Math.max(C.y, B.y + Math.min(Math.tan(maxPitch()) * fl, Math.sqrt(Math.max(0, want * want - fl * fl))));
    }
    // squeezed (a tee in a round end, a corner: brought in here, or by the
    // heading search's pen): steeper and a wider lens, up to SQUEEZE_PITCH and
    // SQUEEZE_FOV more, so the gnome is not a close-up
    squeeze = Math.min(1, Math.max(0, (flatFloor - Math.hypot(C.x - ox, C.z - oz)) / (flatFloor - 2)));
    // nearer a rail than RAIL_GAP: above it
    const railUp = railGap(C.x, C.z) < RAIL_GAP;
    if (railUp) C.y = Math.max(C.y, ground(C.x, C.z) + KERB + 0.6);
    return railUp;
  }
  function keepClear(C: THREE.Vector3, B: THREE.Vector3) {
    if (!g.s) return;
    const ox = B.x, oz = B.z;
    // (no lean away from a rail beside the ball: it turned the view off the
    // lane's axis; keepInside keeps the camera off the rail)
    // a post (a bumper, a mushroom) is never right beside the lens: pushed out of its reach
    for (const p of posts()) {
      const c = p.c;
      if (!c) continue;
      // a big one (a sandcastle) stands tall: a wider berth
      const r = (p.r || 0.5) + ((p.r || 0.5) >= 2 ? 2.6 : 1.6), dx = C.x - c[0], dz = C.z - c[1], d = Math.hypot(dx, dz);
      if (d < r && d > 1e-3) {
        // first along its own line to the ball, nearer or further (the
        // heading stays the lane's), the nearest spot clear of it
        const fx = C.x - ox, fz = C.z - oz, f0 = Math.hypot(fx, fz) || 1;
        let moved = false;
        for (let q = 1; q <= 12 && !moved; q++)
          for (const sgn of [-1, 1]) {
            const f = f0 + sgn * q * 0.5;
            if (f < 2) continue;
            const x = ox + (fx / f0) * f, z = oz + (fz / f0) * f;
            if (Math.hypot(x - c[0], z - c[1]) >= r && inside(x, z, NEAR_GAP)) { (C.x = x), (C.z = z), (moved = true); break; }
          }
        if (moved) continue;
        (C.x = c[0] + (dx / d) * r), (C.z = c[1] + (dz / d) * r);
        // pushed in towards the ball? keep the distance, round the post's far side
        const fl = Math.hypot(C.x - ox, C.z - oz);
        if (fl < flatFloor) (C.x = ox + ((C.x - ox) / (fl || 1)) * flatFloor), (C.z = oz + ((C.z - oz) / (fl || 1)) * flatFloor);
      }
    }
    // a tube in the air (island7's slide round its castle) is never right in
    // front of the lens either: pushed out of its reach, in 3D
    for (const q of tubeBits()) {
      const dx = C.x - q.x, dy = C.y - q.y, dz = C.z - q.z, d = Math.hypot(dx, dy, dz);
      if (d < TUBE_CLEAR && d > 1e-3) (C.x = q.x + (dx / d) * TUBE_CLEAR), (C.y = q.y + (dy / d) * TUBE_CLEAR), (C.z = q.z + (dz / d) * TUBE_CLEAR);
    }
    // the nearest wall or post between the ball and the camera
    const t = firstHit(ox, oz, C.x, C.z);
    let blocked = false;
    steep = false;
    const flat0 = Math.hypot(C.x - ox, C.z - oz) || 1;
    if (t < 1) {
      // a wall between: stay where it is, but high enough that the line of
      // sight clears the kerb at the wall; only if that would look down
      // steeper than MAX_PITCH, come in to just in front of it
      const need = B.y + (hitTop(ox + (C.x - ox) * t, oz + (C.z - oz) * t) + 0.35 - B.y) / Math.max(clearAt(t), 0.05);
      if (need - B.y <= Math.tan(MAX_PITCH) * flat0) C.y = Math.max(C.y, need);
      // (a world's solids: one right by the gnome, which coming in cannot get
      // in front of, is looked over from higher, up to STEEP)
      else if (hasSolids() && (t - 0.6 / flat0) * flat0 < flatFloor && need - B.y <= Math.tan(STEEP) * flat0) (C.y = Math.max(C.y, need)), (steep = true);
      else {
        const k = Math.max(Math.min(1, flatFloor / flat0), t - 0.6 / flat0);
        C.x = ox + (C.x - ox) * k;
        C.z = oz + (C.z - oz) * k;
        blocked = true;
      }
    }
    // inside the board (beyond a rail the scenery is higher than the course's
    // own ground, and a camera out there sits in the decor, the rail jammed
    // against the gnome): brought in along its line to the ball as far as it
    // must, and raised to keep the framing; a ball against a rail leaves no
    // spot clear of it, and there the camera stays above the rail instead
    const railUp = keepInside(C, B);
    const base = floorAt(C.x, C.z);
    if (railUp) C.y = Math.max(C.y, base + KERB + 0.6);
    if (blocked) C.y = Math.max(C.y, base + KERB + 1.5);
    C.y = Math.max(C.y, base + 1);
    // a rise in the ground between: the camera goes over it, not into it
    const L = Math.hypot(C.x - ox, C.z - oz) || 1;
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (t * L < 1.5) continue;
      const x = ox + (C.x - ox) * t, z = oz + (C.z - oz) * t, h = floorAt(x, z) + 0.8;
      if (B.y + (C.y - B.y) * t < h) C.y = Math.max(C.y, B.y + (h - B.y) / t);
    }
    // far enough, looking down at least MIN_PITCH and at most MAX_PITCH
    const flat = Math.hypot(C.x - ox, C.z - oz);
    C.y = Math.max(C.y, B.y + Math.tan(MIN_PITCH) * flat);
    C.y = Math.min(C.y, B.y + Math.tan(steep ? STEEP : maxPitch()) * Math.max(flat, MIN_D));
    const d3 = Math.hypot(flat, C.y - B.y);
    if (d3 < MIN_D) C.y = Math.min(B.y + Math.tan(maxPitch()) * MIN_D, B.y + Math.sqrt(Math.max(0, MIN_D * MIN_D - flat * flat)));
    // (a world's solids: a pitch clamp may have lowered it into one; and the
    // gnome still hidden: higher, up to STEEP, then nearer, till he is seen)
    if (hasSolids()) unbox(C, B), seeFrom(C, B);
  }
  const _head = new THREE.Vector3(), _c0 = new THREE.Vector3();
  // the gnome hidden from P: his head behind something (a world's solids: or his body, a kerb by him)
  function hidden(P: THREE.Vector3, B: THREE.Vector3) {
    if (occluded(P, _head.set(B.x, B.y + 0.7, B.z))) return true;
    return hasSolids() && occluded(P, _head.set(B.x, B.y + 0.3, B.z));
  }
  function seeFrom(C: THREE.Vector3, B: THREE.Vector3) {
    if (!hidden(C, B)) return void (stuck = false);
    _c0.copy(C);
    const fx = C.x - B.x, fz = C.z - B.z, f0 = Math.hypot(fx, fz) || 1;
    for (let f = f0; f >= 2.5; f -= 0.5) {
      (C.x = B.x + (fx * f) / f0), (C.z = B.z + (fz * f) / f0);
      if (f < f0 && !inside(C.x, C.z, 0)) continue;
      const lo = floorAt(C.x, C.z) + 0.6, hi = B.y + Math.tan(STEEP) * f, y0 = Math.min(Math.max(_c0.y, lo), hi);
      // (nearest the height it has first, up or down: under a timber over the lane, not up into it)
      for (let n = 0; n < 60; n++) {
        const y = y0 + (n & 1 ? -1 : 1) * Math.ceil(n / 2) * 0.4;
        if (y < lo || y > hi) { if (y0 + Math.ceil(n / 2) * 0.4 > hi && y0 - Math.ceil(n / 2) * 0.4 < lo) break; continue; }
        C.y = y;
        if (!hidden(C, B) && !nearSolids().some((k) => inRoom(k, C))) return void ((steep = true), (stuck = false));
      }
    }
    // (none the boxes allow — one hugging the gnome, a stalagmite's cone boxed
    // square: steeply over him, nearer, where the cone is well below the line)
    const f = Math.max(3, f0 * 0.6);
    C.set(B.x + (fx * f) / f0, B.y + Math.tan(STEEP) * f, B.z + (fz * f) / f0);
    if (nearSolids().some((k) => inRoom(k, C)) || hidden(C, B)) (C.copy(_c0)), (stuck = true);
    else (steep = true), (stuck = false);
  }


  return {
    /** Moves the camera one frame (dt seconds) towards its target pose. */
    update: updateCamera,
    /** The follow starts afresh (a new mode, a new round). */
    resetFollow,
    /** The next frame starts in the target pose, not eased into it (a new round). */
    jump: () => (sp.live = false),
    /** The intro glide to the player's camera (from the next frame drawn). */
    glide: () => Object.assign(glide, { on: true, wait: 1, t0: 0, cut: 0 }),
    /** A click or an aim during the glide: the rest of it in GLIDE_CUT_MS. */
    finishGlide: () => {
      if (!glide.on || glide.cut) return;
      if (!glide.t0) return void (glide.on = false); // not started: no glide at all
      (glide.cut = performance.now()), (glide.e0 = inOut(Math.min(1, (glide.cut - glide.t0) / GLIDE_MS)));
    },
    gliding: () => glide.on,
    /** A hole just built: what the camera reads of it, made now (no frame is drawn yet), not on the first frame that needs it. */
    prepare: () => void (routeOn() ? routeField() : courseField()),
    /** A world's camSolids: the pieces' boxes, from the hole built and not yet merged. */
    collect,
    /** ?camlog only: the solids' count, and the ground under (x, z) as the camera has it. */
    solidsInfo: (x: number, z: number, r = 0) => ({ solids: solids.length / 6, near: nearSolids().length, floor: +floorAt(x, z).toFixed(2), why: (occluded(camera.position, _v.copy(E.ball.position).setY(E.ball.position.y + 0.7)), why), body: (occluded(camera.position, _v.copy(E.ball.position).setY(E.ball.position.y + 0.3)), why),
      boxes: r ? nearSolids().filter((k) => Math.hypot((solids[k] + solids[k + 3]) / 2 - x, (solids[k + 2] + solids[k + 5]) / 2 - z) < r).map((k) => Array.from(solids.subarray(k, k + 6), (v) => +v.toFixed(1))) : undefined }),
    /** The mouse over the course (the whole-course view leans with it). */
    hover: onHover,
    /** The third-person heading: the view's as it is (its swing round a wall in it). */
    yaw: () => (g.cam === "third" ? viewYaw() : yaw),
    /** Third person: the view turned by da radians (the wheel), kept till the next stroke. */
    turn: (da: number) => {
      if (g.cam !== "third" || camState() !== "rest") return;
      takeView();
      held = (held ?? yaw) + da;
    },
    settled: () => settled,
    // for the ?camlog probes
    occluded, camLog, lensWho,
    /** The lane's axis at (x, z), as the rest heading reads it. */
    laneAt: (x: number, z: number) => laneHeading(x, z),
    /** The probes' own: the route on (true) or off (false) whatever the world, or the world's again (null). */
    forceRoute: (on: boolean | null) => void (forceRoute = on),
    /** The route's distance to the cup from (x, z), null where it has none. */
    routeAt: (x: number, z: number) => { const f = routeField(), i = Math.floor(x / CELL), j = Math.floor(z / CELL); return f && f.inGrid(i, j) && f.dist[f.idx(i, j)] < Infinity ? +f.dist[f.idx(i, j)].toFixed(1) : null; },
    inner: () => ({ swing: +swing.toFixed(2), pen, rise: +rise.toFixed(2), wide: +wide.toFixed(2), yaw: +yaw.toFixed(2), steep, want: want.pos.toArray().map((v) => +v.toFixed(2)), chase: chase.pos.toArray().map((v) => +v.toFixed(2)), sp: sp.pos.toArray().map((v) => +v.toFixed(2)) }),
  };
}
