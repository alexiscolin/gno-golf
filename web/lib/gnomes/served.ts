// The catalogue as the site serves it (public/gnomes/catalogue.json, made by
// scripts/gnomeassets.mjs from data/gnomes.json): every gnome's number, tier,
// wave, world, name, line and traits, the earned kinds. Read once a visit,
// by the shop and by the picker (to name the gnomes a player holds); a
// failed read is asked again the next time.
import type { Listed } from "./catalogue";

export interface Served { gnomes: Listed[]; earned: { kind: number; unlock: string; name: string; line: string; traits: string }[] }

let asked: Promise<Served> | null = null;
/** The served catalogue, once a visit. */
export function served(get: (url: string) => Promise<Response> = (u) => fetch(u)): Promise<Served> {
  return (asked ||= get("/gnomes/catalogue.json")
    .then((r) => (r.ok ? (r.json() as Promise<Served>) : Promise.reject(new Error("The gnomes' catalogue did not load."))))
    .then((v) => (Array.isArray(v.gnomes) && Array.isArray(v.earned) ? v : Promise.reject(new Error("The gnomes' catalogue is not one this page can read."))))
    .catch((e: unknown) => ((asked = null), Promise.reject(e instanceof Error ? e : new Error(String(e))))));
}
