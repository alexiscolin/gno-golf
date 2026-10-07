"use client";

// The gnome shop's door, all of the shop the game's first load carries
// (test/bundle.test.ts): its part of the game (Game.tsx) is a chunk fetched
// the first time a screen wants it, an import() under the flag as the build
// writes it, so a build with NEXT_PUBLIC_GNOMES off has no such chunk at all
// and every piece here draws nothing. The pieces stand in for Game.tsx's:
// nothing until it is in (a badge, a section, a line that arrive as they did
// once read), then the very same.
import { useEffect, useState, type ComponentProps } from "react";
import { chunk } from "@/lib/chunk";
import type { Chain } from "@/lib/chain";
import type { Promo } from "@/lib/gnomes/shop";
import type { Sale } from "@/lib/gnomes/promo";
import type { Skin } from "@/lib/scene/gnome";

import type * as Game from "./Game";

type Part = typeof Game;
const part = process.env.NEXT_PUBLIC_GNOMES === "1" ? chunk(() => import("./Game")) : null;

/** The shop's part of the game, fetched once (a failed fetch asked again next time); null where the shop is off. */
export const shopPart = (): Promise<Part> | null => (part ? part.load() : null);

/** The shop's part, fetched once a screen wants it (want), null until it is in (and for good where the shop is off). */
export function useShopPart(want = true): Part | null {
  const [m, setM] = useState<Part | null>(() => part?.value() ?? null);
  useEffect(() => {
    if (!part || m || !want) return;
    let live = true;
    part.load().then((x) => live && setM(x), () => {});
    return () => void (live = false);
  }, [m, want]);
  return m;
}

/** The sale on this chain (lib/gnomes/promo.ts, read once a chain) as the screens show it now, by the chain's clock
 *  (whole seconds, as the gallery's): promo undefined while read, null for none; none at all without a chain. */
export function useSale(chain: Chain | null): { promo: Promo | null | undefined; now: number } {
  const m = useShopPart(!!chain);
  const [sale, setSale] = useState<Sale | null | undefined>(undefined);
  useEffect(() => {
    setSale(undefined);
    if (!chain || !m) return;
    let live = true;
    m.readSale(chain).then((s) => live && setSale(s), () => live && setSale(null));
    return () => void (live = false);
  }, [chain, m]);
  const now = chain ? Math.floor(chain.now() / 1000) : 0;
  return { promo: !chain || !m || sale === undefined ? undefined : sale && m.saleAt(sale, now), now };
}

/** The menu's shop panel's gnome (Promo.tsx shopFace) as the game draws him; null until he is known. */
export function useShopSkin(chain: Chain | null, promo: Promo | null | undefined): Skin | null {
  const m = useShopPart(!!chain);
  const [skin, setSkin] = useState<Skin | null>(null);
  const id = m ? m.shopFace(promo) : 0;
  useEffect(() => {
    if (!chain || !m || !id) return setSkin(null);
    let live = true;
    m.shopSkinOf(chain, id).then((s) => live && setSkin(s), () => live && setSkin(null));
    return () => void (live = false);
  }, [chain, m, id]);
  return skin;
}

/** What a player wears for everyone, asked with the page's other faces (wear.ts askWorn); nothing where the shop is off. */
export const askWorn = (chain: Chain, player: string) =>
  void shopPart()?.then((m) => m.askWorn((ps) => m.makeShop(chain).wornMany(ps), player), () => {});

// Game.tsx's pieces, drawn once it is in
export const Collector = (p: ComponentProps<Part["Collector"]>) => {
  const m = useShopPart(!!p.chain && !!p.player);
  return m ? <m.Collector {...p} /> : null;
};
export const CollectionSection = (p: ComponentProps<Part["CollectionSection"]>) => {
  const m = useShopPart();
  return m ? <m.CollectionSection {...p} /> : null;
};
export const PromoLine = (p: ComponentProps<Part["PromoLine"]>) => {
  const m = useShopPart();
  return m ? <m.PromoLine {...p} /> : null;
};
export const ShopScreen = (p: ComponentProps<Part["ShopScreen"]>) => {
  const m = useShopPart();
  return m ? <m.ShopScreen {...p} /> : null;
};
export const Owned = (p: ComponentProps<Part["OwnedRow"]>) => {
  const m = useShopPart();
  return m ? <m.OwnedRow {...p} /> : null;
};
