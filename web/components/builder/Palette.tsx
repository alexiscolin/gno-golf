"use client";

// The palette (the GUI spec's B2): the world's pieces by kind, each a tile
// with the board's own drawing of it and its name. Press one and it follows
// the pointer onto the board (Board's ghost); a limit reached switches the
// entries it would pass off, with why. It scrolls in itself.
import { placePiece } from "@/lib/builder/edit";
import { groupsOf } from "@/lib/builder/editor";
import { handlesOf } from "@/lib/builder/handles";
import type { PaletteEntry } from "@/lib/builder/palette";
import { PieceShape } from "./PieceShape";

/** A tile's drawing: a small piece of the entry, framed. */
function Tile({ e }: { e: PaletteEntry }) {
  const p = placePiece(e, "tile", [0, 0], { size: e.kind === "rail" || e.kind === "bar" ? 3 : e.kind === "post" ? undefined : 2.5 });
  const pts = [...handlesOf(p).map((h) => h.at), ...(p.geometry.t === "post" ? [[p.geometry.c[0] - p.geometry.r, p.geometry.c[1] - p.geometry.r] as [number, number]] : [])];
  const lo = [Math.min(...pts.map((v) => v[0])) - 0.6, Math.min(...pts.map((v) => v[1])) - 0.6], hi = [Math.max(...pts.map((v) => v[0])) + 0.6, Math.max(...pts.map((v) => v[1])) + 0.6];
  return (
    <svg viewBox={`${lo[0]} ${lo[1]} ${hi[0] - lo[0]} ${hi[1] - lo[1]}`} aria-hidden="true">
      <PieceShape p={{ ...p, params: { ...p.params, to: undefined } }} />
    </svg>
  );
}

export default function Palette({ world, palette, armed, off, onArm }: {
  world: string;
  palette: readonly PaletteEntry[];
  armed: PaletteEntry | null;
  /** entries a limit switches off, with why */
  off: ReadonlyMap<string, string>;
  onArm: (e: PaletteEntry | null) => void;
}) {
  const name = world.charAt(0).toUpperCase() + world.slice(1);
  return (
    <aside className="col palette" aria-label={`The ${name}'s pieces`}>
      <div className="palette__world">{name} pieces</div>
      {groupsOf(palette).map((g) => (
        <section key={g.name} className="palette__group">
          <h3>{g.name}</h3>
          <div className="pieces">
            {g.entries.map((e) => {
              const why = off.get(e.id);
              return (
                <button key={e.id} type="button" className={`piece${armed?.id === e.id ? " piece--on" : ""}`} disabled={!!why} aria-pressed={armed?.id === e.id}
                  title={why ?? `${e.label}: press, then let go on the board (Shift: several)`} onPointerDown={() => onArm(armed?.id === e.id ? null : e)}>
                  <Tile e={e} />
                  <span>{e.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
}
