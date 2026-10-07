// What the player sees of the ball and the cup past a tall thing beside the
// lane (the mountain's serac tower, its top leaning out over the path): seen
// from the camera a player plays with, the classic camera at rest on the
// ball (engine/camera.ts goal, camera.ts restRig: the default, where every
// shot is aimed from), framed as on a computer's window, with the ball
// anywhere on the lane (between shots, on the way to the cup) and at the
// cup. The Builder refuses a piece whose thing would stand in between (its
// census: hidden, "view"). (A phone held upright looks along the board from
// its left instead: the course's own seracs, mountain15, hide a ball beside
// their towers from it, so it is not held to it.)
import * as THREE from "three";
import { applyRig, restRig, type View } from "./camera";
import { BALL_R } from "../terrain";
import type { Terrain } from "../terrain";
import type { Hole } from "./data";

/** The play view: a computer's window, the free part the HUD leaves it (engine.ts HUD). */
const VIEWS: readonly View[] = [{ w: 1440, h: 900, top: 108, bottom: 136, side: 14 }];
/** How far apart the ball's spots are tried (board units). */
const STEP = 1;

/** Whether thing (in the course's frame) hides the ball, from its camera at rest on it, or the cup, anywhere on the lane. */
export function hidesPlay(thing: THREE.Object3D, s: Hole, t: Pick<Terrain, "onGreen" | "height">): boolean {
  if (!t.onGreen) return false;
  thing.updateWorldMatrix(true, true);
  const cam = new THREE.PerspectiveCamera(30, 1, 3, 260), ray = new THREE.Raycaster(), ball = new THREE.Vector3(), to = new THREE.Vector3();
  const cup = new THREE.Vector3(s.cup[0], t.height(s.cup[0], s.cup[1]) + 0.05, s.cup[1]);
  const seen = (p: THREE.Vector3) => {
    const d = to.copy(p).sub(cam.position).length();
    ray.set(cam.position, to.normalize());
    ray.far = d;
    return !ray.intersectObject(thing, true).length;
  };
  for (const view of VIEWS)
    for (let x = STEP / 2; x < s.board.w; x += STEP)
      for (let z = STEP / 2; z < s.board.h; z += STEP) {
        if (!t.onGreen(x, z)) continue;
        ball.set(x, t.height(x, z) + BALL_R, z);
        applyRig(cam, restRig(s, ball, view), view);
        if (!seen(ball) || !seen(cup)) return true;
      }
  return false;
}
