"use client";

// The collection on the game's own screens, behind NEXT_PUBLIC_GNOMES and the
// region gate (the caller's): the menu's shop panel's gnome and line, the
// picker's Collection section at its top, the finish card's one line. What
// they say is the gallery's own (lib/gnomes/shop.ts promoOf, promoWords: the
// wave to see, its size, its lowest price, its Legendary), read once a visit.
// Plain words, dates and counts: never a countdown, never "only" or "last".
import "@/app/gnomes.css";
import type { ReactNode } from "react";
import type { Chain } from "@/lib/chain";
import { gnot, promoWords, type Promo } from "@/lib/gnomes/shop";
import { know } from "@/lib/gnomes/wear";
import type { Skin } from "@/lib/scene/gnome";
import { readSale } from "@/lib/gnomes/promo";
import { SHOP_LINE } from "@/lib/gnomes/door";
import type { Tier } from "@/lib/gnomes/vocab";
import { sound } from "@/lib/feel";
import { Tile } from "./parts";

/** The menu's shop panel's gnome: the wave's Epic (a gnome's size, as the games' panels show theirs), else its
 *  Legendary, its id; 0 for none. */
export const shopFace = (promo: Promo | null | undefined) => promo?.faces.find((f) => f.tier === "epic")?.id ?? promo?.legendary?.id ?? 0;
/** That gnome as the game draws him (his traits from the catalogue, the collection's wardrobe fetched first); null for
 *  none. */
export const shopSkinOf = (chain: Chain, id: number): Promise<Skin | null> =>
  readSale(chain)
    .then((sale) => sale.gnomes.find((g) => g.id === id))
    .then((g) => (g ? know([{ id: String(g.id), name: g.name, traits: g.traits }]) : []))
    .then(([s]) => s || null);

/** The shop panel's line: what it is, and the wave's lowest price when there is one. */
export const shopLine = (promo: Promo | null | undefined) => `${SHOP_LINE}${promo && promo.from > 0 ? `, from ${gnot(promo.from)} GNOT` : ""}`;

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
