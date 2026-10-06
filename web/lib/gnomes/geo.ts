// The shop's region gate, at zero server cost (ADR-007, "Where the shop
// opens"). The free game plays everywhere; the gnome shop is not offered in
// the countries below. Netlify answers /geo.json from the visitor's country
// (netlify.toml: a 200 rewrite to /geo-blocked.json for them, and their
// /g/* pages to /unavailable/), the client reads it once when the shop would
// open, and a blocked answer hides the shop, its links and every buy, bid and
// equip. Best effort: a VPN gets round it, and the realm stays callable with
// gnokey; it is what a static site can do without a server. A dev build
// opened with ?geo=blocked reads the blocked answer (testhooks.ts geoBlocked).
import { geoBlocked } from "../testhooks";

/**
 * The countries the shop is not offered in, ISO 3166-1 alpha-2: mainland
 * China (CN), and the comprehensive sanctions (CU Cuba, IR Iran, KP North
 * Korea, SY Syria, RU Russia, BY Belarus). The one list: netlify.toml's
 * country rules carry it as it is here (web/test/geo.test.ts holds them to it).
 */
export const BLOCKED = ["CN", "CU", "IR", "KP", "SY", "RU", "BY"] as const;

/** What /geo.json says: whether the shop opens here. Anything but a clear yes is no (not served, offline,
 *  another shape): the shop stays shut, the game plays on. */
export async function readGeo(get: (url: string) => Promise<Response> = (u) => fetch(u, { cache: "no-cache" }), blocked = geoBlocked()) {
  try {
    const r = await get(blocked ? "/geo-blocked.json" : "/geo.json");
    if (!r.ok) return false;
    const v = (await r.json()) as { shop?: unknown } | null;
    return !!v && v.shop === true;
  } catch {
    return false;
  }
}

let asked: Promise<boolean> | null = null;
/** readGeo, once a visit. */
export const shopInRegion = (get?: (url: string) => Promise<Response>) => (asked ||= readGeo(get));
