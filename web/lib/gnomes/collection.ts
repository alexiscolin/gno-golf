// The collection as status (ADR-011): no gift, no draw, nothing to win. What
// a player holds shows as an album (each world, each tier, each archetype's
// set, from the catalogue's own data, a silhouette for each one missing) and
// as a collector rank beside their name wherever they appear (the boards, a
// duel's ghost, the picker, their gnomes' page), worked out here from the
// realm's rows, in the browser. The thresholds are COLLECTOR's, the one place
// they are written; every surface reads this module, and its words are the
// ones on screen.
//
// Reads: a player's rank is one page of GnomesOf (the realm lists a wallet
// best first, so its first 100 rows hold everything a rank asks), read only
// for a player the board's faces found wearing a gnome (WornMany, already
// read for the faces: wear.ts askWorn), a few at a time, once a visit for
// each chain and address.
import { isAddress, type Chain } from "../chain";
import { worldName } from "../card";
import { wordOf, type Listed } from "./catalogue";
import { makeShop, type Held } from "./shop";
import { askWorn, wornKnown } from "./wear";
import { shopShown } from "./geo";
import type { Served } from "./served";

// ------------------------------------------------------------ the one config
/** What a gnome counts towards a rank, by tier (an earned one too: proof of play), and the ranks in order: each
 *  from its points, the top one with a Legendary held as well. Change a number here and every surface follows. */
export const COLLECTOR = {
  points: { common: 1, rare: 2, epic: 4, legendary: 8, earned: 1 } as Readonly<Record<string, number>>,
  ranks: [
    { id: "bronze", label: "Bronze", points: 1 },
    { id: "silver", label: "Silver", points: 8 },
    { id: "gold", label: "Gold", points: 20 },
    { id: "legendary", label: "Legendary", points: 36, holds: "legendary" },
  ],
} as const;
export type Rank = (typeof COLLECTOR.ranks)[number];
export type RankId = Rank["id"];

/** What a player holds as a rank reads it: how many in all, and the rows read (GnomesOf's first page, or all). */
export interface Holding { total: number; rows: readonly { id: string; tier: string }[] }
const NONE: Holding = { total: 0, rows: [] };

/** A holding's points: each row its tier's, a row past those read the least a gnome counts (the realm lists best first). */
export function pointsOf(h: Holding) {
  const least = Math.min(...Object.values(COLLECTOR.points));
  return h.rows.reduce((n, r) => n + (COLLECTOR.points[r.tier] ?? 0), 0) + Math.max(0, h.total - h.rows.length) * least;
}
const reaches = (h: Holding, r: Rank, points = pointsOf(h)) => points >= r.points && (!("holds" in r) || h.rows.some((x) => x.tier === r.holds));
/** The highest rank a holding reaches, null for none (nothing held). */
export function rankOf(h: Holding): Rank | null {
  const points = pointsOf(h);
  return [...COLLECTOR.ranks].reverse().find((r) => reaches(h, r, points)) ?? null;
}
/** The rank above, and the points it still asks (0: only its Legendary), null at the top. */
export function nextRank(h: Holding): { rank: Rank; points: number } | null {
  const now = rankOf(h), at = now ? COLLECTOR.ranks.indexOf(now) + 1 : 0, rank = COLLECTOR.ranks[at];
  return rank ? { rank, points: Math.max(0, rank.points - pointsOf(h)) } : null;
}

