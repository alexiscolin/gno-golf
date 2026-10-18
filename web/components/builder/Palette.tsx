"use client";

// The palette (the GUI spec's B3): the pieces by what they do (tiles.ts),
// the five a first hole needs first (Wall, Bumper, Sand, Water, Slope), the
// world's others by group under "More pieces" (folded at first: the five
// fit the column unscrolled; each group folding too), another world's under "From other worlds" (palette.ts HOME,
// folded at first), each fold kept as left for the visit, and the bin a
// piece dragged from the board is dropped on to remove it. Every piece is
// one row: the game's own picture of it (drawn offline:
// media/builder/tiles.mjs), its name and what it does, in its look as last
// chosen (a look is chosen in the Inspector, for the piece selected: the
// next one placed takes it). Press a row and it follows the pointer onto
// the board (Board's ghost); a press arms it, always (a refused drop leaves
// it armed: pressed again, it is carried again, never put back); from the
// keyboard, Enter arms it and again puts it back (1 to 5 arm the first
// five). A limit reached switches the pieces it would pass off, with why. It
// scrolls in itself.
import { useState, type ReactNode } from "react";
import { type PaletteEntry } from "@/lib/builder/palette";
import { armOn, foldOpen, lookOf, pictureOf, saveFold, tilesOf, type Fold, type Tile } from "@/lib/builder/tiles";
import { entryName } from "@/lib/builder/names";
import { cap, theWorld, worldName } from "@/lib/builder/rules";
import { sound } from "@/lib/feel";

/** A look's picture: a file, its place kept (no shift as it loads). */
const Picture = ({ world, e, px }: { world: string; e: PaletteEntry; px: number }) => (
  <img src={pictureOf(world, e)} width={px} height={px} alt="" draggable={false} decoding="async" />
);

export default function Palette({ world, palette, armed, off, bin, onArm, chosen }: {
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
}) {
  const name = worldName(world), { first, more, others } = tilesOf(palette);
  // picked up: the game's wooden tick (put back: nothing)
  const arm = (e: PaletteEntry, how: "press" | "key") => {
    const next = armOn(armed, e, how);
    if (next && armed?.id !== next.id) sound("select");
    onArm(next);
  };

  const tiles = (ts: readonly Tile[]) => <div className="ptiles">{ts.map((t) => <Piece key={t.key} t={t} world={world} now={lookOf(t, chosen)} armed={armed} off={off} onArm={arm} />)}</div>;
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

/** A piece: its row (its picture in its look as chosen, its name, what it does), pressed to carry that look onto the board. */
function Piece({ t, world, now, armed, off, onArm }: {
  t: Tile;
  world: string;
  /** its look as chosen */
  now: PaletteEntry;
  armed: PaletteEntry | null;
  off: ReadonlyMap<string, string>;
  onArm: (e: PaletteEntry, how: "press" | "key") => void;
}) {
  const why = off.get(now.id), on = armed?.id === now.id;
  return (
    <div className="ptile">
      <button type="button" className={`piece${on ? " piece--on" : ""}`} data-tile={t.key} data-look={now.id} disabled={!!why} aria-pressed={on}
        title={why ?? `${entryName(now)}: ${t.does}. Drag it onto the board (Shift: several); from the keyboard, Enter places it`}
        onPointerDown={() => onArm(now, "press")} onClick={(ev) => ev.detail === 0 && onArm(now, "key")}>
        <Picture world={world} e={now} px={64} />
        <span className="piece__name">{t.name}</span>
        <small className="piece__does">{t.does}</small>
      </button>
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
