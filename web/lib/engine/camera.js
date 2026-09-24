// The camera controller: where the camera wants to be for the mode and the
// state the game is in, and the springs that take it there; the chase
// camera's collision tests (walls, posts, tubes, the ground between).
//
// E, the engine's live state: { g, camera, scene, screen(), ground(x, z),
// ball, dragging, shot, clock (read as they change), log (?camlog) }.
import * as THREE from "three";
import { behind, chaseState } from "../chase.js";
import { focusRig, applyRig } from "../scene.js";
import { BALL_R, CELL, onAt, closest, segHit, rayCircle } from "../terrain.js";

const FOLLOW_CLOSER = 0.7; // the follow camera, nearer the gnome than the rig frames it

export function makeCamera(E) {
  const { g, camera, scene, screen, ground } = E;
  let settled = false; // the springs at rest: a still scene may be drawn less often
  const cupAt = new THREE.Vector3();
  // the camera's goal, filled in place every frame instead of made anew
  const focus = { target: new THREE.Vector3(), dist: 0, ox: 0, oy: 0 };
  // In the whole-course view the mouse leans the camera: over to the side it
  // is on, a little further or nearer, to look past the ends of the island.
  // A pointer that is not a mouse (a finger) leaves it still.
  const lean = { x: 0, y: 0 };
  const onHover = (ev) => {
    if (ev.pointerType !== "mouse" || E.dragging) return;
    lean.x = Math.max(-1, Math.min(1, (ev.clientX / window.innerWidth - 0.5) * 2));
    lean.y = Math.max(-1, Math.min(1, (ev.clientY / window.innerHeight - 0.5) * 2));
  };
  const leant = { target: new THREE.Vector3(), dist: 0, ox: 0, oy: 0 };
  function goal() {
    if (g.view !== "ball") {
      if (!g.over || !g.s) return g.over;
      const span = g.over.lean == null ? g.s.board.w * 0.22 + 3 : g.over.lean;
      leant.target.copy(g.over.target);
      leant.target.x += lean.x * span;
      leant.target.z += lean.y * span * 0.25;
      leant.dist = g.over.dist;
      leant.ox = g.over.ox;
      leant.oy = g.over.oy;
      return leant;
    }
    // in flight, follow the ball; at rest, keep the cup in the picture too
    if (g.flying || !g.s) {
      const r = focusRig(E.ball.position, g.over, screen(), null, focus);
      r.dist *= FOLLOW_CLOSER;
      return r;
    }
    cupAt.set(g.s.cup[0], E.ball.position.y, g.s.cup[1]);
    // following the gnome: 30 % closer than the rig's own framing, the cup
    // still leaned toward; tall decor in the way is faded by the canopy
    const r = focusRig(E.ball.position, g.over, screen(), cupAt, focus);
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
  const camState = () => (g.holed || (g.done && nearCup()) ? "holed" : g.inTube ? "tube" : g.flying ? "replay" : E.dragging || g.aiming ? "aiming" : "rest");
  // the target pose, and the springs' own state (position, look-at, lens, offset)
  const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30, oy: 0, near: 3, far: 260 };
  const sp = { pos: new THREE.Vector3(), vp: new THREE.Vector3(), look: new THREE.Vector3(), vl: new THREE.Vector3(), fov: 30, vf: 0, oy: 0, vo: 0, live: false };
  const rigCam = new THREE.PerspectiveCamera(30, 1, 3, 260); // where the rig would put the camera
  const _d = new THREE.Vector3();
  // x'' = ω²(x* − x) − 2ωx': critically damped, settled in ~4.7/ω seconds
  function springV(x, v, target, w, dt) {
    _d.subVectors(target, x).multiplyScalar(w * w).addScaledVector(v, -2 * w);
    v.addScaledVector(_d, dt);
    x.addScaledVector(v, dt);
  }
  const _sn = { x: 0, v: 0 }; // springN's answer, reused: it runs twice a frame
  function springN(x, v, target, w, dt) {
    const a = w * w * (target - x) - 2 * w * v;
    v += a * dt;
    return ((_sn.x = x + v * dt), (_sn.v = v), _sn);
  }
  let lastMode = null;
  // the third-person follow's own state, reset whenever the mode or the hole changes
  const chase = chaseState(), cdir = new THREE.Vector3(1, 0, 0), prevB = new THREE.Vector3(), vel = new THREE.Vector3(), inst = new THREE.Vector3();
  let yaw = 0, wide = 0, hold = 0, rise = 0, swing = 0, swingTo = 0, swingTick = 0, pen = 0, fresh = true, urgent = false;
  const resetFollow = () => ((fresh = true), (wide = hold = rise = swing = 0), vel.set(0, 0, 0));
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const ndcB = new THREE.Vector3(), ndcTop = new THREE.Vector3(), ndcBot = new THREE.Vector3(), headAt = new THREE.Vector3(), camLog = [];
  let sightOk = true, sightTick = 0, clearTick = 0;
  const lensWho = {};
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
  let field = null;
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
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (!inGrid(a, b)) continue;
        const n = idx(a, b);
        if (!green[n] || dist[n] !== Infinity) continue;
        dist[n] = dist[k] + 1;
        q[tail++] = n;
      }
    }
    return (field = { id: g.id, dist, idx, inGrid });
  }
  /** The heading from (x, z) towards where the lane leads, or null. */
  function aheadHeading(x, z) {
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

  /** Third person's target, per state: 7 behind, 3 up, looking along the aim, the ball's run, or at the cup. */
  const cupPt = new THREE.Vector3();
  function thirdTarget(dt, state) {
    // holed: framed on the cup, up and back a little — the ball sinking into
    // it is not followed down (that was a close-up of the hat)
    const B = state === "holed" && g.s ? cupPt.set(g.s.cup[0], BALL_R + ground(g.s.cup[0], g.s.cup[1]), g.s.cup[1]) : E.ball.position;
    let target = yaw, turning = false;
    const pulling = state === "aiming";
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
      // where the lane leads next from here (an S or a spiral turns the camera with it), else the cup
      const a = aheadHeading(B.x, B.z);
      target = a != null ? a : Math.atan2(g.s.cup[1] - B.z, g.s.cup[0] - B.x);
    }
    // a jump, a tunnel exit: the ball is elsewhere at once, and so is the camera
    const teleport = !fresh && B.distanceTo(prevB) > 2.5;
    if (fresh || teleport) (yaw = target), vel.set(0, 0, 0), (rise = 0);
    prevB.copy(B);
    const d = angDiff(target, yaw);
    // coming back at the camera: rise and back off rather than spin round
    const reversing = state === "replay" && Math.abs(d) > (2 * Math.PI) / 3;
    if (!reversing) {
      const step = pulling ? d * (1 - Math.exp(-dt / 0.35)) : d; // aiming: a 0.35 s trail
      const cap = dt * (pulling ? (2 * Math.PI) / 3 : Math.PI / 2); // at most 120°/s aiming, 90°/s rolling
      yaw += Math.max(-cap, Math.min(cap, step));
    }
    const widen = turning || reversing || state === "holed" || (pulling && Math.abs(d) > Math.PI / 2);
    wide += ((widen ? 1 : 0) - wide) * (1 - Math.exp(-dt * (widen ? 5 : 1.5)));
    // behind along the heading — swung round a little if a wall right behind blocks the view
    const up = (state === "holed" ? 4.2 : 3) + wide * 2.5 + rise;
    if (fresh || ++swingTick % 10 === 0) swingTo = clearHeading(B, 7 + wide * 4, up);
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
    } else chase.pos.add(push);
    // the gnome in the lower third: look a little past it, less the steeper the view
    const hz = Math.hypot(chase.pos.x - B.x, chase.pos.z - B.z), hy = chase.pos.y - B.y;
    chase.look.copy(B).addScaledVector(cdir, Math.max(0, 1.8 - Math.max(0, hy - hz * 0.5) * 0.4));
    want.pos.copy(chase.pos);
    want.look.copy(chase.look);
    want.fov = TP_FOV;
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

  function updateCamera(dt) {
    if (!g.s || !g.over) return;
    const mode = g.cam === "third" && g.view === "ball" ? "third" : "rig";
    const state = camState();
    if (mode !== lastMode) resetFollow();
    lastMode = mode;
    const snap = mode === "third" ? thirdTarget(dt, state) : rigTarget();
    const snapped = snap || !sp.live;
    // faster in flight, a touch faster still when the ball would leave the frame
    const w = urgent ? 16 : state === "replay" ? 11 : 9;
    if (!sp.live || snap) {
      sp.pos.copy(want.pos), sp.look.copy(want.look), (sp.fov = want.fov), (sp.oy = want.oy), sp.vp.set(0, 0, 0), sp.vl.set(0, 0, 0), (sp.vf = sp.vo = 0), (sp.live = true);
    } else {
      springV(sp.pos, sp.vp, want.pos, w, dt);
      springV(sp.look, sp.vl, want.look, urgent ? 18 : w, dt);
      ({ x: sp.fov, v: sp.vf } = springN(sp.fov, sp.vf, want.fov, 9, dt));
      ({ x: sp.oy, v: sp.vo } = springN(sp.oy, sp.vo, want.oy, 9, dt));
    }
    // a hard floor on the real pose too (the spring lags a ball rolling back
    // at the camera): never nearer than MIN_FLAT across the ground in third person
    if (mode === "third") {
      const B0 = E.ball.position, fx = sp.pos.x - B0.x, fz = sp.pos.z - B0.z, fl = Math.hypot(fx, fz);
      if (fl < MIN_FLAT - 0.3) {
        const k = (MIN_FLAT - 0.3) / Math.max(fl, 1e-3);
        if (fl > 1e-3) (sp.pos.x = B0.x + fx * k), (sp.pos.z = B0.z + fz * k);
        else (sp.pos.x = B0.x - cdir.x * MIN_FLAT), (sp.pos.z = B0.z - cdir.z * MIN_FLAT);
      }
      sp.pos.y = Math.min(sp.pos.y, B0.y + Math.tan(MAX_PITCH + 0.1) * Math.max(Math.hypot(sp.pos.x - B0.x, sp.pos.z - B0.z), MIN_D));
    }
    const v = screen();
    camera.aspect = v.w / v.h;
    camera.position.copy(sp.pos);
    camera.lookAt(sp.look);
    if (Math.abs(sp.oy) > 0.5) camera.setViewOffset(v.w, v.h, 0, sp.oy, v.w, v.h);
    else camera.clearViewOffset();
    camera.fov = sp.fov;
    camera.near = Math.min(want.near, sp.pos.distanceTo(E.ball.position) * 0.5);
    camera.far = want.far;
    camera.updateProjectionMatrix();
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
    urgent = mode === "third" && (!inFrame || blocked);
    rise = blocked ? Math.min(3, rise + dt * 12) : Math.max(0, rise - dt * 6);
    // down a cliff, into water, in a tube: hidden on purpose, and marked
    const under = g.inTube || B.y < ground(B.x, B.z) - 0.3;
    marker.visible = !seen && (under || (mode === "third" && rise >= 3));
    if (marker.visible) (marker.position.copy(B), marker.quaternion.copy(camera.quaternion));
    settled = sp.vp.lengthSq() < 1e-4 && sp.vl.lengthSq() < 1e-4 && Math.abs(sp.vf) < 1e-3;
    if (E.log) {
      // [yaw°, distance, widening, seen, in a tube, pitch°, flat distance, gnome height (share of screen), ball ndc y, cup ndc x, state, near-wall]
      const fl = Math.hypot(camera.position.x - B.x, camera.position.z - B.z);
      const top = ndcTop.copy(B).setY(B.y + 1.1).project(camera).y, bot = ndcBot.copy(B).setY(B.y - BALL_R).project(camera).y;
      const cupX = ndcTop.set(g.s.cup[0], B.y, g.s.cup[1]).project(camera).x;
      camLog.push([+((yaw * 180) / Math.PI).toFixed(1), +camera.position.distanceTo(B).toFixed(1), +wide.toFixed(2), seen ? 1 : 0, under ? 1 : 0,
        +((Math.atan2(camera.position.y - B.y, fl) * 180) / Math.PI).toFixed(1), +fl.toFixed(1), +((top - bot) / 2).toFixed(3), +ndcB.y.toFixed(2), +cupX.toFixed(2), state, wallHug(camera.position) ? 1 : 0, inFrame ? 1 : 0, snapped ? 1 : 0, +ndcB.x.toFixed(2), Math.round(performance.now())]);
    }
  }
  // a camera in a wall's face: within 1 of a wall and below its kerb top
  function wallHug(P) {
    for (const w of g.s.walls) {
      if (wallOn(w) && closest(P.x, P.z, w.a, w.b).d < 1 && P.y < ground(P.x, P.z) + KERB + 0.3) return true;
    }
    return false;
  }

  // The chase camera never sits in or behind a wall: the line from the ball to
  // it is tested against the hole's walls and posts, and a hit brings it in
  // front of the wall and up over the kerb. It stays over the board, at least
  // MIN_D from the ball and looking down at least MIN_PITCH; beside a wall it
  // leans away from it. The chase's own easing then smooths every push.
  const TP_FOV = 58; // third person's lens (the others keep 30)
  const KERB = 1.1, MIN_D = 3, MIN_PITCH = (18 * Math.PI) / 180, MAX_PITCH = (40 * Math.PI) / 180;
  /** Whether the line from B (raised by lift) to C clears the ground (from 1.5 out). */
  function lineClear(B, cx, cy, cz, lift = 0.7) {
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
  const wallOn = (w) => onAt(w, Math.floor(E.clock));
  // whether the course hides B from P: a wall or a post between them, higher
  // than the sight line where it crosses (no allocation, no ray)
  const POST_H = 1.6;
  function occluded(P, B) {
    if (!g.s) return false;
    // the ground and the decor between (from 1.5 out: what the ball sits in is not in the way)
    if (!lineClear(B, P.x, P.y, P.z, 0)) return true;
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const t = segHit(B.x, B.z, P.x, P.z, w.a, w.b); // from the ball towards the camera
      if (t < 0) continue;
      const x = B.x + (P.x - B.x) * t, z = B.z + (P.z - B.z) * t;
      if (B.y + (P.y - B.y) * t < ground(x, z) + KERB) return true;
    }
    for (const p of g.s.posts || []) {
      if (!p.c) continue;
      const t = rayCircle(B.x, B.z, P.x, P.z, p.c, p.r || 0.5);
      if (t > 0 && t < 1 && B.y + (P.y - B.y) * t < ground(p.c[0], p.c[1]) + POST_H) return true;
    }
    return false;
  }
  // the nearest wall or post on the line from (ox, oz) to (cx, cz), as a fraction (1: none)
  function firstHit(ox, oz, cx, cz) {
    let t = 1;
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const h = segHit(ox, oz, cx, cz, w.a, w.b);
      if (h >= 0 && h < t) t = h;
    }
    for (const p of g.s.posts || []) {
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
  const SWINGS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];
  function clearHeading(B, dist, up) {
    // first a heading it can look from at its own height, then one it can
    // look from by rising (up to MAX_PITCH)
    // (a tight pen: a unit closer is still the framing, and needs no climb)
    for (const [lim, dd] of [[up, dist], [up, dist - 1], [Math.tan(MAX_PITCH) * dist, dist]])
      for (const off of SWINGS) {
        const a = yaw + off, cx = B.x - Math.cos(a) * dd, cz = B.z - Math.sin(a) * dd;
        // a place off the board and its rim would be pulled in: not one to stand on
        if (cx < -1.5 || cz < -1.5 || cx > g.s.board.w + 1.5 || cz > g.s.board.h + 1.5) continue;
        const t = firstHit(B.x, B.z, cx, cz);
        if (t >= 1) return (pen = dist - dd), off;
        const need = (ground(B.x + (cx - B.x) * t, B.z + (cz - B.z) * t) + KERB + 0.35 - B.y) / Math.max(t, 0.05);
        if (need <= lim && t * dd >= 1) return (pen = dist - dd), off;
      }
    pen = 0;
    return 0;
  }
  // points along every closed tube that stands off the ground (a loop zone's
  // curve, not a thrown ball's arc), made once per hole
  const TUBE_CLEAR = 2.6; // the tube's 0.6 and the lens probe's 2
  let tubeFor = null, tubeList = [];
  function tubeBits() {
    const tubes = g.course && g.course.userData.tubes;
    if (tubeFor === g.course) return tubeList;
    tubeFor = g.course;
    tubeList = [];
    if (tubes) for (const [z, curve] of tubes) if (z.kind === "loop" && curve.getPointAt && !(curve.userData && curve.userData.arc) && /tube/.test(z.skin || "")) for (let k = 0; k <= 48; k++) tubeList.push(curve.getPointAt(k / 48));
    return tubeList;
  }
  function keepClear(C, B) {
    if (!g.s) return;
    const ox = B.x, oz = B.z;
    // lean away from a wall close beside the ball
    let nx = 0, nz = 0;
    for (const w of g.s.walls) {
      if (!wallOn(w)) continue;
      const { x: px, z: pz, d } = closest(ox, oz, w.a, w.b);
      if (d < 1.6 && d > 1e-3) (nx += ((ox - px) / d) * (1.6 - d)), (nz += ((oz - pz) / d) * (1.6 - d));
    }
    C.x += nx * 1.5;
    C.z += nz * 1.5;
    // a post (a bumper, a mushroom) is never right beside the lens: pushed out of its reach
    for (const p of g.s.posts || []) {
      const c = p.c;
      if (!c) continue;
      // a big one (a sandcastle) stands tall: a wider berth
      const r = (p.r || 0.5) + ((p.r || 0.5) >= 2 ? 2.6 : 1.6), dx = C.x - c[0], dz = C.z - c[1], d = Math.hypot(dx, dz);
      if (d < r && d > 1e-3) {
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
    // over the board (plus its rim): beyond it the scenery is higher than the
    // course's own ground, and a camera out there sits in the decor
    const W = g.s.board.w, H = g.s.board.h, RIM = 1.5;
    const cx = Math.max(-RIM, Math.min(W + RIM, C.x)), cz = Math.max(-RIM, Math.min(H + RIM, C.z));
    if (cx !== C.x || cz !== C.z) (C.x = cx), (C.z = cz), (C.y = Math.max(C.y, B.y + 2.5));
    const base = ground(C.x, C.z);
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
    C.y = Math.min(C.y, B.y + Math.tan(MAX_PITCH) * Math.max(flat, MIN_D));
    const d3 = Math.hypot(flat, C.y - B.y);
    if (d3 < MIN_D) C.y = Math.min(B.y + Math.tan(MAX_PITCH) * MIN_D, B.y + Math.sqrt(Math.max(0, MIN_D * MIN_D - flat * flat)));
  }


  return {
    /** Moves the camera one frame (dt seconds) towards its target pose. */
    update: updateCamera,
    /** The follow starts afresh (a new mode, a new round). */
    resetFollow,
    /** The next frame starts in the target pose, not eased into it (a new round). */
    jump: () => (sp.live = false),
    /** The mouse over the course (the whole-course view leans with it). */
    hover: onHover,
    yaw: () => yaw,
    settled: () => settled,
    // for the ?camlog probes
    occluded, marker, camLog, lensWho,
    inner: () => ({ swing: +swing.toFixed(2), pen, rise: +rise.toFixed(2), wide: +wide.toFixed(2), yaw: +yaw.toFixed(2) }),
  };
}
