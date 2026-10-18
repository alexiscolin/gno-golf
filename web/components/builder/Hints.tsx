"use client";

// The first run's three hints (the GUI spec's B1): one by each place a first
// hole goes through (the palette, Play, the steps), short, never in the way:
// the pointer goes through them, and they are gone at the first drag (the
// editor's onDone); never a tutorial, and never over the 3D. Shown on the
// first visit only (templates.ts HINTS_KEY). Asked for again (the header's
// "?"), a glossary of the world's pieces comes under them, on one screen:
// each palette tile's picture, its name and what it does (tiles.ts), and
// every key; Close, Escape or the dim round it puts it away.
import { useEffect, useRef } from "react";
import { allTiles, pictureOf } from "@/lib/builder/tiles";
import { cap, theWorld } from "@/lib/builder/rules";
import type { PaletteEntry } from "@/lib/builder/palette";
import { KEYS } from "@/lib/builder/keys";
import { entryName } from "@/lib/builder/names";
import { MOD } from "./Inspector";
import { Button } from "@/components/ui";

const HINTS = [
  ["palette", "Drag a piece onto the board"],
  ["test", "Press Play (T): sink it in every weather"],
  ["steps", "Then Publish it for anyone to play"],
] as const;

export default function Hints({ onDone, glossary = null }: {
  onDone: () => void;
  /** the "?": the world's pieces under the hints */
  glossary?: { world: string; palette: readonly PaletteEntry[] } | null;
}) {
  // the glossary opened: Close focused once (a new glossary object each render of the editor's is no reason to take the focus back)
  const close = useRef<HTMLButtonElement>(null), help = !!glossary;
  useEffect(() => void (help && close.current?.focus()), [help]);
  const hints = (inPanel: boolean) => HINTS.map(([at, text], k) => <p key={at} className={`bhint bhint--${inPanel ? "in" : at}`}><b>{k + 1}</b>{text}</p>);
  // the first run: each hint by its place, the pointer through them
  if (!glossary) return <div className="bhints" role="note" aria-label="Three hints">{hints(false)}</div>;
  const tiles = allTiles(glossary.palette);
  return (
    <div className="bhints bhints--help" role="note" aria-label="How it works, and the pieces" onKeyDown={(e) => e.key === "Escape" && onDone()}>
      <div className="bhints__centre" onClick={(e) => e.target === e.currentTarget && onDone()}>
        <section className="bgloss" aria-label={`How it works, and ${theWorld(glossary.world)}'s pieces`}>
          <div className="bgloss__hints">{hints(true)}</div>
          <h2>{cap(theWorld(glossary.world))}&apos;s pieces</h2>
          <ul>
            {tiles.map((t) => (
              <li key={t.key} className="bgloss__piece" title={t.looks.length > 1 ? t.looks.map(entryName).join(", ") : undefined}>
                <img src={pictureOf(glossary.world, t.looks[0])} width={44} height={44} alt="" decoding="async" />
                <span><b>{t.name}</b><small>{t.does || "a piece of its own"}</small></span>
              </li>
            ))}
          </ul>
          <p className="bgloss__keys">{KEYS.map((k, i) => <span key={k.key}>{i ? " · " : ""}<kbd>{k.key.replace("mod", MOD)}</kbd> {k.long}</span>)}</p>
          <Button ref={close} type="button" keycap="Esc" className="bgloss__close" onClick={onDone}>Close</Button>
        </section>
      </div>
    </div>
  );
}
