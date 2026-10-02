// The test hooks: what media/camera/*.mjs (and a dev ?won) read of a game.
// Attached to createGame()'s API only for a page opened with ?camlog (or
// with hooks); Golf.tsx puts that game on window.__g.
import * as THREE from "three";
import { onAt, closest } from "../terrain";
import { isDrawn } from "../scene/materials";
import { worldOf } from "../scene/worlds";
import { laneBox } from "../scene/camera";
import { ud, md, type TubePath } from "../scene/data";
import type { Extras, Vec2, Zone } from "../types";
import { simChecks, simMs, simReady } from "../sim";
import type { Live } from "./types";
import type { makeCamera } from "./camera";
import type { makeReplay } from "./replay";
import { clearance, draws, glows, lamps, moverClip, movers, renderQuality, rideClearance, surfaceAudit, trackOverHazard, whatAt } from "./audit";

/** What the probes reach beyond E: the camera and the replay, and a few of the engine's own. */
interface Inner {
  cam: ReturnType<typeof makeCamera>;
  rp: ReturnType<typeof makeReplay>;
  placeBall: () => void;
  fakeWeather: (w: string) => void;
  stroke: (ex: Extras) => void;
  aimDrawn: () => { n: number; at: number; angle: number; power: number };
}

const ndcTop = new THREE.Vector3(), ndcBot = new THREE.Vector3(), headAt = new THREE.Vector3();

