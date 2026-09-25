// The camera controller: where the camera wants to be for the mode and the
// state the game is in, and the springs that take it there; the chase
// camera's collision tests (walls, posts, tubes, the ground between).
//
// E: the engine's live state (engine/types.ts Live).
import * as THREE from "three";
import { behind, chaseState } from "../chase";
import { focusRig, applyRig, ORBIT } from "../scene";
import { BALL_R, CELL, onAt, closest, segHit, rayCircle, angDiff } from "../terrain";
import type { Post, Wall } from "../types";
import type { Rig } from "../scene/camera";
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
  const { g, camera, scene, screen, ground } = E;
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
    // in flight, follow the ball; at rest, keep the cup in the picture too
    if (g.flying || !g.s) {
      const r = focusRig(E.ball.position, g.over!, screen(), null, focus);
      r.dist *= FOLLOW_CLOSER;
      return r;
    }
    cupAt.set(g.s.cup[0], E.ball.position.y, g.s.cup[1]);
    // following the gnome: 30 % closer than the rig's own framing, the cup
    // still leaned toward; tall decor in the way is faded by the canopy
    const r = focusRig(E.ball.position, g.over!, screen(), cupAt, focus);
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
  const resetFollow = () => ((fresh = true), (wide = hold = rise = swing = 0), vel.set(0, 0, 0));
  const ndcB = new THREE.Vector3(), ndcTop = new THREE.Vector3(), ndcBot = new THREE.Vector3(), headAt = new THREE.Vector3(), camLog: CamRow[] = [];
  let sightOk = true, sightTick = 0, clearTick = 0;
  const lensWho: Record<number, number> = {};
  const rawPos = new THREE.Vector3(), push = new THREE.Vector3();
  // where the ball is when the course hides it on purpose (a tube, a tunnel): a ring over everything
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false })
  );
  marker.renderOrder = 30;
  marker.visible = false;
  scene.add(marker);

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
  /** The heading from (x, z) towards where the lane leads, or null. */
  function aheadHeading(x: number, z: number) {
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
  const cupPt = new THREE.Vector3();
  function thirdTarget(dt: number, state: CamState) {
    // holed: framed on the cup, up and back a little — the ball sinking into
    // it is not followed down (that was a close-up of the hat)
    const B = state === "holed" && g.s ? cupPt.set(g.s.cup[0], BALL_R + ground(g.s.cup[0], g.s.cup[1]), g.s.cup[1]) : E.ball.position;
    let target = yaw, turning = false;
    const pulling = state === "aiming";
    aimView = pulling;
    flatFloor = state === "rest" || state === "aiming" ? REST_FLAT : MIN_FLAT;
    if (pulling) target = E.shot.power > 0 ? E.shot.angle : yaw; // trailing the aim (measured from the pull's start heading)
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
      const step = pulling ? d * (1 - Math.exp(-dt / 0.14)) : d; // aiming: a 0.14 s trail (a U-turn within 15° in 0.5 s)
      const cap = dt * (pulling ? (8 * Math.PI) / 3 : Math.PI / 2); // at most 480°/s aiming, 90°/s rolling
      yaw += Math.max(-cap, Math.min(cap, step));
    }
    const widen = turning || reversing || state === "holed" || (pulling && Math.abs(d) > Math.PI / 2);
    wide += ((widen ? 1 : 0) - wide) * (1 - Math.exp(-dt * (widen ? 5 : 1.5)));
    // behind along the heading — swung round a little if a wall right behind blocks the view
    const up = (state === "holed" ? 4.2 : 3) + wide * 2.5 + rise;
    if (fresh || ++swingTick % 10 === 0) swingTo = clearHeading(B, 7 + wide * 4, up, pulling);
    swing += (swingTo - swing) * (1 - Math.exp(-dt * 3));
    const back = 7 + wide * 4 - pen;
    cdir.set(Math.cos(yaw + swing), 0, Math.sin(yaw + swing));
    behind(chase, B, cdir, { back, up, ahead: 0, lookUp: 0 });
    // the collision pass (walls, posts, ground under the line) three times in
    // four frames' worth of time is plenty: between passes its push is reused
    if (fresh || ++clearTick % 3 === 0) {
      rawPos.copy(chase.pos);
      keepClear(chase.pos, B);
      push.subVectors(chase.pos, rawPos);
    } else (chase.pos.add(push), keepInside(chase.pos, B)); // (the reused push may drift it out of the board)
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
    want.far = 80; // close in: the course and its near scenery, not the far hills (fewer draws, finer depth)
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
    const mode = g.cam === "third" && g.view === "ball" ? "third" : "rig";
    const state = camState();
    if (mode !== lastMode && !glide.on) resetFollow();
    lastMode = mode;
    const gl = glideStep(mode, state);
    const snap = gl >= 0 ? false : mode === "third" ? thirdTarget(dt, state) : rigTarget();
    const snapped = snap || !sp.live;
    // faster in flight, a touch faster still when the ball would leave the frame
    const w = urgent ? 16 : state === "replay" ? 11 : 9;
    if (gl >= 0) {
      // (the glide has put the pose itself)
    } else if (!sp.live || snap) {
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
    if (mode === "third" && gl < 0) {
      const B0 = E.ball.position, fx = sp.pos.x - B0.x, fz = sp.pos.z - B0.z, fl = Math.hypot(fx, fz);
      if (fl < MIN_FLAT - 0.3 && inside(B0.x + (fx / Math.max(fl, 1e-3)) * (MIN_FLAT - 0.3), B0.z + (fz / Math.max(fl, 1e-3)) * (MIN_FLAT - 0.3), NEAR_GAP)) {
        const k = (MIN_FLAT - 0.3) / Math.max(fl, 1e-3);
        if (fl > 1e-3) (sp.pos.x = B0.x + fx * k), (sp.pos.z = B0.z + fz * k);
        else (sp.pos.x = B0.x - cdir.x * MIN_FLAT), (sp.pos.z = B0.z - cdir.z * MIN_FLAT);
      }
      sp.pos.y = Math.min(sp.pos.y, B0.y + Math.tan(MAX_PITCH + squeezed * SQUEEZE_PITCH + 0.1) * Math.max(Math.hypot(sp.pos.x - B0.x, sp.pos.z - B0.z), MIN_D));
    }
    // (the springs lag a target that moves: behind a ball leaving a round
    // end that lag is out past the rail — the real pose slides back in along
    // its line to the target, which is inside; not while aiming, whose target
    // may sit just over the rail: pulled in there, the pose sawed back and forth)
    if (mode === "third" && gl < 0 && !aimView && !inside(sp.pos.x, sp.pos.z, NEAR_GAP)) {
      _d.subVectors(want.pos, sp.pos);
      let q = 1;
      while (q < 8 && !inside(sp.pos.x + (_d.x * q) / 8, sp.pos.z + (_d.z * q) / 8, NEAR_GAP)) q++;
      sp.pos.addScaledVector(_d, q / 8);
    }
    // the gnome never off the picture: the look turned toward him when it is
    // more than LOOK_OFF of the lens off him — the springs lagging a ball
    // rolling back at a camera the board leaves no room to back off in, or
    // the glide's look still on the middle of a long hole
    if ((mode === "third" && gl < 0) || gl > 0) {
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
    // hidden by a wall → rise a little; hidden on purpose (a tube) → a ring
    const B = E.ball.position;
    ndcB.copy(B).project(camera);
    const inFrame = ndcB.z < 1 && Math.abs(ndcB.x) < 0.7 && Math.abs(ndcB.y) < 0.7;
    // in sight: the gnome's head over any kerb between (the hat is what the player looks for)
    if (!inFrame) sightOk = false;
    else if (++sightTick % 2 === 0 || !sightOk) sightOk = !occluded(camera.position, headAt.copy(B).setY(B.y + 0.7));
    const seen = inFrame && sightOk;
    // (decor between is the canopy's to fade; a ray through the whole baked course each frame cost 3× the frame)
    const blocked = inFrame && !seen;
    // out of frame or behind a wall: the springs catch up fast until it is back in sight
    urgent = mode === "third" && gl < 0 && (!inFrame || blocked);
    rise = blocked ? Math.min(3, rise + dt * 12) : Math.max(0, rise - dt * 6);
    // down a cliff, into water, in a tube: hidden on purpose, and marked
    const under = g.inTube || B.y < ground(B.x, B.z) - 0.3;
    marker.visible = !seen && (under || (mode === "third" && rise >= 3));
    if (marker.visible) (marker.position.copy(B), marker.quaternion.copy(camera.quaternion));
    settled = !glide.on && sp.vp.lengthSq() < 1e-4 && sp.vl.lengthSq() < 1e-4 && Math.abs(sp.vf) < 1e-3;
    if (E.log) {
      // [yaw°, distance, widening, seen, in a tube, pitch°, flat distance, gnome height (share of screen), ball ndc y, cup ndc x, state, near-wall, in frame, snapped, ball ndc x, ms, squeezed, glide share (-1: none), camera azimuth°]
      const fl = Math.hypot(camera.position.x - B.x, camera.position.z - B.z);
      const top = ndcTop.copy(B).setY(B.y + 1.1).project(camera).y, bot = ndcBot.copy(B).setY(B.y - BALL_R).project(camera).y;
      const cupX = ndcTop.set(s.cup[0], B.y, s.cup[1]).project(camera).x;
      camLog.push([+((yaw * 180) / Math.PI).toFixed(1), +camera.position.distanceTo(B).toFixed(1), +wide.toFixed(2), seen ? 1 : 0, under ? 1 : 0,
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
  const maxPitch = () => MAX_PITCH + (aimView ? 0 : squeeze * SQUEEZE_PITCH); // (aiming, never steeper: the view along the aim is the point)
  /** Whether the line from B (raised by lift) to C clears the ground (from 1.5 out). */
  function lineClear(B: THREE.Vector3, cx: number, cy: number, cz: number, lift = 0.7) {
    const L = Math.hypot(cx - B.x, cz - B.z) || 1;
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (t * L < 1.5) continue;
      const x = B.x + (cx - B.x) * t, z = B.z + (cz - B.z) * t;
      if (B.y + lift + (cy - B.y - lift) * t < ground(x, z) + 0.15) return false;
    }
    return true;
  }

  // a timed wall (a tram, a gate) counts only while the clock has it standing
  const wallOn = (w: Wall) => onAt(w, Math.floor(E.clock));
  // the hole's walls and posts, none before it is loaded
  const walls = () => (g.s ? g.s.walls : NO_WALLS);
  const posts = () => (g.s ? g.s.posts : NO_POSTS);
  // whether the course hides B from P: a wall or a post between them, higher
  // than the sight line where it crosses (no allocation, no ray)
  const POST_H = 1.6;
  function occluded(P: THREE.Vector3, B: THREE.Vector3) {
    if (!g.s) return false;
    // the ground and the decor between (from 1.5 out: what the ball sits in is not in the way)
    if (!lineClear(B, P.x, P.y, P.z, 0)) return true;
    for (const w of walls()) {
      if (!wallOn(w)) continue;
      const t = segHit(B.x, B.z, P.x, P.z, w.a, w.b); // from the ball towards the camera
      if (t < 0) continue;
      const x = B.x + (P.x - B.x) * t, z = B.z + (P.z - B.z) * t;
      if (B.y + (P.y - B.y) * t < ground(x, z) + KERB) return true;
    }
    for (const p of posts()) {
      if (!p.c) continue;
      const t = rayCircle(B.x, B.z, P.x, P.z, p.c, p.r || 0.5);
      if (t > 0 && t < 1 && B.y + (P.y - B.y) * t < ground(p.c[0], p.c[1]) + POST_H) return true;
    }
    return false;
  }
  // the nearest wall or post on the line from (ox, oz) to (cx, cz), as a fraction (1: none)
  function firstHit(ox: number, oz: number, cx: number, cz: number) {
    let t = 1;
    for (const w of walls()) {
      if (!wallOn(w)) continue;
      const h = segHit(ox, oz, cx, cz, w.a, w.b);
      if (h >= 0 && h < t) t = h;
    }
    for (const p of posts()) {
      if (!p.c) continue;
      const h = rayCircle(ox, oz, cx, cz, p.c, (p.r || 0.5) + 0.3);
      if (h > 0 && h < t) t = h;
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
        const need = (ground(B.x + (cx - B.x) * t, B.z + (cz - B.z) * t) + KERB + 0.35 - B.y) / Math.max(t, 0.05);
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
    if (tubes) for (const [z, curve] of tubes) if ((z.kind === "tunnel" || (z.kind === "loop" && /tube/.test(z.skin || ""))) && !(curve.userData && curve.userData.arc)) for (let k = 0; k <= 48; k++) tubeList.push(curve.getPointAt(k / 48));
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
    const flat0 = Math.hypot(C.x - ox, C.z - oz) || 1;
    if (t < 1) {
      // a wall between: stay where it is, but high enough that the line of
      // sight clears the kerb at the wall; only if that would look down
      // steeper than MAX_PITCH, come in to just in front of it
      const need = B.y + (ground(ox + (C.x - ox) * t, oz + (C.z - oz) * t) + KERB + 0.35 - B.y) / Math.max(t, 0.05);
      if (need - B.y <= Math.tan(MAX_PITCH) * flat0) C.y = Math.max(C.y, need);
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
    const base = ground(C.x, C.z);
    if (railUp) C.y = Math.max(C.y, base + KERB + 0.6);
    if (blocked) C.y = Math.max(C.y, base + KERB + 1.5);
    C.y = Math.max(C.y, base + 1);
    // a rise in the ground between: the camera goes over it, not into it
    const L = Math.hypot(C.x - ox, C.z - oz) || 1;
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (t * L < 1.5) continue;
      const x = ox + (C.x - ox) * t, z = oz + (C.z - oz) * t, h = ground(x, z) + 0.8;
      if (B.y + (C.y - B.y) * t < h) C.y = Math.max(C.y, B.y + (h - B.y) / t);
    }
    // far enough, looking down at least MIN_PITCH and at most MAX_PITCH
    const flat = Math.hypot(C.x - ox, C.z - oz);
    C.y = Math.max(C.y, B.y + Math.tan(MIN_PITCH) * flat);
    C.y = Math.min(C.y, B.y + Math.tan(maxPitch()) * Math.max(flat, MIN_D));
    const d3 = Math.hypot(flat, C.y - B.y);
    if (d3 < MIN_D) C.y = Math.min(B.y + Math.tan(maxPitch()) * MIN_D, B.y + Math.sqrt(Math.max(0, MIN_D * MIN_D - flat * flat)));
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
    prepare: () => void courseField(),
    /** The mouse over the course (the whole-course view leans with it). */
    hover: onHover,
    yaw: () => yaw,
    settled: () => settled,
    // for the ?camlog probes
    occluded, marker, camLog, lensWho,
    /** The lane's axis at (x, z), as the rest heading reads it. */
    laneAt: (x: number, z: number) => laneHeading(x, z),
    inner: () => ({ swing: +swing.toFixed(2), pen, rise: +rise.toFixed(2), wide: +wide.toFixed(2), yaw: +yaw.toFixed(2) }),
  };
}
