"use client";

// The gnome shop's part of the game's own screens, one chunk (Door.tsx
// fetches it, NEXT_PUBLIC_GNOMES on; a build without the flag has no such
// chunk): the menu's panel's sale and gnome, the picker's Collection section
// and the player's own row, the finish card's line, the collector badges,
// what a player holds and wears, and the shop's screen (its own chunk again,
// fetched once a door to it shows; its frame while it downloads).
import { useEffect, useState } from "react";
import type { Chain } from "@/lib/chain";
import { chunk } from "@/lib/chunk";
import { closingSlot, makeShop } from "@/lib/gnomes/shop";
import { knownSale } from "@/lib/gnomes/promo";
import { served } from "@/lib/gnomes/served";
import { know } from "@/lib/gnomes/wear";
import { collectorsOf } from "@/lib/gnomes/collection";
import { ShopSkeleton } from "./ShopFrame";
import type { ShopProps } from "./Shop";
import type { OwnedProps } from "./Owned";

export { CollectionSection, PromoLine, shopFace, shopLine, shopSkinOf } from "./Promo";
export { default as Collector } from "./Rank";
export { readSale, saleAt } from "@/lib/gnomes/promo";
export { askWorn, playing } from "@/lib/gnomes/wear";
export { skinOfTraits } from "@/lib/gnomes/skin";
export { makeShop };

/** What a player holds (their gnomes named from the catalogue, best first), what they wear for everyone, and their
 *  gnomes' skins known to the game (null: the wardrobe not fetched); their collector rank known on the way (ADR-011). */
export async function readHeld(chain: Chain, me: string) {
  const shop = makeShop(chain);
  const [rows, worn] = await Promise.all([shop.allOf(me), shop.worn(me).catch(() => null)]);
  collectorsOf(chain).know(me, { total: rows.length, rows }); // (every page counted)
  const listed = rows.length ? new Map((await served().catch(() => ({ gnomes: [] }))).gnomes.map((g) => [String(g.id), g])) : new Map<string, { name: string; home: string }>();
  const mine = rows.map((r) => ({ ...r, name: listed.get(r.id)?.name || `Gnome ${r.id}`, home: listed.get(r.id)?.home || "" }));
  const skins = await know(worn ? [...mine, worn] : mine).catch(() => null);
  return { mine, worn, skins };
}

// the shop's screen, its own chunk (lib/chunk.ts), fetched early once a door to it shows (prefetchShop); while it
// downloads, its frame (ShopFrame) with the shop's own Back and About, and Try again if it could not come
const shopChunk = chunk(() => import("./Shop"));
/** The shop's screen fetched ahead, once a door to it shows: opening it then draws at once. */
export const prefetchShop = () => shopChunk.prefetch();
export function ShopScreen(props: ShopProps) {
  const [Screen, setLoaded] = useState(() => shopChunk.value()?.default);
  const [failed, setFailed] = useState(false), [tries, setTries] = useState(0);
  useEffect(() => {
    if (Screen) return;
    let live = true;
    setFailed(false);
    shopChunk.load().then((m) => live && setLoaded(() => m.default), () => live && setFailed(true));
    return () => void (live = false);
  }, [Screen, tries]);
  if (Screen) return <Screen {...props} />;
  const closing = closingSlot(knownSale(props.chain)?.c ?? null);
  return <ShopSkeleton onBack={props.onBack} onAbout={props.onAbout} closing={closing} keeper={props.keeper} onRetry={failed ? () => setTries((t) => t + 1) : undefined} />;
}
// the picker's row of the player's gnomes, the same way: nothing while it downloads or if it could not come (the
// collection's door stays), asked again the next time the picker shows it
const ownedChunk = chunk(() => import("./Owned"));
export function OwnedRow(props: OwnedProps) {
  const [Row, setLoaded] = useState(() => ownedChunk.value()?.default);
  useEffect(() => {
    if (Row) return;
    let live = true;
    ownedChunk.load().then((m) => live && setLoaded(() => m.default), () => {});
    return () => void (live = false);
  }, [Row]);
  return Row ? <Row {...props} /> : null;
}
