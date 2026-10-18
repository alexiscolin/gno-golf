"use client";

// The player's view, a small picture on top of the right side, still (the piece's settings scroll under it): the
// hole from its tee through the game's own lens, as a round opens on it.
// Painted from the board's own scene (Scene.tsx paint: no second build, no
// second context), once an edit has settled and the hole is built, never a
// frame. A click on it or P shows it large, in the game's sheet (its dim, its
// X, Escape, the focus on the sheet and back to what opened it).
import { useEffect, useRef } from "react";
import type { Eye } from "./Scene";
import { Sheet } from "@/components/ui";

export default function PlayerView({ eye, large, onLarge }: { eye: Eye; large: boolean; onLarge: (on: boolean) => void }) {
  const small = useRef<HTMLCanvasElement>(null), big = useRef<HTMLCanvasElement>(null);

  // the canvas painted: the large one while it is open, else the small one; painted as it comes and when resized
  useEffect(() => {
    const el = (large ? big : small).current;
    if (!el) return;
    eye.canvas = el;
    const ro = new ResizeObserver(() => eye.paint());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (eye.canvas === el) eye.canvas = null;
    };
  }, [eye, large]);

  return (
    <section className="pview" aria-labelledby="pview-head">
      <h2 className="col__head" id="pview-head">What the player sees</h2>
      <button type="button" className="preview pview__pic" onClick={() => onLarge(true)} title="The hole from the tee, as a player sees it (P: large)" aria-label="The hole from the tee, as a player sees it: show it large (P)">
        <canvas ref={small} />
      </button>
      <p className="pview__say">The hole from its tee, as a round opens on it. Click it or press <kbd>P</kbd> to see it large.</p>
      {large && (
        <Sheet label="The player's view" className="pview__big" onClose={() => onLarge(false)}>
          <h2>What the player sees</h2>
          <canvas ref={big} />
        </Sheet>
      )}
    </section>
  );
}
