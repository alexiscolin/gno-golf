"use client";

// The palette (the GUI spec's B3): the pieces by what they do (tiles.ts),
// the five a first hole needs first (Wall, Bumper, Sand, Water, Slope), the
// world's others by group under "More pieces" (open at first, each group
// folding too), another world's under "From other worlds" (palette.ts HOME,
// folded at first), each fold kept as left for the visit, and the bin a
// piece dragged from the board is dropped on to remove it. Every piece is
// one row: the game's own picture of it (drawn offline:
// media/builder/tiles.mjs), its name and what it does; a piece of several
// looks has them all under its row, each pictured, named and to drag on.
// Press a row (its look as chosen) or a look and it follows the pointer onto
// the board (Board's ghost); a look pressed is the piece's look from then on
// (1 to 5 arm the first five so). A limit reached switches the pieces it
// would pass off, with why. It scrolls in itself.
import { useState, type ReactNode } from "react";
import { type PaletteEntry } from "@/lib/builder/palette";
import { foldOpen, lookOf, looksShown, pictureOf, saveFold, tilesOf, type Fold, type Tile } from "@/lib/builder/tiles";
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
  /** each piece's look as chosen (its first until then), the editor's (its keys arm it too) */
  chosen: Readonly<Record<string, string>>;
  onChoose: (tile: string, entry: string) => void;
}) {
  const name = worldName(world), { first, more, others } = tilesOf(palette);
  // picked up: the game's wooden tick (put back: nothing)
  const arm = (e: PaletteEntry) => (armed?.id !== e.id && sound("select"), onArm(armed?.id === e.id ? null : e));
  // a look pressed: the piece's look from now on, and armed
  const pick = (t: Tile, e: PaletteEntry) => (onChoose(t.key, e.id), arm(e));

  const tiles = (ts: readonly Tile[]) => <div className="ptiles">{ts.map((t) => tile(t))}</div>;
  const tile = (t: Tile) => {
    const e = lookOf(t, chosen), why = off.get(e.id), looks = looksShown(t);
    // on: the look armed (the row's own when it has no looks under it)
    const on = !looks.length && armed?.id === e.id;
    return (
      <div key={t.key} className="ptile">
        <button type="button" className={`piece${on ? " piece--on" : ""}`} data-tile={t.key} disabled={!!why} aria-pressed={on}
          title={why ?? `${entryName(e)}: ${t.does}. Drag it onto the board (Shift: several); from the keyboard, Enter places it`}
          onPointerDown={() => arm(e)} onClick={(ev) => ev.detail === 0 && arm(e)}>
          <Picture world={world} e={e} px={64} />
          <span className="piece__name">{t.name}</span>
          <small className="piece__does">{t.does}</small>
        </button>
        {looks.length > 0 && (
          <div className="plooks" role="group" aria-label={`${t.name}: its ${looks.length} looks`}>
            {looks.map((l) => {
              const no = off.get(l.id);
              return (
                <button key={l.id} type="button" className="look" data-look={l.id} aria-pressed={armed?.id === l.id} disabled={!!no} aria-label={entryName(l)}
                  title={no ?? `${entryName(l)}: drag it onto the board`} onPointerDown={() => pick(t, l)} onClick={(ev) => ev.detail === 0 && pick(t, l)}>
                  <Picture world={world} e={l} px={64} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };
  return (
    <aside className="col palette" aria-label={`${cap(theWorld(world))}'s pieces`}>
      <div className="palette__world">{name} pieces</div>
      {tiles(first)}
      <Folding fold="more" title="More pieces">
        {more.map((g) => (
          <Folding key={g.group} fold={`group/${g.group}`} title={g.group} group>
            {tiles(g.tiles)}
          </Folding>
        ))}
      </Folding>
      {others.length > 0 && (
        <Folding fold="others" title="From other worlds">
          {tiles(others)}
        </Folding>
      )}
      {bin && <div className="palette__bin" data-bin aria-hidden="true">Drop a piece here to remove it</div>}
    </aside>
  );
}

/** A section of the palette that folds (More pieces, each group, From other worlds): open or folded as the author left it this visit (tiles.ts foldOpen). */
function Folding({ fold, title, group = false, children }: { fold: Fold; title: string; group?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => foldOpen(fold));
  return (
    <details className={group ? "palette__group" : "palette__more"} data-fold={fold} open={open} onToggle={(e) => (setOpen(e.currentTarget.open), saveFold(fold, e.currentTarget.open))}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}
