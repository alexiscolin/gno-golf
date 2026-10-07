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
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { makeScene, setLighting } from "@/lib/scene/camera";
import { buildHole } from "@/lib/scene/course";
import { disposeCourse, motion, setTime } from "@/lib/scene/materials";
import { loadWorld } from "@/lib/scene/worlds";
import { MS_PER_STEP } from "@/lib/engine/replay";
import { hold, stageRenderer } from "@/lib/builder/stage";
import { orthoFor } from "@/lib/builder/camera3d";
import type { Course, Hole } from "@/lib/scene/data";
import type { Look, View } from "@/lib/builder/view";
import { camlog } from "@/lib/testhooks";

declare global {
  interface Window {
    // ?camlog: how many times the board's hole was built (a test hook: the bench holds it to one a checked hole)
    __builds?: number;
  }
}

/** What of a checked hole its 3D draws: all of it but the par (its name is drawn: it seeds the scenery). */
const drawnKey = (s: Hole) => JSON.stringify({ ...s, par: 0 });

/** How long after the pointer's last move the scene keeps moving (ms). */
export const IDLE_MS = 2000;

export default function Scene({ state, view, look, size, waker, paused = false, keep = false }: {
  state: Hole | null;
  view: View;
  look: Look;
  size: { w: number; h: number };
  /** set to wake(): the pointer moved over the board, the scene moves for IDLE_MS after (no render of the board's for it) */
  waker: { current: (() => void) | null };
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

  /** One frame: the camera as the board looks, the timed pieces at the game's clock, drawn. */
  const draw = (now = performance.now()) => {
    const t = three.current, r = stageRenderer();
    if (!t || !r || !latest.current.size.w) return;
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
  };

  // the scene, on the Builder's canvas, while the board is up; given back after a quick test, it draws again
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
    });
    return () => {
      const t = three.current;
      cancelAnimationFrame(t?.loop ?? 0);
      if (t?.course) disposeCourse(t.course);
      three.current = null;
      built.current = "";
      give();
    };
  }, []);

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
      if (camlog()) window.__builds = (window.__builds ?? 0) + 1;
      setLighting(t.scene as Parameters<typeof setLighting>[0], t.course.userData.time);
      t.scene.add(t.course);
      draw();
      // the old hole freed once the new one is drawn: the shader programs they share are kept, not linked again
      if (old) disposeCourse(old);
    });
    return () => void (stale = true);
  }, [state]);

  // the view, the look, the size: one frame
  useEffect(() => draw(), [view, look, size]);

  // awake: moving (its water with motion allowed, its timed pieces always), until IDLE_MS after the pointer's last move
  useEffect(() => {
    let last = 0, step = -1;
    const frame = (now: number) => {
      const t = three.current;
      if (!t) return;
      const s = Math.floor(now / MS_PER_STEP);
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
  useEffect(() => draw(), [paused]);

  return <div className="board__scene" ref={box} aria-hidden="true" />;
}
