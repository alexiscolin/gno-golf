"use client";

// The collection on the game's own screens, behind NEXT_PUBLIC_GNOMES and the
// region gate (the caller's): the menu's Gnomes card beside the games, the
// picker's Collection section at its top, the finish card's one line. What
// they say is the gallery's own (lib/gnomes/shop.ts promoOf, promoWords: the
// wave to see, its size, its lowest price, its Legendary), read once a visit.
// Plain words, dates and counts: never a countdown, never "only" or "last".
import "@/app/gnomes.css";
import { useEffect, useState, type ReactNode } from "react";
import type { Chain } from "@/lib/chain";
import { promoWords, type Promo } from "@/lib/gnomes/shop";
import { readSale, saleAt, type Sale } from "@/lib/gnomes/promo";
import type { Tier } from "@/lib/gnomes/vocab";
import { sound } from "@/lib/feel";
import { Tile, thumb } from "./parts";

/** The sale on this chain (lib/gnomes/promo.ts, read once a chain) as the screens show it now, by the chain's clock
 *  (whole seconds, as the gallery's): promo undefined while read, null for none; none at all without a chain. */
export function usePromo(chain: Chain | null): { promo: Promo | null | undefined; now: number } {
  const [sale, setSale] = useState<Sale | null | undefined>(undefined);
  useEffect(() => {
    setSale(undefined);
    if (!chain) return;
    let live = true;
    readSale(chain).then((s) => live && setSale(s), () => live && setSale(null));
    return () => void (live = false);
  }, [chain]);
  const now = chain ? Math.floor(chain.now() / 1000) : 0;
  return { promo: !chain || sale === undefined ? undefined : sale && saleAt(sale, now), now };
}

/** The wave's Legendary turning (his turntable; still, as his thumbnail, where motion is reduced). */
const Turning = ({ id, className }: { id: number; className: string }) => (
  <picture className={className}>
    <source media="(prefers-reduced-motion: no-preference)" srcSet={`/gnomes/turn/${id}.webp`} />
    <img src={thumb(id)} alt="" width={256} height={256} decoding="async" />
  </picture>
);

/** The menu's fourth card, beside Solo, Duel and the Builder: the wave on sale, its Legendary turning, three of its
 *  gnomes, its lowest price, and "See the gnomes". The card is the button (one action), as the games' are. */
export function GnomesCard({ promo, now, onOpen }: { promo: Promo | null | undefined; now: number; onOpen: () => void }) {
  const w = promo ? promoWords(promo, now) : null;
  return (
    <button className="mode mode--gnomes" aria-label={w ? `The gnomes: ${w.title}, ${w.line}. ${w.state}. See the gnomes` : "The gnomes: see the collection"}
      onClick={() => (sound("select"), onOpen())}>
      <span className="mode__stage">
        {promo?.legendary ? <Turning id={promo.legendary.id} className="gpromo__legend" /> : <span className="gpromo__legend" />}
        <span className="gpromo__faces" aria-hidden="true">{(promo?.faces || []).map((f) => <img key={f.id} src={thumb(f.id)} alt="" width={64} height={64} loading="lazy" />)}</span>
      </span>
      <span className="mode__name">Gnomes</span>
      <span className="mode__line">{w ? <>{w.title} · {w.line}<br /><span className="gpromo__state">{w.state}</span></> : "The collection: 720 gnomes to play with"}</span>
      <span className="btn btn--gold gpromo__go" aria-hidden="true">See the gnomes</span>
    </button>
  );
}

/** The picker's Collection section, at its top: the player's own gnomes first (owned) and the whole collection a
 *  tap away; else one band that is the gallery's door: the wave's Legendary and three of its gnomes, the wave in a
 *  line, "See the collection". */
export function CollectionSection({ promo, now, owned, onOpen }: { promo: Promo | null | undefined; now: number; owned: ReactNode; onOpen: () => void }) {
  const w = promo ? promoWords(promo, now) : null;
  const open = () => (sound("blip"), onOpen());
  if (owned) return <section className="gcollect" aria-label="Your gnomes">{owned}<button className="linkish gcollect__all" onClick={open}>See the whole collection →</button></section>;
  const faces: { id: number; tier: Tier }[] = [...(promo?.legendary ? [{ id: promo.legendary.id, tier: "legendary" as const }] : []), ...(promo?.faces || [])];
  return (
    <button type="button" className="gcollect gcollect--door" onClick={open} aria-label={`The collection${w ? `: ${w.title}, ${w.line}` : ""}. See the collection`}>
      <span className="gcollect__faces" aria-hidden="true">
        {faces.map((f) => <Tile key={f.id} id={f.id} tier={f.tier} lazy={false} />)}
      </span>
      <span className="gcollect__text">
        <b>The collection</b>
        <span>{w ? `${w.title} · ${w.line}` : "720 gnomes, each one of a kind"}</span>
        <small>Cosmetic only: the same ball, the same physics.</small>
      </span>
      <span className="btn btn--gold gcollect__go" aria-hidden="true"><span className="gcollect__long">See the collection</span><span className="gcollect__short">See ›</span></span>
    </button>
  );
}

/** The finish card's one line, under its actions: the wave on sale, a tap to the gallery. */
export function PromoLine({ promo, now, onOpen }: { promo: Promo | null | undefined; now: number; onOpen: () => void }) {
  if (!promo) return null;
  const w = promoWords(promo, now);
  return <p className="gpromo__line"><button className="linkish" onClick={() => (sound("blip"), onOpen())}>{w.title}: {w.line} →</button></p>;
}
