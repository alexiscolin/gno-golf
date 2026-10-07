// The palette's pictures (media/builder/tiles.mjs bundles this for headless
// Chrome; the site never loads it): one piece on a lane of its world, drawn
// by the game's own buildHole, by day, from one fixed three-quarter view
// framed on the piece, as a small WebP. One renderer for them all.
import * as THREE from "three";
import { buildHole } from "./course";
import { loadWorld } from "./worlds";
import { makeRenderer, makeScene, setLighting } from "./camera";
import { disposeCourse, setTime } from "./materials";
import type { Course, Hole } from "./data";

/** Where the camera looks from: the lane's front right, above, the same for every piece (y up). */
const FROM = new THREE.Vector3(0.5, 0.82, 0.86).normalize();
const FOV = 30;

/** A showcase on a canvas of its own, drawn at size px square: shot(…) a picture a call; dispose() once done. */
export function makePieceShowcase(size = 384) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const scene = makeScene();
  setLighting(scene, "day");
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  const out = document.createElement("canvas");
  let course: Course | null = null;

  return {
    /**
     * The hole s drawn, looked at lift above the ground at mid (the board's x
     * and y) from FROM (or from, a hill's: more from the side) so that a piece
     * span across fills the picture; scaled to px square, a WebP data URL.
     */
    async shot(s: Hole, mid: readonly [number, number], span: number, lift: number, px: number, quality: number, from?: readonly [number, number, number]) {
      await loadWorld(s.world);
      if (course) (scene.remove(course), disposeCourse(course));
      course = buildHole(s);
      scene.add(course);
      setTime(2);
      course.userData.tick?.(2);
      for (const p of course.userData.timed ?? []) p.at(5); // (a timed piece: there, at its fifth substep)
      const ground = course.userData.height(mid[0], mid[1]);
      const target = new THREE.Vector3(mid[0], ground + lift, mid[1]);
      const dist = (span * 0.6 + 0.8) / Math.tan(((FOV / 2) * Math.PI) / 180);
      camera.position.copy(target).addScaledVector(from ? new THREE.Vector3(...from).normalize() : FROM, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera); // (read in the same task: the drawing buffer is not kept)
      out.width = out.height = px;
      const x = out.getContext("2d")!;
      x.imageSmoothingQuality = "high";
      x.drawImage(canvas, 0, 0, px, px);
      return out.toDataURL("image/webp", quality);
    },
    /** Lets the showcase go: what it drew, its renderer, its WebGL context. */
    dispose() {
      if (course) (scene.remove(course), disposeCourse(course));
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