// ------------------------------------------------------------ the words (the only ones the surfaces show)
/** A rank as a badge says it: "Collector gold". */
export const rankWords = (r: Rank) => `Collector ${r.label.toLowerCase()}`;
/** What a badge says on hover and to a screen reader: the rank and what it stands for. */
export const rankTitle = (r: Rank) => `${rankWords(r)}: a collection of ${r.points} ${r.points === 1 ? "point" : "points"} or more${"holds" in r ? ", a Legendary among them" : ""}`;
/** A player's own rank in one line, and the next one plainly: "Collector silver · 9 points · gold at 20". */
export function rankLine(h: Holding) {
  const now = rankOf(h), next = nextRank(h), points = pointsOf(h);
  if (!now) return "No gnome yet";
  const then = next ? ` · ${next.rank.label.toLowerCase()} at ${next.rank.points}${"holds" in next.rank ? ", with a Legendary" : ""}` : "";
  return `${rankWords(now)} · ${points} ${points === 1 ? "point" : "points"}${then}`;
}
/** How the points are counted, said once under the album. */
export const howRanks = () => {
  const p = COLLECTOR.points;
  return `Each gnome counts towards a collector rank: a Common ${p.common}, a Rare ${p.rare}, an Epic ${p.epic}, a Legendary ${p.legendary}, an earned one ${p.earned}. `
    + COLLECTOR.ranks.map((r) => `${r.label} from ${r.points}${"holds" in r ? " with a Legendary" : ""}`).join(", ")
    + ". The rank only shows what you hold: it changes nothing in play.";
};
export const ALBUM_WORDS = {
  title: "Your album", theirs: "Their album", worlds: "Worlds", tiers: "Tiers", sets: "Sets",
  missing: "Not in the album yet", open: "Your album",
};

// ------------------------------------------------------------ the album
/** One slot of a row: a gnome of the catalogue (id) or an earned kind (unlock), and whether it is held. */
export interface Slot { key: string; id?: number; unlock?: string; tier: string; name: string; mine: boolean }
/** One row of the album: a world, a tier or a set, its slots in id order, how many held. */
export interface Progress { key: string; label: string; have: number; of: number; items: readonly Slot[] }
export interface Album { worlds: Progress[]; tiers: Progress[]; sets: Progress[]; have: number; unknown: number }
type Owned = readonly { id: string | number; tier?: string; traits?: string }[];
type Gnome = Pick<Listed, "id" | "tier" | "home" | "archetype" | "name">;

const TIER_ROWS: readonly (readonly [string, string])[] = [["common", "Commons"], ["rare", "Rares"], ["epic", "Epics"], ["legendary", "Legendaries"], ["earned", "Earned"]];
const setLabel = (archetype: string) => `All the ${wordOf(archetype)}s`;
/** A player's album: what they hold (GnomesOf's rows) against the catalogue, by world, by tier and by archetype,
 *  each in the catalogue's order and only those it carries. An earned gnome is known by its traits; an id the
 *  catalogue lacks (a later series, a kind this page does not know) is counted apart, in no row. */
export function album(gnomes: readonly Gnome[], earned: Served["earned"], owned: Owned): Album {
  const ids = new Set<number>(), kinds = new Set<string>(), byId = new Map(gnomes.map((g) => [g.id, g]));
  let unknown = 0;
  for (const o of owned) {
    const id = Number(o.id), kind = id > 1_000_000 ? earned.find((e) => e.traits === o.traits) : undefined;
    if (kind) kinds.add(kind.unlock);
    else if (byId.has(id)) ids.add(id);
    else unknown++;
  }
  const slots = gnomes.map((g): Slot => ({ key: String(g.id), id: g.id, tier: g.tier, name: g.name, mine: ids.has(g.id) }));
  const earnedSlots = earned.map((e): Slot => ({ key: `earned:${e.unlock}`, unlock: e.unlock, tier: "earned", name: e.name, mine: kinds.has(e.unlock) }));
  const row = (key: string, label: string, items: readonly Slot[]): Progress => ({ key, label, items, of: items.length, have: items.filter((s) => s.mine).length });
  const groups = (field: "home" | "archetype", label: (k: string) => string) =>
    [...new Set(gnomes.map((g) => g[field]))].map((k) => row(k, label(k), slots.filter((_, i) => gnomes[i][field] === k)));
  return {
    worlds: groups("home", worldName),
    tiers: TIER_ROWS.map(([t, label]) => row(t, label, t === "earned" ? earnedSlots : slots.filter((s) => s.tier === t))).filter((p) => p.of > 0),
    sets: groups("archetype", setLabel),
    have: ids.size + kinds.size,
    unknown,
  };
}
/** The gallery's one line of it: a world's row ("Garden 3/104"), that world, else the one most filled. */
export function albumLine(a: Album, home?: string) {
  const w = a.worlds.find((x) => x.key === home) ?? [...a.worlds].sort((x, y) => y.have / y.of - x.have / x.of)[0];
  return w ? `${w.label} ${w.have}/${w.of}` : "";
}