/** E: the engine's live state; cam: its camera controller. */
export function probes(E: Live, { cam, rp, placeBall, fakeWeather, stroke, aimDrawn }: Inner) {
  const { g, camera, scene, ground, band, publish } = E;
  return {
    /** For screenshots only (?won): the win card as if the hole was just holed. */
    fakeWin(strokes = 2) {
      g.strokes = strokes;
      g.done = g.holed = true; // (not on the player's card: nobody played it)
      void publish();
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
      const B = E.ball.position, P = camera.position, out = { ball: B.toArray().map((v) => +v.toFixed(2)), groundAtBall: +ground(B.x, B.z).toFixed(2), cam: P.toArray().map((v) => +v.toFixed(2)), line: [] as [number, number][] };
      for (let k = 1; k < 8; k++) { const t = k / 8, x = B.x + (P.x - B.x) * t, z = B.z + (P.z - B.z) * t; out.line.push([+(B.y + 0.7 + (P.y - B.y - 0.7) * t).toFixed(2), +ground(x, z).toFixed(2)]); }
      return out;
    },
    /** ?camlog only: the meshes in view now, by their parent's name (what draws). */
    inView: () => {
      const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const out: Record<string, number> = {};
      scene.traverseVisible((o) => {
        if (!isDrawn(o)) return;
        if (o.frustumCulled !== false && o.geometry && !f.intersectsObject(o)) return;
        let k = o.name || "", p = o.parent;
        while (!k && p) (k = p.name || ud(p).kind || ""), (p = p.parent);
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const sphere = o.geometry.boundingSphere!;
        const c = sphere.center.clone().applyMatrix4(o.matrixWorld), r = sphere.radius * o.matrixWorld.getMaxScaleOnAxis();
        const pos = o.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
        k = `${o.type} r${Math.round(r)} d${Math.round(c.distanceTo(camera.position))} v${pos ? pos.count : 0}${o instanceof THREE.InstancedMesh ? " inst" + o.count : ""}`;
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
          const hit = rc.intersectObjects(scene.children, true).find((h) => {
            const o = h.object;
            if (!o.visible || o instanceof THREE.Sprite || o instanceof THREE.Points || o instanceof THREE.Line) return false;
            const m = isDrawn(o) && !Array.isArray(o.material) ? o.material : null;
            return !(m && m.transparent && m.opacity < 0.5);
          });
          if (hit && isDrawn(hit.object)) {
            near++;
            const geo = hit.object.geometry;
            if (!geo.boundingSphere) geo.computeBoundingSphere();
            const r = Math.round(geo.boundingSphere!.radius * hit.object.matrixWorld.getMaxScaleOnAxis());
            cam.lensWho[r] = (cam.lensWho[r] || 0) + 1;
          }
        }
      return near / 25;
    },
    /** ?camlog only: what stands between the camera and the gnome: five rays to points on him, each
     *  the first opaque drawn thing it meets before him (by its nearest named group), or "" if clear. */
    sightHits: (from?: number[]) => {
      const B = E.ball.position, P = from ? new THREE.Vector3().fromArray(from) : camera.position, rc = new THREE.Raycaster(), out: string[] = [];
      rc.camera = camera; // (sprites need it)
      const own = new Set<THREE.Object3D>();
      E.ball.traverse((o) => void own.add(o));
      for (const [dx, dy, dz] of [[0, 0.7, 0], [0, 0.3, 0], [0.35, 0.4, 0], [-0.35, 0.4, 0], [0, 1.1, 0]]) {
        const T = new THREE.Vector3(B.x + dx, B.y + dy, B.z + dz), d = T.clone().sub(P), L = d.length();
        rc.set(P, d.normalize());
        rc.far = L - 0.3;
        const hit = rc.intersectObjects(scene.children, true).find((h) => {
          const o = h.object, m = isDrawn(o) && !Array.isArray(o.material) ? o.material : null;
          if (!o.visible || own.has(o) || o instanceof THREE.Sprite || o instanceof THREE.Points || o instanceof THREE.Line || !m) return false;
          for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false;
          return !m.transparent && m.blending !== THREE.AdditiveBlending && !md(m).hull;
        });
        let k = "";
        for (let q: THREE.Object3D | null = hit ? hit.object : null; q && !k; q = q.parent) k = q.name || String(ud(q).kind || "");
        out.push(hit ? k || "?" : "");
      }
      return out;
    },
    /** ?camlog only: the radius of what the lens probe hit, counted. */
    lensWho: () => cam.lensWho,
    /** ?camlog only: the third-person heading now, in radians (what a pull starting now is measured from). */
    camYaw: () => cam.yaw(),
    gliding: () => cam.gliding(),
    laneAt: (x: number, z: number) => cam.laneAt(x, z),
    /** ?camlog only: the route (worlds.ts route) forced on or off for any world, or the world's own again (null). */
    routeForce: (on: boolean | null) => cam.forceRoute(on),
    /** ?camlog only: the route's distance to the cup from (x, z), or null. */
    routeAt: (x: number, z: number) => cam.routeAt(x, z),
    /** ?camlog only: a world's camSolids: the boxes' count, those near the ball, the ground under (x, z) as the camera has it. */
    solidsInfo: (x: number, z: number, r?: number) => cam.solidsInfo(x, z, r),
    /** ?camlog only: a stroke's own pieces (a chain Extras, its ahead too) as the camera and the weather read them, not drawn. */
    strokeState: (ex: Extras) => stroke(ex),
    /** Where the camera stands against the board: over the green, how far from the nearest rail, how high over the ground. */
    camBoard: () => {
      if (!g.course || !g.s) return null;
      const P = camera.position, t = g.course.userData.terrain;
      let gap = Infinity;
      for (const w of g.s.walls) if (onAt(w, Math.floor(E.clock))) gap = Math.min(gap, closest(P.x, P.z, w.a, w.b).d);
      return { green: t.onGreen(P.x, P.z), gap: +gap.toFixed(2), up: +(P.y - ground(P.x, P.z)).toFixed(2), x: +P.x.toFixed(2), z: +P.z.toFixed(2) };
    },
    /** The heading the aim points (radians, as camYaw). */
    aimAngle: () => E.shot.angle,
    /** The ball put at (x, z) at rest, the camera starting afresh there (the rest tests). */
    putBall(x: number, z: number) {
      g.ball = { x, y: z };
      placeBall();
      cam.resetFollow();
      cam.jump();
    },
    /** ?camlog only: the ball's height over the ground under it now, and whether it is flying. */
    groundAt: (x: number, z: number) => ground(x, z),
    /** A chain answer's path drawn as a shot would draw it (its air flags, its causes): the flight tests. */
    replayPath: (path: readonly Vec2[], air: string, cause: string, tick = 0) => ((g.flying = true), (g.tick0 = tick), rp.replay(path, false, air, cause).finally(() => (g.flying = false))),
    /** The ball over the ground, and the step of the replay (with the chain's air flags) it is on. */
    ballLift: () => ({ lift: +(E.ball.position.y - E.ground(E.ball.position.x, E.ball.position.z)).toFixed(3), y: +E.ball.position.y.toFixed(3), flying: !!g.flying, at: g.replaying ? g.replaying.at : -1, flags: g.replaying ? g.replaying.flags : null }),
    /** ?camlog only: the pull as it stands. */
    /** ?camlog only: the aim previews drawn so far and when the last was, and the page's own simulations' times (lib/sim), ms. */
    aimDrawn,
    aimShot: () => ({ angle: E.shot.angle, power: E.shot.power }),
    simMs: () => simMs.slice(),
    simChecks: () => ({ ...simChecks, on: simReady(g.id) }),
    pullState: () => ({ power: +E.shot.power.toFixed(2), deg: E.shot.deg, aiming: !!g.aiming, band: band.visible, flying: !!g.flying, strokes: g.strokes }),
    /** ?camlog only: the scene's objects: all, empty groups, drawables, matrices recomposed each frame. */
    census: () => {
      const w = g.weather;
      const c = { objects: 0, empty: 0, draws: 0, auto: 0, weather: w ? (Object.keys(w) as (keyof typeof w)[]).filter((k) => w[k]).join(",") : "" };
      scene.traverse((o) => {
        c.objects++;
        if (!o.children.length && (o.type === "Group" || o.type === "Object3D")) c.empty++;
        if (isDrawn(o)) c.draws++;
        if (o.matrixAutoUpdate) c.auto++;
      });
      return c;
    },
    /** ?camlog only: a fingerprint of the course as built (vertex sums, local and world), per top-level piece. */
    fingerprint: () => {
      const v = new THREE.Vector3(), out: (string | number)[][] = [];
      if (!g.course) return null;
      g.course.updateMatrixWorld(true);
      for (const top of g.course.children) {
        let n = 0, lx = 0, wx = 0, col = 0, tr = 0, inst = 0;
        top.traverse((o) => {
          if (!isDrawn(o)) return;
          const p = o.geometry.attributes.position as THREE.BufferAttribute | undefined;
          if (!p) return;
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i);
            lx += v.x + 3 * v.y + 7 * v.z;
            v.applyMatrix4(o.matrixWorld);
            wx += v.x + 3 * v.y + 7 * v.z;
          }
          n += p.count;
          for (const m of ([] as THREE.Material[]).concat(o.material)) {
            const color = (m as THREE.Material & { color?: THREE.Color }).color;
            (col += color ? (color.r + 2 * color.g + 4 * color.b) * p.count : 0), (tr += m.transparent ? 1 : 0);
          }
          if (o instanceof THREE.InstancedMesh) for (let i = 0; i < o.count * 16; i++) inst += o.instanceMatrix.array[i] * ((i % 7) + 1);
        });
        out.push([top.type + ":" + (top.name || ud(top).kind || ""), n, +lx.toFixed(1), +wx.toFixed(1), +col.toFixed(1), tr, +inst.toFixed(1)]);
      }
      return out;
    },
    /** ?camlog only: fake the weather now ("fog,storm"…, "" for the forecast's). */
    fakeWeather,
    /** ?camlog only: the timed pieces' clock (substeps). */
    clock: () => E.clock,
    /** ?camlog only: the last hole's [build, shader compile] time, ms. */
    buildMs: () => g.buildMs,
    /** ?camlog only: the camera held at a pose (a close-up), as a ride holds it; none: back to the mode's. */
    pose: (pos?: number[], look?: number[], fov?: number) => void (g.ride = pos && look ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov } : null),
    /** ?camlog only: the course's tubes: [skin, kind, length, ridden, one of the hole's own zones]. */
    tubes: () => [...((g.course && g.course.userData.tubes) || new Map<Zone, TubePath>())].map(([z, c]) => [z.skin, z.kind, +c.getLength().toFixed(1), !!(c.userData && c.userData.ride), !!g.s && g.s.zones.includes(z)]),
    /** ?camlog only: the timed pieces shown at tick t (the clock held there until it runs on). */
    // (and the live pieces' own animation run once at that clock: a held clock, frozen time, still shows them where it has them)
    showAt: (t: number) => {
      E.showAt(t);
      const now = performance.now() / 1000;
      // (a course without its live pieces' tick, as a test's, has nothing to run)
      if (g.course) for (const o of [g.course, ...g.course.children]) ud(o).tick?.(now);
    },
    /** ?camlog only: the ball as drawn: where, whether seen, riding a tube, its scale. */
    /** What a ball falling off the lane at (x, z) lands in, as the world draws it there (worlds.ts pit). */
    pit: (x: number, z: number) => (g.s ? worldOf(g.s).pit?.(g.s, x, z) ?? null : null),
    /** The gnome's pose: its body's up and its roll axis (its local x) in the world, the whole ball's own rotation, the last fall's ending. */
    gnome: () => {
      const body = E.ball.userData.body, q = body.getWorldQuaternion(new THREE.Quaternion());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q), f = rp.fell();
      return { up: up.toArray().map((v) => +v.toFixed(3)), axis: ax.toArray().map((v) => +v.toFixed(3)), rot: [E.ball.rotation.x, E.ball.rotation.y, E.ball.rotation.z].map((v) => +v.toFixed(3)), fell: f && { skin: f.skin, end: f.end, ago: Math.round(performance.now() - f.at) } };
    },
    ballAt: () => ({ p: E.ball.position.toArray().map((v) => +v.toFixed(3)), visible: E.ball.visible, tube: !!g.inTube, scale: +E.ball.scale.x.toFixed(2), seen: !cam.occluded(camera.position, headAt.copy(E.ball.position).setY(E.ball.position.y + 0.7)) }),
    /** ?camlog only: the render against the physics over a grid (audit.ts). */
    surfaceAudit: (step?: number) => surfaceAudit(E, step),
    /** ?camlog only: what a ray straight down at (x, z) meets in the course (audit.ts). */
    whatAt: (x: number, z: number) => whatAt(E, x, z),
    // the glows against the solids (media/rides/glow.mjs), the movers frame by frame (movers.mjs), the rails' clearance (clear.mjs)
    glows: () => glows(E),
    lamps: (lantern: number) => lamps(E, lantern),
    movers: () => movers(E),
    clearance: () => clearance(E),
    rideClearance: () => rideClearance(E),
    draws: (who?: string) => draws(E, who),
    renderQuality: () => renderQuality(E),
    moverClip: (sweep?: boolean) => moverClip(E, 0.06, sweep),
    trackOverHazard: () => trackOverHazard(E),
    /** ?camlog only: what the GPU holds: geometries, textures, shader programs. */
    gpu: () => { const i = E.info!(); return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0 }; },
    /** ?camlog only: where the camera is now. */
    camPose: () => camera.position.toArray(),
    /** The Far rig: the orbit share it has room for, its pitch blend, its distance. */
    farOrbit: () => g.far && { orbit: +g.far.orbit.toFixed(2), tilt: g.far.tilt, dist: +g.far.dist.toFixed(1) },
    // the Far view's lane box (laneBox, as the engine frames it): its corners on screen, as the camera is now: [x0, y0, x1, y1] in CSS px
    boardFrame: () => {
      if (!g.s) return null;
      const b = g.s.board, box = laneBox(g.s, E.ground), r = [1e9, 1e9, -1e9, -1e9], q = new THREE.Vector3();
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        q.set(x, y, z).project(camera);
        const px = ((q.x + 1) / 2) * innerWidth, py = ((1 - q.y) / 2) * innerHeight;
        r[0] = Math.min(r[0], px); r[1] = Math.min(r[1], py); r[2] = Math.max(r[2], px); r[3] = Math.max(r[3], py);
      }
      const d = camera.getWorldDirection(q);
      return { r: r.map(Math.round), w: innerWidth, h: innerHeight, pitch: Math.round((Math.asin(-d.y) * 180) / Math.PI), view: g.view, cam: g.cam, board: [b.w, b.h], box: [box.min.toArray(), box.max.toArray()].map((v) => v.map((n) => +n.toFixed(2))) };
    },
  };
}
