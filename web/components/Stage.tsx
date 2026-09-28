"use client";

import { useEffect, useRef } from "react";
import { makePreview } from "@/lib/scene";
import type { Skin } from "@/lib/scene/gnome";

/** A gnome turning on a stage of its own (the preview renderer): the ref of
 *  the box it is drawn in. The picker's tile, the cup's new-gnome card, the
 *  game's choice (ghost: a duel's ghost hops beside him). */
export function useGnomeStage<T extends HTMLElement = HTMLDivElement>(skin: Skin, { ghost = false } = {}) {
  const box = useRef<T>(null);
  const preview = useRef<ReturnType<typeof makePreview> | null>(null);
  useEffect(() => {
    // a canvas of its own each time: a WebGL context that was released cannot
    // be taken again from the same element (React mounts twice in dev)
    const el = document.createElement("canvas");
    // its size only: the locked look is the wrapper's filter, and a copied
    // "--locked" class stayed on this canvas for good (every gnome went dark)
    el.className = "pick__canvas";
    box.current!.appendChild(el);
    let p: ReturnType<typeof makePreview>;
    try { p = preview.current = makePreview(el, { ghost }); } catch { return () => el.remove(); } // no WebGL to spare: no stage, the screen stands
    const onResize = () => p.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      p.destroy();
      el.remove();
    };
  }, [ghost]);
  useEffect(() => {
    preview.current && preview.current.show(skin);
  }, [skin]);
  return box;
}
