// The gnome collection as data (data/gnomes.json, made by scripts/gnomes.ts
// from data/gnomes/): its series, their worlds, and every token's name, line,
// traits and look. What a screen needs to show, sort and filter gnomes is
// here, with no 3D: the gallery, the token page, the mint and the locker
// read it (docs/gnomes/design.md, "For the screens").
import { colourName, type Archetype, type Home, type Tier } from "./vocab";
import { decode, type Traits } from "./codec";
import { cap, worldName } from "../card";
import type { Skin } from "../scene/gnome";

/** The tiers a series sells, in id order within a world. */
export const SALE_TIERS = ["common", "rare", "epic", "legendary"] as const;
export type SaleTier = (typeof SALE_TIERS)[number];

/** A series as data/gnomes/series.json writes it: its supply and its worlds. */
export interface SeriesConfig {
  id: string;
  /** its code in a token's traits (Traits.series) */
  code: number;
  name: string;
  /** its first token id */
  first: number;
  supply: Record<SaleTier, number>;
  /** its worlds, each one run of its ids, in id order */
  worlds: Home[];
  /** the generator's seed: the same seed, the same gnomes */
  seed: string;
  /** on sale (its rows sent to the realm): its looks are final, held by data/gnomes/looks.golden.json */
  released: boolean;
  /** the realm's starting sale settings (its owner's to change) */
  sale: Record<string, unknown>;
}

/** A world's run of a series as planned: its home, and how many of each tier from which id. */
export interface Run {
  home: Home;
  first: number;
  last: number;
  tiers: Record<SaleTier, { first: number; count: number }>;
}

/** n shared over k as evenly as can be, the first ones taking what is left over. */
export const evenly = (n: number, k: number) => Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));

/** A series' plan: a run of ids a world, its Commons, Rares, Epics and Legendaries in turn, the tiers shared
 *  evenly over the worlds. Every count comes from the config. */
export function planSeries(s: SeriesConfig): Run[] {
  const per = Object.fromEntries(SALE_TIERS.map((t) => [t, evenly(s.supply[t], s.worlds.length)])) as Record<SaleTier, number[]>;
  let id = s.first;
  return s.worlds.map((home, i) => {
    const first = id;
    const tiers = Object.fromEntries(SALE_TIERS.map((t) => {
      const r = { first: id, count: per[t][i] };
      id += r.count;
      return [t, r];
    })) as Run["tiers"];
    return { home, first, last: id - 1, tiers };
  });
}

/** A token of the catalogue. */
export interface Entry {
  id: number;
  series: string;
  tier: Tier;
  home: Home;
  archetype: Archetype;
  name: string;
  line: string;
  /** its look as the realm stores it (codec.ts) */
  traits: string;
  /** the same look as makeBall takes it (skin.ts skinOf: what the traits draw) */
  skin: Skin;
}

/** data/gnomes.json. */
export interface Catalogue {
  version: 1;
  /** the traits' format (codec.ts FORMAT) */
  format: number;
  note: string;
  series: (SeriesConfig & { plan: Run[] })[];
  /** the tables a token's traits are codes into (vocab.ts, props.ts), colours as "#rrggbb", as the realm draws its portrait */
  vocab: Record<string, readonly (string | readonly [string, string])[]>;
  /** the nine earned gnomes, by kind: minted free to whoever proves the feat, never sold */
  earned: { kind: number; unlock: string; name: string; line: string; traits: string }[];
  gnomes: Entry[];
}

/** How a tier shows, everywhere: its name, its frame, the ground a thumbnail
 *  stands on and its plinth. Grey, blue, purple, gold: the order games use. */
export const TIER_LOOK: Readonly<Record<Tier, { label: string; frame: number; ground: number; plinth: number }>> = {
  earned: { label: "Earned", frame: 0x226c57, ground: 0xe8f1ec, plinth: 0xb9d4c6 },
  common: { label: "Common", frame: 0x8b939a, ground: 0xf3eee4, plinth: 0xd9d0c0 },
  rare: { label: "Rare", frame: 0x3f6aa8, ground: 0xe4ecf7, plinth: 0xbfd0ea },
  epic: { label: "Epic", frame: 0x7a4fc0, ground: 0xede5f7, plinth: 0xd3c3ec },
  legendary: { label: "Legendary", frame: 0xd9962b, ground: 0xfbf0d6, plinth: 0xf0d79a },
};

