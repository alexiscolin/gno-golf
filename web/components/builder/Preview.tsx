"use client";

// The hole in 3D (the GUI spec's B2, top right): the game's own buildHole on
// the hole as a player's client gets it (HoleState of the canonical bytes,
// builder.wasm), framed from above as the overview frames it. What it shows
// is what will be published. Drawn again whenever the checked hole changes.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { applyRig, laneBox, makeRenderer, makeScene, overviewRig, setLighting } from "@/lib/scene/camera";
import { buildHole, finishHole } from "@/lib/scene/course";
import { disposeCourse } from "@/lib/scene/materials";
import { loadWorld } from "@/lib/scene/worlds";
import type { Hole } from "@/lib/scene/data";

export default function Preview({ state, fresh }: { state: Hole | null; fresh: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const three = useRef<{ renderer: THREE.WebGLRenderer; scene: ReturnType<typeof makeScene>; camera: THREE.PerspectiveCamera; course: THREE.Object3D | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      const renderer = makeRenderer(canvas.current!), scene = makeScene();
      setLighting(scene, "day");
      three.current = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 3, 260), course: null };
    } catch {
      setFailed(true); // no WebGL here: the board still says it all
    }
    return () => {
      const t = three.current;
      if (t?.course) disposeCourse(t.course);
      t?.renderer.dispose();
      three.current = null;
    };
  }, []);

  useEffect(() => {
    const t = three.current, el = canvas.current;
    if (!t || !el || !state) return;
    let stale = false;
    const draw = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      t.renderer.setSize(w, h, false);
      const view = { w, h, top: 8, bottom: 8, side: 8 };
      applyRig(t.camera, overviewRig(laneBox(state), view), view);
      t.renderer.render(t.scene, t.camera);
    };
    void loadWorld(state.world).then(() => {
      if (stale) return;
      if (t.course) (t.scene.remove(t.course), disposeCourse(t.course));
      const g = buildHole(state);
      finishHole(g);
      t.scene.add(g);
      t.course = g;
      draw();
    }, () => setFailed(true));
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ((stale = true), ro.disconnect());
  }, [state]);

  if (failed) return <p className="nothing preview">The 3D view can&apos;t run here; the board shows the hole as it is.</p>;
  return (
    <div className="preview" role="img" aria-label="The hole in 3D, as players will see it">
      <canvas ref={canvas} />
      <span className="pill">{state ? (fresh ? "3D · in sync" : "3D · catching up") : "3D · waiting for the checks"}</span>
    </div>
  );
}
