"use client";

// The player's view, a small picture on top of the right side, still (the piece's settings scroll under it): the
// hole from its tee through the game's own lens, as a round opens on it.
// Painted from the board's own scene (Scene.tsx paint: no second build, no
// second context), once an edit has settled and the hole is built, never a
// frame. A click on it or P shows it large; Escape, Close or a click outside
// puts it back.
import { useEffect, useRef } from "react";
import type { Eye } from "./Scene";
import { Button } from "@/components/ui";

export default function PlayerView({ eye, large, onLarge }: { eye: Eye; large: boolean; onLarge: (on: boolean) => void }) {
  const small = useRef<HTMLCanvasElement>(null), big = useRef<HTMLCanvasElement>(null), dialog = useRef<HTMLDialogElement>(null);

  // the canvas painted: the large one while it is open, else the small one; painted as it comes and when resized
  useEffect(() => {
    const el = (large ? big : small).current;
    if (!el) return;
    eye.canvas = el;
    if (large && !dialog.current?.open) dialog.current?.showModal();
    const ro = new ResizeObserver(() => eye.paint());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (eye.canvas === el) eye.canvas = null;
    };
  }, [eye, large]);

  return (
    <section className="pview" aria-labelledby="pview-head">
      <h3 id="pview-head">What the player sees</h3>
      <button type="button" className="preview pview__pic" onClick={() => onLarge(true)} title="The hole from the tee, as a player sees it (P: large)" aria-label="The hole from the tee, as a player sees it: show it large (P)">
        <canvas ref={small} />
      </button>
      <p className="pview__say">The hole from its tee, as a round opens on it. Click it or press <kbd>P</kbd> to see it large.</p>
      <dialog ref={dialog} className="pview__big" aria-label="The player's view" onClose={() => onLarge(false)} onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
        <canvas ref={big} />
        <form method="dialog"><Button type="submit" keycap="Esc">Close</Button></form>
      </dialog>
    </section>
  );
}
