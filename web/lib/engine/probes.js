// The test hooks: what the camera test scripts (and a dev ?won) read of a game.
// Attached to createGame()'s API only for a page opened with ?camlog (or
// with hooks); Golf.jsx puts that game on window.__g.
import * as THREE from "three";
import { onAt, closest } from "../terrain.js";

const ndcTop = new THREE.Vector3(), ndcBot = new THREE.Vector3(), headAt = new THREE.Vector3();

/** E: the engine's live state (engine.js); cam: its camera controller. */
export function probes(E, { cam, rp, placeBall, onHoled, fakeWeather }) {
  const { g, camera, scene, ground, band, publish } = E;
  return {
    /** For screenshots only (?won): the win card as if the hole was just holed. */
    fakeWin(strokes = 2) {
      g.strokes = strokes;
      g.done = g.holed = true;
      onHoled({ id: g.id, strokes });
      publish();
    },
    /** ?camlog only: [yaw°, distance to the ball, widening] per frame. */
    camLog: () => cam.camLog.splice(0),
    /** ?camlog only: the ball and a point 3 units along the aim, on screen (y up), and the gnome's visibility. */
    camAim: () => {
      const B = E.ball.position, p = ndcTop.set(B.x + Math.cos(E.shot.angle) * 3, B.y, B.z + Math.sin(E.shot.angle) * 3).project(camera);
      const px = p.x, py = p.y, q = ndcBot.copy(B).project(camera);
      return { ball: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(3)], ahead: [+px.toFixed(2), +py.toFixed(2)], seen: !cam.occluded(camera.position, headAt.copy(B).setY(B.y + 0.7)) }; // the same test the camera uses
    },
    /** ?camlog only: the ground along the camera→head line. */
    sightProbe: () => {
      const B = E.ball.position, P = camera.position, out = { ball: B.toArray().map((v) => +v.toFixed(2)), groundAtBall: +ground(B.x, B.z).toFixed(2), cam: P.toArray().map((v) => +v.toFixed(2)), line: [] };
      for (let k = 1; k < 8; k++) { const t = k / 8, x = B.x + (P.x - B.x) * t, z = B.z + (P.z - B.z) * t; out.line.push([+(B.y + 0.7 + (P.y - B.y - 0.7) * t).toFixed(2), +ground(x, z).toFixed(2)]); }
      return out;
    },
    /** ?camlog only: the meshes in view now, by their parent's name (what draws). */
    inView: () => {
      const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const out = {};
      scene.traverseVisible((o) => {
        if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
        if (o.frustumCulled !== false && o.geometry && !f.intersectsObject(o)) return;
        let k = o.name || "", p = o.parent;
        while (!k && p) (k = p.name || (p.userData && p.userData.kind) || ""), (p = p.parent);
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
        k = `${o.type} r${Math.round(r)} d${Math.round(c.distanceTo(camera.position))} v${o.geometry.attributes.position ? o.geometry.attributes.position.count : 0}${o.isInstancedMesh ? " inst" + o.count : ""}`;
        out[k] = (out[k] || 0) + 1;
      });
      return out;
    },
    /** ?camlog only: which way the camera looks across the board (radians). */
    camHeading: () => { const d = camera.getWorldDirection(ndcTop); return Math.atan2(d.z, d.x); },
    /** ?camlog only: the follow's inner state. */
    camInner: cam.inner,
    /** ?camlog only: how much of the view is right in front of the lens — the share of a 5×5 grid of rays that hit the scene nearer than 2. */
    lensFill: () => {
      const rc = new THREE.Raycaster(), v = new THREE.Vector2();
      rc.camera = camera;
      rc.far = 2;
      let near = 0;
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) {
          rc.setFromCamera(v.set(-0.8 + i * 0.4, -0.8 + j * 0.4), camera);
          // (lines are picked up a whole unit wide: bunting wires, not a wall in the face)
          const hit = rc.intersectObjects(scene.children, true).find((h) => h.object.visible && !h.object.isSprite && !h.object.isPoints && !h.object.isLine && h.object !== cam.marker && !(h.object.material && h.object.material.transparent && h.object.material.opacity < 0.5));
          if (hit) {
            near++;
            if (!hit.object.geometry.boundingSphere) hit.object.geometry.computeBoundingSphere();
            const r = Math.round(hit.object.geometry.boundingSphere.radius * hit.object.matrixWorld.getMaxScaleOnAxis());
            cam.lensWho[r] = (cam.lensWho[r] || 0) + 1;
          }
        }
      return near / 25;
    },
    /** ?camlog only: the radius of what the lens probe hit, counted. */
    lensWho: () => cam.lensWho,
    /** ?camlog only: the third-person heading now, in radians (what a pull starting now is measured from). */
    camYaw: () => cam.yaw(),
    gliding: () => cam.gliding(),
    laneAt: (x, z) => cam.laneAt(x, z),
    /** Where the camera stands against the board: over the green, how far from the nearest rail, how high over the ground. */
    camBoard: () => {
      const P = camera.position, t = g.course.userData.terrain;
      let gap = Infinity;
      for (const w of g.s.walls) if (onAt(w, Math.floor(E.clock))) gap = Math.min(gap, closest(P.x, P.z, w.a, w.b).d);
      return { green: t.onGreen(P.x, P.z), gap: +gap.toFixed(2), up: +(P.y - ground(P.x, P.z)).toFixed(2), x: +P.x.toFixed(2), z: +P.z.toFixed(2) };
    },
    /** The heading the aim points (radians, as camYaw). */
    aimAngle: () => E.shot.angle,
    /** The ball put at (x, z) at rest, the camera starting afresh there (the rest tests). */
    putBall(x, z) {
      g.ball = { x, y: z };
      placeBall();
      cam.resetFollow();
      cam.jump();
    },
    /** ?camlog only: the ball's height over the ground under it now, and whether it is flying. */
    groundAt: (x, z) => ground(x, z),
    /** A chain answer's path drawn as a shot would draw it (its air flags, its causes): the flight tests. */
    replayPath: (path, air, cause) => ((g.flying = true), rp.replay(path, false, air, cause).finally(() => (g.flying = false))),
    /** The ball over the ground, and the step of the replay (with the chain's air flags) it is on. */
    ballLift: () => ({ lift: +(E.ball.position.y - E.ground(E.ball.position.x, E.ball.position.z)).toFixed(3), y: +E.ball.position.y.toFixed(3), flying: !!g.flying, at: g.replaying ? g.replaying.at : -1, flags: g.replaying ? g.replaying.flags : null }),
    /** ?camlog only: the pull as it stands. */
    pullState: () => ({ power: +E.shot.power.toFixed(2), deg: E.shot.deg, aiming: !!g.aiming, band: band.visible, flying: !!g.flying, strokes: g.strokes }),
    /** ?camlog only: the scene's objects: all, empty groups, drawables, matrices recomposed each frame. */
    census: () => {
      const c = { objects: 0, empty: 0, draws: 0, auto: 0, weather: g.weather ? Object.keys(g.weather).filter((k) => g.weather[k]).join(",") : "" };
      scene.traverse((o) => {
        c.objects++;
        if (!o.children.length && (o.type === "Group" || o.type === "Object3D")) c.empty++;
        if (o.isMesh || o.isLine || o.isPoints || o.isSprite) c.draws++;
        if (o.matrixAutoUpdate) c.auto++;
      });
      return c;
    },
    /** ?camlog only: a fingerprint of the course as built (vertex sums, local and world), per top-level piece. */
    fingerprint: () => {
      const v = new THREE.Vector3(), out = [];
      if (!g.course) return null;
      g.course.updateMatrixWorld(true);
      for (const top of g.course.children) {
        let n = 0, lx = 0, wx = 0, col = 0, tr = 0, inst = 0;
        top.traverse((o) => {
          const p = o.geometry && o.geometry.attributes.position;
          if (!p) return;
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i);
            lx += v.x + 3 * v.y + 7 * v.z;
            v.applyMatrix4(o.matrixWorld);
            wx += v.x + 3 * v.y + 7 * v.z;
          }
          n += p.count;
          for (const m of [].concat(o.material || [])) (col += m.color ? (m.color.r + 2 * m.color.g + 4 * m.color.b) * p.count : 0), (tr += m.transparent ? 1 : 0);
          if (o.isInstancedMesh) for (let i = 0; i < o.count * 16; i++) inst += o.instanceMatrix.array[i] * ((i % 7) + 1);
        });
        out.push([top.type + ":" + (top.name || top.userData.kind || ""), n, +lx.toFixed(1), +wx.toFixed(1), +col.toFixed(1), tr, +inst.toFixed(1)]);
      }
      return out;
    },
    /** ?camlog only: fake the weather now ("fog,storm"…, "" for the forecast's). */
    fakeWeather,
    /** ?camlog only: the timed pieces' clock (substeps). */
    clock: () => E.clock,
    /** ?camlog only: the last hole's [build, shader compile] time, ms. */
    buildMs: () => g.buildMs,
    /** ?camlog only: where the camera is now. */
    camPose: () => camera.position.toArray(),
    /** The Far rig: the orbit share it has room for, its pitch blend, its distance. */
    farOrbit: () => g.far && { orbit: +g.far.orbit.toFixed(2), tilt: g.far.tilt, dist: +g.far.dist.toFixed(1) },
    // the course box's corners on screen, as the camera is now: [x0, y0, x1, y1] in CSS px
    boardFrame: () => {
      const b = g.s.board, r = [1e9, 1e9, -1e9, -1e9], q = new THREE.Vector3();
      for (const x of [-1.5, b.w + 1.5]) for (const y of [-1, 1.5]) for (const z of [-1.5, b.h + 1.5]) {
        q.set(x, y, z).project(camera);
        const px = ((q.x + 1) / 2) * innerWidth, py = ((1 - q.y) / 2) * innerHeight;
        r[0] = Math.min(r[0], px); r[1] = Math.min(r[1], py); r[2] = Math.max(r[2], px); r[3] = Math.max(r[3], py);
      }
      const d = camera.getWorldDirection(q);
      return { r: r.map(Math.round), w: innerWidth, h: innerHeight, pitch: Math.round((Math.asin(-d.y) * 180) / Math.PI), view: g.view, cam: g.cam, board: [b.w, b.h] };
    },
  };
}
