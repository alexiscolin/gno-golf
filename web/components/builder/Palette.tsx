"use client";

// The palette (the GUI spec's B3): the pieces by what they do (tiles.ts),
// the five a first hole needs first (Wall, Bumper, Sand, Water, Slope), the
// world's others by group under "More pieces" (open at first, each group
// folding too), another world's under "From other worlds" (palette.ts HOME,
// folded at first), each fold kept as left for the visit, and the bin a
// piece dragged from the board is dropped on to remove it. Every piece is
// one row: the game's own picture of it (drawn offline:
// media/builder/tiles.mjs), its name and what it does; a piece of several
// looks has them in a tray under its row, in its card, each pictured, named
// and to drag on (a row of them, and +N opening the rest in place, kept for
// the visit), its current look ringed.
// Press a row (its look as chosen) or a look and it follows the pointer onto
// the board (Board's ghost); a look pressed is the piece's look from then on
// (1 to 5 arm the first five so). A limit reached switches the pieces it
// would pass off, with why. It scrolls in itself.
import { useState, type ReactNode } from "react";
import { type PaletteEntry } from "@/lib/builder/palette";
import { foldOpen, lookOf, looksOpen, looksRow, pictureOf, saveFold, saveLooksOpen, tilesOf, type Fold, type Tile } from "@/lib/builder/tiles";
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

  const tiles = (ts: readonly Tile[]) => <div className="ptiles">{ts.map((t) => <Piece key={t.key} t={t} world={world} now={lookOf(t, chosen)} armed={armed} off={off} onArm={arm} onPick={pick} />)}</div>;
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

/** A piece in its card: its row (its picture as now, its name, what it does: pressed, its look as now is armed) and, a piece of several looks, their tray under it. */
function Piece({ t, world, now, armed, off, onArm, onPick }: {
  t: Tile;
  world: string;
  /** its look as chosen (the row's picture, ringed in the tray) */
  now: PaletteEntry;
  armed: PaletteEntry | null;
  off: ReadonlyMap<string, string>;
  onArm: (e: PaletteEntry) => void;
  onPick: (t: Tile, e: PaletteEntry) => void;
}) {
  const [open, setOpen] = useState(() => looksOpen(t.key));
  const { shown, more } = looksRow(t, open), why = off.get(now.id), tray = shown.length > 0;
  const fold = (o: boolean) => (setOpen(o), saveLooksOpen(t.key, o));
  // on: the look armed (the row's own when it has no tray: the tray's look carries it)
  const on = !tray && armed?.id === now.id;
  return (
    <div className="ptile">
      <button type="button" className={`piece${on ? " piece--on" : ""}`} data-tile={t.key} disabled={!!why} aria-pressed={on}
        title={why ?? `${entryName(now)}: ${t.does}. Drag it onto the board (Shift: several); from the keyboard, Enter places it`}
        onPointerDown={() => onArm(now)} onClick={(ev) => ev.detail === 0 && onArm(now)}>
        <Picture world={world} e={now} px={64} />
        <span className="piece__name">{t.name}</span>
        <small className="piece__does">{t.does}</small>
      </button>
      {tray && (
        <div className="plooks" role="group" aria-label={`${t.name}: its ${t.looks.length} looks`}>
          {shown.map((l) => {
            const no = off.get(l.id);
            return (
              <button key={l.id} type="button" className={`look${l.id === now.id ? " look--now" : ""}`} data-look={l.id} aria-pressed={armed?.id === l.id} disabled={!!no}
                aria-label={entryName(l)} title={no ?? `${entryName(l)}: drag it onto the board`} onPointerDown={() => onPick(t, l)} onClick={(ev) => ev.detail === 0 && onPick(t, l)}>
                <Picture world={world} e={l} px={64} />
              </button>
            );
          })}
          {more > 0 && <button type="button" className="look look--more" aria-expanded={false} aria-label={`${more} more looks`} title={`${more} more looks: show them`} onClick={() => fold(true)}>+{more}</button>}
          {open && looksRow(t, false).more > 0 && <button type="button" className="look look--more" aria-expanded aria-label="Fewer looks" title="Fewer looks: one row" onClick={() => fold(false)}>−</button>}
        </div>
      )}
    </div>
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