// the words a trait list uses for codes that are not plain English already
const WORDS: Record<string, string> = {
  tall: "tall cone", tophat: "top hat", souwester: "sou'wester", pith: "pith helmet", mill: "windmill", bowtie: "bow tie",
  stormwatch: "storm watcher", none: "clean-shaven", chops: "mutton chops", braids: "braided",
};
/** A code as people say it ("stormwatch": "storm watcher"). */
export const wordOf = (s: string) => (WORDS[s] ?? s.replace(/-/g, " "));
const word = wordOf;

/** A token's traits as a list for people (the token page, the realm's
 *  metadata attributes): what is there, plainly named, nothing that is not. */
export function traitRows(t: Traits): { trait: string; value: string }[] {
  const rows: [string, string][] = [
    ["Tier", t.tier], ["Home", worldName(t.home)], ["Archetype", t.archetype],
    ["Hat", `${colourName(t.hatColour ?? -1)} ${word(t.hat)}`], ["Beard", t.beard === "none" ? word("none") : `${colourName(t.hair ?? -1)} ${word(t.beard)}`],
    ["Body", t.pattern === "plain" ? colourName(t.body ?? -1) : `${colourName(t.body ?? -1)} ${t.pattern}, ${colourName(t.patternColour ?? -1)}`],
    ...t.accessories.map((a): [string, string] => ["Wears", word(a)]),
    ["Piece", t.piece ? `${colourName(t.pieceColour ?? -1)} ${word(t.piece)}` : ""],
    ["Material", t.material === "toon" ? "" : t.material], ["Prop", t.prop ? word(t.prop) : ""],
    ["Trail", t.trail ? `${colourName(t.trailColour ?? -1)} ${t.trail}` : ""], ["Holing", t.holing === "confetti" ? "" : `${colourName(t.holingColour ?? -1)} ${t.holing}`],
  ];
  return rows.filter(([, v]) => v.trim()).map(([trait, value]) => ({ trait, value: cap(value.trim()) }));
}

/** A token as the site serves the catalogue (public/gnomes/catalogue.json, scripts/gnomeassets.mjs): its look
 *  as traits alone, drawn when needed (skin.ts skinOfTraits). */
export type Listed = Omit<Entry, "skin">;

/** What a gallery filters on; an empty field filters nothing. */
export interface Query { series?: string; tier?: Tier; home?: Home; archetype?: Archetype; hat?: string; trail?: boolean; text?: string }

/** The entries a query keeps, in id order. */
export function filterGnomes<E extends Listed>(list: readonly E[], q: Query): E[] {
  const text = q.text?.trim().toLowerCase();
  return list.filter((e) => {
    if ((q.series && e.series !== q.series) || (q.tier && e.tier !== q.tier)) return false;
    if ((q.home && e.home !== q.home) || (q.archetype && e.archetype !== q.archetype)) return false;
    if (q.hat || q.trail !== undefined) {
      const t = decode(e.traits);
      if (!t || (q.hat && t.hat !== q.hat) || (q.trail !== undefined && !!t.trail !== q.trail)) return false;
    }
    return !text || e.name.toLowerCase().includes(text) || e.line.toLowerCase().includes(text);
  });
}

/** Every look the golden file holds (data/gnomes/looks.golden.json): each
 *  token by its id, each earned kind as "earned:<kind>"; whether it is
 *  released (its series', or always, for an earned one): its look is then final. */
export function goldenKeys(c: Catalogue) {
  const released = new Set(c.series.filter((s) => s.released).map((s) => s.id));
  return [
    ...c.earned.map((e) => ({ key: `earned:${e.unlock}`, traits: e.traits, name: e.name, released: true })),
    ...c.gnomes.map((g) => ({ key: String(g.id), traits: g.traits, name: g.name, released: released.has(g.series) })),
  ];
}
