// The shop's region gate, at zero server cost (ADR-007, "Where the shop
// opens"). The free game plays everywhere; the gnome shop is not offered in
// the countries below. Netlify answers /geo.json from the visitor's country
// (netlify.toml: a 200 rewrite to /geo-blocked.json for them, and their
// /g/* pages to /unavailable/; to /geo-open.json for everyone else), the
// client reads it once when the shop would open, and a blocked answer hides
// the shop, its links and every buy and equip. The file itself says shut: a
// host without those rules (IPFS, any static host, a local preview) never
// opens the shop. Best effort: a VPN gets round it, and the realm stays
// callable with gnokey; it is what a static site can do without a server.
// Where the test hooks answer (a dev build, the playground), the gate reads
// the open answer, or the blocked one with ?geo=blocked (testhooks.ts geoAs).
import { geoAs } from "../testhooks";

/**
 * The countries the shop is not offered in, ISO 3166-1 alpha-2: mainland
 * China (CN), and the comprehensive sanctions (CU Cuba, IR Iran, KP North
 * Korea, SY Syria, RU Russia, BY Belarus). The one list: netlify.toml's
 * country rules carry it as it is here (web/test/geo.test.ts holds them to it).
 */
export const BLOCKED = ["CN", "CU", "IR", "KP", "SY", "RU", "BY"] as const;

/** What /geo.json says: whether the shop opens here, anything but a clear yes a no; null when it could not be read
 *  (offline, not served, not JSON): no answer, the shop shut meanwhile, the game playing on. */
export async function readGeo(get: (url: string) => Promise<Response> = (u) => fetch(u, { cache: "no-cache" }), as = geoAs()): Promise<boolean | null> {
  try {
    const r = await get(as ? `/geo-${as}.json` : "/geo.json");
    if (!r.ok) return null;
    const v = (await r.json()) as { shop?: unknown } | null;
    return !!v && v.shop === true;
  } catch {
    return null;
  }
}

let asked: Promise<boolean | null> | null = null;
/** readGeo, once a visit: an answer is kept, a read that failed is asked again the next time. */
export const shopInRegion = (get?: (url: string) => Promise<Response>) =>
  (asked ||= readGeo(get).then((v) => (v === null && (asked = null), v)));
/** Whether the shop shows at all: the build's (NEXT_PUBLIC_GNOMES) and a region that answered yes (null: not yet). */
export const shopShown = (flag: boolean, region: boolean | null) => flag && region === true;
