"use client";

// The first run's three hints (the GUI spec's B1): one by each place a first
// hole goes through (the palette, the big button, the steps), short, and gone
// at once with "Got it"; never a tutorial, and never over the 3D. Shown on the
// first visit only (templates.ts HINTS_KEY). Asked for again (the header's
// "?"), a glossary of the world's pieces comes under them, on one screen:
// each palette tile's picture, its name and what it does (tiles.ts).
import { useEffect, useRef } from "react";
import { pictureOf, tilesOf } from "@/lib/builder/tiles";
import { worldName } from "@/lib/builder/rules";
import type { PaletteEntry } from "@/lib/builder/palette";
import { KEYS } from "@/lib/builder/keys";
import { entryName } from "@/lib/builder/names";
import { MOD } from "./Inspector";

const HINTS = [
  ["palette", "Drag a piece onto the board"],
  ["test", "Press T to try it, Prove it to make it count"],
  ["steps", "Then Publish, once holed in every weather"],
] as const;

export default function Hints({ onDone, glossary = null }: {
  onDone: () => void;
  /** the "?": the world's pieces under the hints */
  glossary?: { world: string; palette: readonly PaletteEntry[] } | null;
}) {
  const got = useRef<HTMLButtonElement>(null);
  useEffect(() => got.current?.focus(), []);
  const tiles = glossary ? (({ first, more }) => [...first, ...more.flatMap((g) => g.tiles)])(tilesOf(glossary.palette)) : [];
  const hints = (inPanel: boolean) => HINTS.map(([at, text], k) => <p key={at} className={`bhint bhint--${inPanel ? "in" : at}`}><b>{k + 1}</b>{text}</p>);
  const ok = <button ref={got} type="button" className="btn btn--gold bhint__ok" onClick={onDone}>Got it</button>;
  // the first run: each hint by its place; the "?": one panel in the middle, the hints, then the pieces
  if (!glossary) return <div className="bhints" role="note" aria-label="Three hints" onKeyDown={(e) => e.key === "Escape" && onDone()}>{hints(false)}<div className="bhints__centre">{ok}</div></div>;
  return (
    <div className="bhints" role="note" aria-label="How it works, and the pieces" onKeyDown={(e) => e.key === "Escape" && onDone()}>
      <div className="bhints__centre bhints__centre--help">
        <section className="bgloss" aria-label={`How it works, and the ${worldName(glossary.world)}'s pieces`}>
          <div className="bgloss__hints">{hints(true)}</div>
          <h2>The {worldName(glossary.world)}&apos;s pieces</h2>
          <ul>
            {tiles.map((t) => (
              <li key={t.key} className="bgloss__piece" title={t.looks.length > 1 ? t.looks.map(entryName).join(", ") : undefined}>
                <img src={pictureOf(glossary.world, t.looks[0])} width={44} height={44} alt="" decoding="async" />
                <span><b>{t.name}</b><small>{t.does || "a piece of its own"}</small></span>
              </li>
            ))}
          </ul>
          <p className="bgloss__keys">{KEYS.map((k, i) => <span key={k.key}>{i ? " · " : ""}<kbd>{k.key.replace("mod", MOD)}</kbd> {k.long}</span>)}</p>
          {ok}
        </section>
      </div>
    </div>
  );
}
