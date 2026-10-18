// The sale the game's own screens promote (components/gnomes/Promo: the
// menu's Gnomes card, the picker's Collection section, the finish card's
// line): the collection, what was sold and the catalogue, read once a chain
// (a failed read is asked again the next time); its state worked out from the
// clock at each use (shop.ts promoOf), so a players' window that ends or a
// sale that opens shows without a new read.
import type { Chain } from "../chain";
import { makeShop, nowRow, promoOf, type Collection, type Promo } from "./shop";
import { served, type Served } from "./served";

export interface Sale { c: Collection; sold: (id: number) => boolean; gnomes: Served["gnomes"]; served: Served }

const sales = new WeakMap<object, Promise<Sale>>(), read = new WeakMap<object, Sale>();
/** The sale on this chain once read (the menu reads it as it shows its shop panel), null until then: what the shop draws
 *  its first frame from, before reading it again. */
export const knownSale = (chain: object) => read.get(chain) ?? null;
/** The sale on this chain, read once (catalogue: the served catalogue's reader). */
export function readSale(chain: Pick<Chain, "qjson" | "qstr">, catalogue: () => Promise<Served> = served): Promise<Sale> {
  let p = sales.get(chain);
  if (!p) {
    const shop = makeShop(chain);
    p = Promise.all([catalogue(), shop.collection(), shop.sold()]).then(([k, c, sold]) => ({ c, sold, gnomes: k.gnomes, served: k }));
    sales.set(chain, p);
    p.then((s) => read.set(chain, s), () => {});
    p.catch(() => sales.delete(chain));
  }
  return p;
}

/** What the screens promote at time now (unix seconds, the chain's clock), null for nothing. */
export const saleAt = (s: Sale, now: number): Promo | null => promoOf(nowRow(s.c, s.sold, s.gnomes, now, s.served.series), s.c, s.gnomes);
