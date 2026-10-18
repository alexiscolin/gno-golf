"use client";

// The board in 3D (the GUI spec's B3): the game's own buildHole on the hole
// as checked (the pipeline's HoleState of its canonical bytes: what will be
// published), seen through the board's lens by an orthographic camera
// (camera3d.ts), on the Builder's one canvas (stage.ts). It only shows: the
// overlay over it (Board's SVG) picks, edits and draws the selection, the
// handles and the ghost, in the same map. Drawn on demand: when the hole,
// the view or the look changes; while the pointer is about (awake), its
// timed pieces move on the game's clock and, with motion allowed, its water
// moves too; idle, the loop stops. The hole is built again only when the
// checked hole changes (a drop, an undo), never as the pointer moves.
// The same scene gives the player's view (PlayerView.tsx): the hole from the
// tee through the game's lens, drawn in a corner of the board's canvas and
// copied out, once a build (the edit settled) or when asked, never a frame.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { applyRig, makeScene, setLighting, teeRig } from "@/lib/scene/camera";
import { buildHole } from "@/lib/scene/course";
import { disposeCourse, motion, setTime } from "@/lib/scene/materials";
import { loadWorld } from "@/lib/scene/worlds";
import { MS_PER_STEP } from "@/lib/engine/replay";
import { hold, stageRenderer, stageUp } from "@/lib/builder/stage";
import { orthoFor } from "@/lib/builder/camera3d";
import type { Course, Hole } from "@/lib/scene/data";
import type { Look, View } from "@/lib/builder/view";
import { camlog } from "@/lib/testhooks";

declare global {
  interface Window {
    // ?camlog: how many times the board's hole was built (a test hook: the bench holds it to one a checked hole),
    // and the player's view painted (one a build)
    __builds?: number;
    __eyes?: number;
    // and the world whose scenery it was built with (the hole's own, or the garden it fell back to)
    __scenery?: string;
  }
}

/** What of a checked hole its 3D draws: all of it but the par (its name is drawn: it seeds the scenery). */
const drawnKey = (s: Hole) => JSON.stringify({ ...s, par: 0 });

/** The player's view's canvas (a 2D one: PlayerView.tsx), and paint(): it drawn now (set by the Scene, a no-op without one). */
export interface Eye {
  canvas: HTMLCanvasElement | null;
  paint: () => void;
}

/** How long after the pointer's last move the scene keeps moving (ms). */
export const IDLE_MS = 2000;

