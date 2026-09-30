// The title's and the cup cards' stills and clips, rendered from the live
// scene (title.ts): dev only, for media/camera/titlebake.mjs and
// media/promo/render.mjs --cups. Title.tsx loads it on a dev page with
// ?titlebake, which puts both on window; production builds never load it.
import * as THREE from "three";
import { makeTitle, golden, holeOf, cupCam, CUP, RIDE_AT, RIDE_S, type CupFrame } from "./title";
import { makeRenderer, makeScene } from "./camera";
import { smoothstep } from "../terrain";
import { TICKS_PER_S } from "../engine/types";
import { disposeCourse, setTime } from "./materials";
import type { Hole } from "./data";

/**
 * A still of the title or of a cup card's diorama, as a PNG data URL on a
 * clear background (the page paints the sky): what the Low tier, no WebGL
 * and reduced motion show. hole: a cup card's own (cups.json's first, the
 * chain's), else the title's. Dev only: media/camera/titlebake.mjs calls it.
 */
export async function titleStill(kind: string, world: string, w: number, h: number, hole?: Hole | null) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px`;
  document.body.appendChild(canvas);
  try {
    if (kind === "title") {
      const t = await makeTitle(canvas, { world, still: true, at: RIDE_AT + RIDE_S * 0.55 }); // the ride half way up the lane
      const url = canvas.toDataURL("image/png"); // right after its first frame
      t!.destroy();
      return url;
    }
    const renderer = makeRenderer(canvas);
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    const scene = makeScene();
    golden(scene, world);
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.5, 600);
    const { s, course } = await holeOf(world, hole || undefined);
    scene.add(course);
    setTime(3);
    course.userData.tick(3);
    if (course.userData.mill && course.userData.mill.at) course.userData.mill.at(6);
    for (const p of course.userData.timed || []) p.at(6);
    cupCam(camera, s.board, CUP[world] || CUP.garden, (CUP[world] || CUP.garden).a, { r: 1, h: 1 }, course.userData.height);
    renderer.render(scene, camera);
    const url = canvas.toDataURL("image/png");
    disposeCourse(scene);
    renderer.dispose();
    renderer.forceContextLoss();
    return url;
  } finally {
    canvas.remove();
  }
}

// the cup cards' skies behind their dioramas: title.css's .world__art, stop for stop
const TILE_SKY: Record<string, [number, string][]> = {
  garden: [[0, "#7ec8ff"], [1, "#ffd6a8"]],
  island: [[0, "#54b8f5"], [0.7, "#b8ecff"], [1, "#ffe2a8"]],
  town: [[0, "#6b4bc8"], [0.6, "#ff8fb0"], [1, "#ffcf8a"]],
  mountain: [[0, "#4d74e0"], [0.65, "#bcd2ff"], [1, "#ffe0c0"]],
  mines: [[0, "#34266e"], [0.65, "#7a64c4"], [1, "#f0a07a"]],
};

/** The WebGL canvas drawn on a card's sky, as a data URL. */
function onSky(canvas: HTMLCanvasElement, world: string, type: string, q?: number) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const x = out.getContext("2d")!, sky = x.createLinearGradient(0, 0, 0, out.height);
  for (const [at, c] of TILE_SKY[world] || TILE_SKY.garden) sky.addColorStop(at, c);
  x.fillStyle = sky;
  x.fillRect(0, 0, out.width, out.height);
  x.drawImage(canvas, 0, 0);
  return out.toDataURL(type, q);
}

/** One hole of a cup card's hover clip: the orbit starts at a (radians round
 *  the board), r and h (times the ring's own), and in its length turns by
 *  turn, closes in by adv and comes down by drop (fractions), eased at both
 *  ends so the clips cross-fade on a calm frame. still: the card's own view
 *  and moment, so the clip's first frame is its still. A big board's shot
 *  (at, d, el: CupFrame) circles its point of interest instead. */
interface CupShot extends CupFrame { turn: number; adv: number; drop: number; still?: boolean }

/**
 * A cup card's clip, a frame at a time: clip(world, hole, w, h, shot) ->
 * { frame(k, t) (JPEG data URL at k of the move, 0..1, t s in), destroy() },
 * each frame on the card's own sky. Dev only: media/promo/render.mjs --cups.
 */
export async function cupClip(world: string, hole: Hole | null, w: number, h: number, shot: CupShot) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px`;
  document.body.appendChild(canvas);
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  const scene = makeScene();
  golden(scene, world);
  const { s, course } = await holeOf(world, hole || undefined);
  scene.add(course);
  const camera = new THREE.PerspectiveCamera(34, w / h, 0.5, 600);
  const c0: CupShot = shot.still ? { ...shot, ...(CUP[world] || CUP.garden) } : shot;
  return {
    frame(k: number, t: number) {
      // the still's moment (3 s in, the timed pieces at 6 ticks), running on
      setTime(3 + t);
      course.userData.tick(3 + t);
      if (course.userData.mill && course.userData.mill.at) course.userData.mill.at(6 + t * TICKS_PER_S);
      for (const p of course.userData.timed || []) p.at(6 + t * TICKS_PER_S);
      const e = smoothstep(k);
      cupCam(camera, s.board, c0, c0.a + shot.turn * e, { r: 1 - shot.adv * e, h: 1 - shot.drop * e }, course.userData.height);
      renderer.render(scene, camera);
      return onSky(canvas, world, "image/jpeg", 0.95);
    },
    destroy() {
      disposeCourse(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

declare global {
  interface Window { __titleStill?: typeof titleStill; __cupClip?: typeof cupClip }
}
window.__titleStill = titleStill;
window.__cupClip = cupClip;
