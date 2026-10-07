"use client";

// The palette (the GUI spec's B3): the pieces by what they do (tiles.ts),
// the five a first hole needs first, big (Wall, Bumper, Sand, Water,
// Slope), the others by group under "More pieces", and the bin a piece
// dragged from the board is dropped on to remove it. Each tile is the
// game's own picture of its piece (drawn offline: media/builder/tiles.mjs),
// its name and what it does; a tile of several looks has a chooser beside
// the board, each look pictured. Press a tile (or a look) and it follows
// the pointer onto the board (Board's ghost); a limit reached switches the
// tiles it would pass off, with why. It scrolls in itself.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type PaletteEntry } from "@/lib/builder/palette";
import { pictureOf, tilesOf, type Tile } from "@/lib/builder/tiles";
import { entryName } from "@/lib/builder/names";
import { cap, theWorld, worldName } from "@/lib/builder/rules";
import { sound } from "@/lib/feel";

/** A look's picture: a file, its place kept (no shift as it loads). */
const Picture = ({ world, e, px }: { world: string; e: PaletteEntry; px: number }) => (
  <img src={pictureOf(world, e)} width={px} height={px} alt="" draggable={false} decoding="async" />
);

export default function Palette({ world, palette, armed, off, bin, onArm, chosen, onChoose }: {
  world: string;
  /** a piece carried on the board: the bin shown, to let it go on */
  bin: boolean;
  palette: readonly PaletteEntry[];
  armed: PaletteEntry | null;
  /** entries a limit switches off, with why */
  off: ReadonlyMap<string, string>;
  onArm: (e: PaletteEntry | null) => void;
  /** each tile's look as chosen (its first until then), the editor's (its keys arm it too) */
  chosen: Readonly<Record<string, string>>;
  onChoose: (tile: string, entry: string) => void;
}) {
  const name = worldName(world), { first, more } = tilesOf(palette);
  // the tile whose looks are open
  const [open, setOpen] = useState<{ tile: Tile; from: HTMLElement } | null>(null);
  const lookOf = (t: Tile) => t.looks.find((e) => e.id === chosen[t.key]) ?? t.looks[0];
  // picked up: the game's wooden tick (put back: nothing)
  const arm = (e: PaletteEntry) => (armed?.id !== e.id && sound("select"), onArm(armed?.id === e.id ? null : e));

  const tile = (t: Tile, big = false) => {
    const e = lookOf(t), why = off.get(e.id), on = !!armed && t.looks.some((x) => x.id === armed.id);
    return (
      <div key={t.key} className={`ptile${big ? " ptile--big" : ""}`}>
        <button type="button" className={`piece${on ? " piece--on" : ""}`} data-tile={t.key} disabled={!!why} aria-pressed={on}
          title={why ?? `${entryName(e)}: ${t.does}. Drag it onto the board (Shift: several); from the keyboard, Enter places it`}
          onPointerDown={() => arm(e)} onClick={(ev) => ev.detail === 0 && arm(e)}>
          <Picture world={world} e={e} px={big ? 64 : 72} />
          <span className="piece__name">{t.name}</span>
          <small className="piece__does">{t.does}</small>
        </button>
        {t.looks.length > 1 && (
          <button type="button" className="ptile__looks" aria-haspopup="dialog" aria-expanded={open?.tile.key === t.key}
            title={`${t.looks.length} looks: ${entryName(e)} now. Choose another`}
            onClick={(ev) => setOpen(open?.tile.key === t.key ? null : { tile: t, from: ev.currentTarget })}>
            {t.looks.length}<span aria-hidden="true"> looks</span>
          </button>
        )}
      </div>
    );
  };
  return (
    <aside className="col palette" aria-label={`${cap(theWorld(world))}'s pieces`} onScroll={() => setOpen(null)}>
      <div className="palette__world">{name} pieces</div>
      <div className="ptiles ptiles--first">{first.map((t) => tile(t, true))}</div>
      <details className="palette__more">
        <summary>More pieces</summary>
        {more.map((g) => (
          <section key={g.group} className="palette__group">
            <h3>{g.group}</h3>
            <div className="ptiles">{g.tiles.map((t) => tile(t))}</div>
          </section>
        ))}
      </details>
      {bin && <div className="palette__bin" data-bin aria-hidden="true">Drop a piece here to remove it</div>}
      {open && (
        <Looks world={world} tile={open.tile} from={open.from} now={lookOf(open.tile)} off={off} onClose={() => setOpen(null)}
          onPick={(e) => (onChoose(open.tile.key, e.id), sound("select"), onArm(e))} />
      )}
    </aside>
  );
}

/**
 * A tile's looks, beside the palette by the tile: each pictured and named;
 * press one and it is the tile's look, armed (dragged on, it is placed).
 * Escape, a press elsewhere or the palette scrolling closes it.
 */
function Looks({ world, tile, from, now, off, onPick, onClose }: {
  world: string;
  tile: Tile;
  from: HTMLElement;
  now: PaletteEntry;
  off: ReadonlyMap<string, string>;
  onPick: (e: PaletteEntry) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // beside the palette, level with the tile, kept in the window
  useLayoutEffect(() => {
    const col = from.closest(".palette")!.getBoundingClientRect(), r = from.getBoundingClientRect(), h = box.current!.offsetHeight;
    setAt({ left: col.right + 8, top: Math.max(12, Math.min(r.top - 12, innerHeight - h - 12)) });
  }, [from, tile]);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]")?.focus();
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !from.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && (onClose(), from.focus());
    addEventListener("pointerdown", away);
    addEventListener("keydown", key);
    addEventListener("resize", onClose);
    return () => (removeEventListener("pointerdown", away), removeEventListener("keydown", key), removeEventListener("resize", onClose));
  }, [from, onClose]);
  const pick = (e: PaletteEntry) => (onPick(e), onClose());
  return (
    <div ref={box} className="looks" role="dialog" aria-label={`${tile.name}: its looks`} style={at ? { left: at.left, top: at.top } : { visibility: "hidden" }}>
      <p className="looks__head"><b>{tile.name}</b> {tile.does} · {tile.looks.length} looks</p>
      <div className="looks__grid">
        {tile.looks.map((e) => {
          const why = off.get(e.id);
          return (
            <button key={e.id} type="button" className="look" aria-pressed={e.id === now.id} disabled={!!why} title={why ?? `${entryName(e)}: drag it onto the board`}
              onPointerDown={() => pick(e)} onClick={(ev) => ev.detail === 0 && (pick(e), from.parentElement?.querySelector<HTMLElement>(".piece")?.focus())}>
              <Picture world={world} e={e} px={64} />
              <span>{entryName(e)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
