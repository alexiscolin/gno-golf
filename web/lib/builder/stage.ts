// The Builder's one canvas and its one WebGL context, for as long as the page
// lives (as the game's own stage does): the 3D board draws on it, and Test
// (Play) is lent it, so no visit makes a context of its
// own (a browser holds about sixteen). Whoever holds it last has it; let
// go, it goes back to the one before (the board under Play), told
// so it can draw again. The board's renderer is made once on it; none if
// this browser has no WebGL (the board is then drawn in 2D). Its context
// lost (a GPU reset, a driver update), the board is drawn in 2D until the
// browser gives it back; then whoever holds the canvas is told, to draw again.
import type * as THREE from "three";
import { makeRenderer } from "../scene/camera";

let canvas: HTMLCanvasElement | null = null, renderer: THREE.WebGLRenderer | null | undefined, lost = false;
const holders: { el: HTMLElement; back: () => void }[] = [];
const told = new Set<() => void>();
const tell = (now: boolean) => {
  lost = now;
  for (const f of told) f();
  if (!now) holders.at(-1)?.back();
};

/** The canvas (made once). */
export const stageCanvas = () => (canvas ??= document.createElement("canvas"));

/** The board's renderer on it (made once), or null without WebGL. */
export function stageRenderer(): THREE.WebGLRenderer | null {
  if (renderer === undefined) {
    try {
      renderer = makeRenderer(stageCanvas());
      // (three asks the browser for the context back, and sets itself up again on it)
      stageCanvas().addEventListener("webglcontextlost", () => tell(true));
      stageCanvas().addEventListener("webglcontextrestored", () => tell(false));
    } catch {
      renderer = null;
    }
  }
  return renderer;
}

/** Whether the board can be drawn in 3D now: a renderer, its context not lost. */
export const stageUp = () => !!stageRenderer() && !lost;

/** f told when the context is lost or back (for useSyncExternalStore); returns the unsubscribe. */
export function onStage(f: () => void): () => void {
  told.add(f);
  return () => void told.delete(f);
}

/** The canvas put in el (first in it) until the returned function lets it go; back: told when it comes back to el from a later holder. */
export function hold(el: HTMLElement, back: () => void = () => {}): () => void {
  const h = { el, back }, c = stageCanvas();
  holders.push(h);
  el.prepend(c);
  return () => {
    const i = holders.indexOf(h);
    if (i < 0) return;
    holders.splice(i, 1);
    if (i < holders.length) return; // (not the one holding it now)
    const next = holders.at(-1);
    if (next) (next.el.prepend(c), next.back());
    else c.remove();
  };
}
