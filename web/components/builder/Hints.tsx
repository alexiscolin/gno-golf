"use client";

// The first run's hints (the GUI spec's B1): the four steps a first hole
// goes through (the palette, the green's paint, Play, the steps), short, in their
// order under the empty piece settings, never in the way: never over the hole,
// the 3D or one another, the pointer through them, and they are gone at the first drag (the
// editor's onDone); never a tutorial. Shown on the
// first visit only (templates.ts HINTS_KEY). Asked for again (the header's
// "?"), a glossary of the world's pieces comes under them, on one screen:
// each palette tile's picture, its name and what it does (tiles.ts), and
// every key, in a sheet as the game's (its X, Escape or the dim round it puts it away).
import { allTiles, pictureOf } from "@/lib/builder/tiles";
import { cap, required, theWorld } from "@/lib/builder/rules";
import { weathersSaid } from "@/lib/builder/rules";
import type { PaletteEntry } from "@/lib/builder/palette";
import { KEYS } from "@/lib/builder/keys";
import { entryName } from "@/lib/builder/names";
import { MOD } from "./Inspector";
import { Sheet } from "@/components/ui";

/** The four, the world's weathers named in Play's. */
const hintsOf = (world: string) => [
  ["palette", "Drag a piece onto the board"],
  ["green", "Paint or Erase (B): drag the green"],
  ["test", `Press Play (T): sink it in ${weathersSaid(required(world))}`],
  ["steps", "Then Publish it for anyone to play"],
] as const;

export default function Hints({ world, onDone, glossary = null }: {
  /** the draft's: the weathers Play's hint names */
  world: string;
  onDone: () => void;
  /** the "?": the world's pieces under the hints */
  glossary?: { world: string; palette: readonly PaletteEntry[] } | null;
}) {
  const hints = (inPanel: boolean) => hintsOf(world).map(([at, text], k) => <p key={at} className={inPanel ? "bhint bhint--in" : "bhint"}><b>{k + 1}</b>{text}</p>);
  // the first run: the four in order, the pointer through them
  if (!glossary) return <div className="bhints" role="note" aria-label="Four hints">{hints(false)}</div>;
  const tiles = allTiles(glossary.palette);
  return (
    <Sheet label={`How it works, and ${theWorld(glossary.world)}'s pieces`} className="bgloss" onClose={onDone}>
      <h2>How it works</h2>
      <div className="bgloss__hints">{hints(true)}</div>
      <h3 className="h-sub">{cap(theWorld(glossary.world))}&apos;s pieces</h3>
      <ul>
        {tiles.map((t) => (
          <li key={t.key} className="bgloss__piece" title={t.looks.length > 1 ? t.looks.map(entryName).join(", ") : undefined}>
            <img src={pictureOf(glossary.world, t.looks[0])} width={44} height={44} alt="" decoding="async" />
            <span><b>{t.name}</b><small>{t.does || "a piece of its own"}</small></span>
          </li>
        ))}
      </ul>
      {/* every key: its key, what it does, a list in two columns (one on a narrow sheet) */}
      <dl className="bgloss__keys">{KEYS.map((k) => <div key={k.key}><dt><kbd>{k.key.replace("mod", MOD)}</kbd></dt><dd>{k.long}</dd></div>)}</dl>
    </Sheet>
  );
}