export default function Scene({ state, view, look, size, waker, eye, paused = false, keep = false }: {
  state: Hole | null;
  view: View;
  look: Look;
  size: { w: number; h: number };
  /** set to wake(): the pointer moved over the board, the scene moves for IDLE_MS after (no render of the board's for it) */
  waker: { current: (() => void) | null };
  /** the player's view, painted from this scene */
  eye?: Eye;
  /** the timed pieces held where they are (the inspector's pause) */
  paused?: boolean;
  /** kept moving, idle or not (a timed piece selected, playing) */
  keep?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const three = useRef<{ scene: THREE.Scene; cam: THREE.OrthographicCamera; course: Course | null; loop: number } | null>(null);
  const latest = useRef({ view, look, size, paused, keep }), held = useRef(0);
  // the hole drawn, as drawnKey has it: a check that changes nothing drawn (a slug, a proof carried, the par) builds nothing
  const built = useRef("");
  latest.current = { view, look, size, paused, keep };
  const lens = useRef<THREE.PerspectiveCamera>(null);

  /** One frame: the camera as the board looks, the timed pieces at the game's clock, drawn; none while the canvas is
   *  lent (Play: the game sizes and draws it). Whether it drew. */
  const draw = (now = performance.now()): boolean => {
    const t = three.current, r = stageRenderer();
    if (!t || !r || !latest.current.size.w || r.domElement.parentElement !== box.current) return false;
    const { view: v, look: l, size: s } = latest.current;
    r.setSize(s.w, s.h, false);
    orthoFor(t.cam, v, l, s);
    if (t.course) {
      if (motion) (setTime(now / 1000), t.course.userData.tick(now / 1000));
      // (the clock runs under reduced motion too, as the game's; paused, it holds)
      const step = latest.current.paused ? held.current : (held.current = Math.floor(now / MS_PER_STEP));
      for (const p of t.course.userData.timed) p.at(step);
    }
    r.render(t.scene, t.cam);
    return true;
  };

  /** The player's view in eye's canvas, at its own size: rendered in the board canvas's corner (the canvas grown for
   *  it if it is the larger: the view shown large), copied, then the board drawn again at its size, in one task (never
   *  seen); only while the board holds the canvas (Play has it else). Whether it painted (and drew the board). */
  const paint = (): boolean => {
    const t = three.current, r = stageRenderer(), el = eye?.canvas, s = latest.current.size;
    if (!t?.course || !r || !el || !stageUp() || r.domElement.parentElement !== box.current) return false;
    const w = el.clientWidth, h = el.clientHeight;
    if (!(w > 0 && h > 0)) return false;
    const cam = (lens.current ??= new THREE.PerspectiveCamera(30, 1, 3, 260)), view = { w, h, top: 0, bottom: 0, side: 0 };
    applyRig(cam, teeRig(t.course.userData.state, t.course.userData.height, view), view);
    r.setSize(Math.max(s.w, w), Math.max(s.h, h), false);
    r.setViewport(0, 0, w, h);
    r.setScissor(0, 0, w, h);
    r.setScissorTest(true);
    r.render(t.scene, cam);
    r.setScissorTest(false);
    const dpr = r.getPixelRatio(), pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (el.width !== pw || el.height !== ph) (el.width = pw), (el.height = ph);
    el.getContext("2d")?.drawImage(r.domElement, 0, r.domElement.height - ph, pw, ph, 0, 0, pw, ph);
    draw();
    if (camlog()) window.__eyes = (window.__eyes ?? 0) + 1;
    return true;
  };
  useEffect(() => {
    if (!eye) return;
    eye.paint = () => void paint();
    return () => void (eye.paint = () => {});
  }, [eye]); // eslint-disable-line react-hooks/exhaustive-deps -- (paint reads refs only)

  // the scene, on the Builder's canvas, while the board is up; given back after Play, it draws again
  useEffect(() => {
    const r = stageRenderer();
    if (!r) return;
    const scene = makeScene();
    three.current = { scene, cam: new THREE.OrthographicCamera(), course: null, loop: 0 };
    const give = hold(box.current!, () => {
      const c = r.domElement;
      c.removeAttribute("id"), c.removeAttribute("style"); // (the game's sizing and its #stage, gone with it)
      r.resetState();
      draw();
      if (latest.current.keep) waker.current?.(); // (a timed piece kept moving: its loop, stopped while lent, again)
    });
    return () => {
      const t = three.current;
      cancelAnimationFrame(t?.loop ?? 0);
      if (t?.course) disposeCourse(t.course);
      three.current = null;
      built.current = "";
      give();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- (waker: the Board's ref, read when the canvas comes back)

  // the hole built again as it is checked (its world's module first), when what it draws changed
  useEffect(() => {
    if (!state) return;
    const key = drawnKey(state);
    if (key === built.current) return;
    let stale = false;
    void loadWorld(state.world).then(() => {
      const t = three.current;
      if (stale || !t) return;
      const old = t.course;
      if (old) t.scene.remove(old);
      t.course = buildHole(state);
      built.current = key;
      if (camlog()) (window.__builds = (window.__builds ?? 0) + 1), (window.__scenery = t.course.userData.scenery);
      setLighting(t.scene as Parameters<typeof setLighting>[0], t.course.userData.time);
      t.scene.add(t.course);
      if (!paint()) draw(); // (painted: the board drawn with it)
      // the old hole freed once the new one is drawn: the shader programs they share are kept, not linked again
      if (old) disposeCourse(old);
    });
    return () => void (stale = true);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps -- (draw and paint read refs only)

  // the view, the look, the size: one frame (awake with motion, the loop's next one: one render a frame)
  useEffect(() => void (!(motion && three.current?.loop) && draw()), [view, look, size]);

  // awake: moving (its water with motion allowed, its timed pieces always), until IDLE_MS after the pointer's last move
  useEffect(() => {
    let last = 0, step = -1;
    const frame = (now: number) => {
      const t = three.current;
      if (!t) return;
      const s = Math.floor(now / MS_PER_STEP);
      // (the canvas lent: nothing to draw, the loop stops; its holder's back wakes it)
      if (stageRenderer()?.domElement.parentElement !== box.current) return void (t.loop = 0);
      if (motion || ((t.course?.userData.timed.length ?? 0) > 0 && s !== step)) (draw(now), (step = s));
      t.loop = now - last < IDLE_MS || latest.current.keep ? requestAnimationFrame(frame) : 0;
    };
    waker.current = () => {
      const t = three.current;
      last = performance.now();
      if (t && !t.loop) t.loop = requestAnimationFrame(frame);
    };
    return () => void (waker.current = null);
  }, [waker]);

  // kept moving: woken now (and on, while kept); paused or played: one frame
  useEffect(() => void (keep && waker.current?.()), [keep, waker]);
  useEffect(() => void draw(), [paused]);

  return <div className="board__scene" ref={box} aria-hidden="true" />;
}
