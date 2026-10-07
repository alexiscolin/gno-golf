"use client";

// The shop's small pieces, one of each (the GUI spec's "Shared pieces"): a
// tier's chip, a gnome's tile (his 3D portrait, or the chain's), his card in
// a grid, the switch between the two looks, the closing date. On the game's
// own tokens (app/gnomes.css).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Segmented } from "@/components/ui";
import { TIER_LOOK, type Listed } from "@/lib/gnomes/catalogue";
import type { Look, Portraits } from "@/lib/gnomes/onchain";
import { utcDate, localDate } from "@/lib/gnomes/shop";
import type { Tier } from "@/lib/gnomes/vocab";

// a tier's shape, read in grey too: a disc, a diamond, a gem, a crown; a leaf for an earned one
const SHAPE: Record<string, ReactNode> = {
  common: <circle cx="8" cy="8" r="5" />,
  rare: <path d="M8 2 14 8 8 14 2 8z" />,
  epic: <path d="M4 3h8l3 4-7 7-7-7z" />,
  legendary: <path d="M2 12 3 5l3 3 2-5 2 5 3-3 1 7z" />,
  earned: <path d="M3 13C3 7 7 3 13 3c0 6-4 10-10 10z" />,
};
export const tierName = (t: string) => (TIER_LOOK[t as Tier] || { label: t }).label;

/** A tier's chip: its shape and its name, on its colour. */
export const TierChip = ({ tier }: { tier: string }) => (
  <span className={`tier tier--${tier}`}>
    <svg viewBox="0 0 16 16" aria-hidden="true">{SHAPE[tier] || SHAPE.common}</svg>
    {tierName(tier)}
  </span>
);

/** Where a gnome's picture is served (scripts/gnomeassets.mjs): his thumbnail. */
export const thumb = (id: number) => `/gnomes/${id}.webp`;

/** A gnome's portrait as the chain draws it, read once his tile is in view (lazy; at once otherwise): undefined
 *  while it is read, null for none (his 3D portrait shows instead). */
function useOnChain(id: number, from: Portraits | null, lazy: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState(() => from?.known(id));
  useEffect(() => {
    if (!from) return;
    const known = from.known(id);
    setUrl(known);
    if (known !== undefined) return;
    let live = true;
    const load = () => void from.get(id).then((u) => live && setUrl(u));
    const el = ref.current;
    if (!lazy || !el || typeof IntersectionObserver === "undefined") return load(), () => void (live = false);
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (o.disconnect(), load()), { rootMargin: "200px" });
    o.observe(el);
    return () => ((live = false), o.disconnect());
  }, [id, from, lazy]);
  return { ref, url };
}

/** A gnome's tile: his thumbnail on his tier's stage, in his tier's rim (never: the sale closed before he found a player);
 *  onChain: the portraits he is drawn from as the chain draws him (the stage bare while it is read, his thumbnail if it fails). */
export function Tile({ id, tier, never = false, lazy = true, onChain = null }: { id: number; tier: string; never?: boolean; lazy?: boolean; onChain?: Portraits | null }) {
  const { ref, url } = useOnChain(id, onChain, lazy);
  const [broken, setBroken] = useState<string | null>(null);
  const src = !onChain ? thumb(id) : url === undefined ? null : url && url !== broken ? url : thumb(id);
  return (
    <span ref={ref} className={`gtile gtile--${tier}${never ? " gtile--never" : ""}`}>
      {src && <img src={src} alt="" width={256} height={256} loading={lazy ? "lazy" : "eager"} decoding="async" onError={() => url && setBroken(url)} />}
    </span>
  );
}

/** The switch between a gnome's two looks: his 3D portrait, or the SVG the chain draws (the gallery's and a sheet's). */
export const LookSwitch = ({ look, onLook }: { look: Look; onLook: (l: Look) => void }) => (
  <Segmented label="How the gnomes are drawn" className="seg--look" options={[["3d", "3D"], ["chain", "On chain"]]} value={look} onChange={onLook} />
);

/** A gnome in the grid: his tile, name and number, his tier and one fact (his price when on sale), and Buy when he
 *  can be bought; a button that opens his sheet (where the order is reviewed: the card itself never buys). */
export function GnomeCard({ g, fact, mine, never, buy = false, onChain = null, onOpen }: { g: Listed; fact: string; mine: boolean; never: boolean; buy?: boolean; onChain?: Portraits | null; onOpen: () => void }) {
  return (
    <button type="button" className={`gcard${mine ? " gcard--mine" : ""}${never ? " gcard--never" : ""}`} onClick={onOpen}
      aria-label={`${g.name}, number ${g.id}, ${tierName(g.tier)}: ${fact}${buy ? ". Buy" : ""}`}>
      <Tile id={g.id} tier={g.tier} never={never} onChain={onChain} />
      <span className="gcard__name">{g.name}<small>#{g.id}</small></span>
      <span className="gcard__foot"><TierChip tier={g.tier} /><span className="gcard__fact">{fact}</span></span>
      {buy && <span className="gcard__buy" aria-hidden="true">Buy</span>}
    </button>
  );
}
/** A card's place while the grid is read: the same size, blank. */
export const BlankCard = () => (
  <span className="gcard gcard--skel" aria-hidden="true"><span className="gtile" /><span className="gcard__name">&nbsp;</span><span className="gcard__foot" /><span className="gcard__buy gcard__buy--skel">&nbsp;</span></span>
);

/** The closing date: a date in UTC (the player's own time on hover and for a screen reader), never a countdown. */
export function Closes({ at, now }: { at: number; now: number }) {
  return (
    <p className="closes" title={localDate(at)}>
      <span>Sale closes for good on <b aria-label={`${utcDate(at, now)}, ${localDate(at)} your time`}>{utcDate(at, now)}</b>. Unsold gnomes are never made.</span>
    </p>
  );
}
