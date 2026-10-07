"use client";

// The player's view, beside the board under the inspector: the hole from its
// tee through the game's own lens, as a round opens on it. Painted from the
// board's own scene (Scene.tsx paint: no second build, no second context),
// once an edit has settled and the hole is built, never a frame. A click
// shows it large; Escape, Close or a click outside puts it back.
import { useEffect, useRef, useState } from "react";
import type { Eye } from "./Scene";

export default function PlayerView({ eye }: { eye: Eye }) {
  const small = useRef<HTMLCanvasElement>(null), big = useRef<HTMLCanvasElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [large, setLarge] = useState(false);

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
    <section className="pview" aria-label="The player's view">
      <h3>Player&apos;s view</h3>
      <button type="button" className="preview pview__pic" onClick={() => setLarge(true)} aria-label="The hole from the tee, as a player sees it: show it large">
        <canvas ref={small} />
        <span className="pill">From the tee</span>
      </button>
      <dialog ref={dialog} className="pview__big" aria-label="The player's view" onClose={() => setLarge(false)} onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
        <canvas ref={big} />
        <form method="dialog"><button type="submit" className="btn btn--ghost">Close<kbd>Esc</kbd></button></form>
      </dialog>
    </section>
  );
}