// ------------------------------------------------------------ where it shows (ADR-011)
/** The album: where the shop is offered (the build's flag and a region that answered yes), as the shop itself. */
export const albumShown = (flag: boolean, region: boolean | null) => shopShown(flag, region);
/** The ranks: wherever the shop is built, every region alike, as the gnome a player wears (a fact of the chain,
 *  never a door to the shop: a badge is not a link). */
export const ranksShown = (flag: boolean) => flag;

// ------------------------------------------------------------ the reader
export interface Reads {
  /** whether a player holds any gnome (they wear one), null when not known: their page is read then */
  holds: (player: string) => Promise<boolean | null>;
  /** a player's first page of gnomes */
  page: (player: string) => Promise<Pick<Held, "total" | "rows">>;
}
const listeners = new Set<() => void>();
let version = 0;
const told = () => (version++, listeners.forEach((f) => f()));
/** Called whenever a holding is learnt (a badge to draw); returns its unsubscribe. */
export const onCollectors = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
/** A number that moves with every holding learnt: React's useSyncExternalStore snapshot. */
export const collectorsVersion = () => version;

/** Players' holdings, each read once (a failed read again next time), at most limit pages at a time. */
export function makeCollectors(reads: Reads, limit = 4) {
  const asked = new Map<string, Promise<Holding>>(), known = new Map<string, Holding>(), queue: (() => void)[] = [];
  let running = 0;
  const run = <T>(f: () => Promise<T>) => new Promise<T>((done, fail) => {
    const go = () => {
      running++;
      f().then(done, fail).finally(() => (running--, queue.shift()?.()));
    };
    if (running < limit) go();
    else queue.push(go);
  });
  return {
    /** What a player holds, as a rank reads it. */
    holding(player: string): Promise<Holding> {
      if (!isAddress(player)) return Promise.resolve(NONE);
      let p = asked.get(player);
      if (!p) {
        p = reads.holds(player).then((h) => (h === false ? NONE : run(() => reads.page(player)).then((x) => ({ total: x.total, rows: x.rows }))));
        asked.set(player, p);
        p.then((h) => (known.set(player, h), told()), () => asked.delete(player));
      }
      return p;
    },
    /** What is known already: the first frame draws it at once. */
    peek: (player: string) => known.get(player),
    /** What the page has read already (a player's own gnomes, every page): kept, no read. */
    know(player: string, h: Holding) {
      asked.set(player, Promise.resolve(h));
      known.set(player, h);
      told();
    },
  };
}
export type Collectors = ReturnType<typeof makeCollectors>;

const chains = new WeakMap<object, Collectors>();
/** A chain's collectors: their pages read from its gnomes realm, the faces' WornMany telling who holds none. */
export function collectorsOf(chain: Pick<Chain, "qjson" | "qstr">): Collectors {
  let k = chains.get(chain);
  if (!k) {
    const shop = makeShop(chain);
    k = makeCollectors({
      holds: (p) => askWorn((ps) => shop.wornMany(ps), p).then(() => {
        const w = wornKnown(p);
        return w === undefined ? null : w !== null;
      }),
      page: (p) => shop.gnomesOf(p, 0),
    });
    chains.set(chain, k);
  }
  return k;
}
