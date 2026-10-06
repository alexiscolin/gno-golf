"use client";

// The palette (the GUI spec's B3): the five pieces a first hole needs,
// big and named plainly (palette.ts commonOf: Wall, Bumper, Sand, Water,
// Slope), the world's others by kind under "More pieces", and the bin a
// piece dragged from the board is dropped on to remove it. Each tile has the
// board's own drawing of its piece: press one and it follows the pointer onto
// the board (Board's ghost); a limit reached switches the entries it would
// pass off, with why. It scrolls in itself.
import { placePiece } from "@/lib/builder/edit";
import { groupsOf } from "@/lib/builder/editor";
import { handlesOf } from "@/lib/builder/handles";
import { commonOf, type PaletteEntry } from "@/lib/builder/palette";
import { PieceShape } from "./PieceShape";
import { worldName } from "@/lib/builder/rules";

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
  const name = worldName(world), common = commonOf(palette), first = new Set(common.map((c) => c.entry.id));
  const piece = (e: PaletteEntry, label: string, big = false) => {
    const why = off.get(e.id);
    return (
      <button key={e.id} type="button" className={`piece${big ? " piece--big" : ""}${armed?.id === e.id ? " piece--on" : ""}`} disabled={!!why} aria-pressed={armed?.id === e.id}
        title={why ?? `${label}: drag it onto the board (Shift: several); from the keyboard, Enter places it`} onPointerDown={() => onArm(armed?.id === e.id ? null : e)}
        onClick={(ev) => ev.detail === 0 && onArm(armed?.id === e.id ? null : e)}>
        <Tile e={e} />
        <span>{label}</span>
      </button>
    );
  };
  return (
    <aside className="col palette" aria-label={`The ${name}'s pieces`}>
      <div className="palette__world">{name} pieces</div>
      <div className="pieces pieces--common">{common.map((c) => piece(c.entry, c.name, true))}</div>
      <details className="palette__more">
        <summary>More pieces</summary>
        {groupsOf(palette).map((g) => {
          const rest = g.entries.filter((e) => !first.has(e.id));
          return rest.length > 0 && (
            <section key={g.name} className="palette__group">
              <h3>{g.name}</h3>
              <div className="pieces">{rest.map((e) => piece(e, e.label))}</div>
            </section>
          );
        })}
      </details>
      <div className="palette__bin" data-bin aria-hidden="true">Drop a piece here to remove it</div>
    </aside>
  );
}
