// The gnomes' shop as the screens read it (the GUI spec, A): the realm's
// answers (r/gnogolf/gnomes, ADR-007) checked into these shapes, one query
// each, and what a screen decides from them, pure, so the tests hold every
// state: the sale's phase, why a gnome can't be bought in plain words, the
// bill before a signature, the auction's state, the gallery's shelf. The
// figures are all read: no price, cap or date is written here.
import { GNOMES_REALM, isAddress, type Chain } from "../chain";
import { TIER_LOOK, filterGnomes, type Entry, type Query } from "./catalogue";
import type { Home, Tier } from "./vocab";

/** The shop is on (NEXT_PUBLIC_GNOMES=1); off, the game is exactly as before it. */
export const SHOP = process.env.NEXT_PUBLIC_GNOMES === "1";

/** The tiers Buy sells; the last one of Collection's is auctioned. */
export const BUY_TIERS = ["common", "rare", "epic"] as const;
export type BuyTier = (typeof BUY_TIERS)[number];
type PerTier = Record<BuyTier, number>;

// ------------------------------------------------------------ the shapes (read.gno, auction.gno, equip.gno)
export interface TierRow { name: string; price: number; cap: number; playerCap: number; sold: number }
export interface SeriesRow { name: string; first: number; last: number; sold: number; closed: boolean }
export interface WaveRow { first: number; last: number; start: number; playersUntil: number; prices: number[] }
/** Collection(): the switch, the genesis's closing date (0: none set), the tiers, the series, the waves. */
export interface Collection {
  version: number; open: boolean; closesAt: number; owner: string; treasury: string; pendingTreasury: string; site: string; royaltyBps: number;
  tiers: TierRow[]; series: SeriesRow[]; waves: WaveRow[];
}
/** Gnome(id): one gnome, its owner ("" unsold) and its price. */
export interface GnomeRow { id: string; series: string; name: string; tier: string; traits: string; owner: string; price: number; sold: boolean; closed: boolean }
/** GnomesOf(owner, offset): a page of a wallet's gnomes, 100 at most; next -1 at the end. */
export interface Held { owner: string; total: number; next: number; rows: { id: string; tier: string; traits: string }[] }
/** Worn(player): the gnome a player wears for everyone (wearing is free): the one put on with Equip
 *  while still held (equipped), else their best. */
export interface Worn { player: string; id: string; name: string; tier: string; traits: string; equipped: boolean }
/** Auction(): the one under way, else the last settled; min 0 once it takes no bid. */
export interface Auction { version: number; id: string; reserve: number; top: number; bidder: string; end: number; min: number; over: boolean; settled: boolean }
/** Why Buy would refuse, its first reason, as CanBuy codes it ("" when it would sell). */
export type Reason = "" | "ids" | "unknown" | "auction" | "unlisted" | "later" | "taken" | "closed" | "paused" | "players-only" | "wave-cap" | "cap";
/** CanBuy(buyer, ids): what Buy would do, its own sentence (said), the sum to send; the caps left, the window's while it runs. */
export interface CanBuy { version: number; ok: boolean; reason: Reason; said: string; total: number; left: PerTier; window: { until: number; left: PerTier } }
/** Params(): the auction's rules and a Buy's batch, as the realm holds them. */
export interface Params { version: number; softClose: number; minRaiseBps: number; minRaise: number; maxHours: number; maxBatch: number; denom: string }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const nums = (v: Obj, ...k: string[]) => k.every((x) => Number.isFinite(v[x]));
const strs = (v: Obj, ...k: string[]) => k.every((x) => typeof v[x] === "string");
const bools = (v: Obj, ...k: string[]) => k.every((x) => typeof v[x] === "boolean");
const every = (v: unknown, ok: (x: unknown) => boolean) => Array.isArray(v) && v.every(ok);
const perTier = (v: unknown): v is PerTier => isObj(v) && nums(v, ...BUY_TIERS);
const checks = {
  collection: (v: unknown): v is Collection =>
    isObj(v) && bools(v, "open") && nums(v, "closesAt") && strs(v, "site") &&
    every(v.tiers, (t) => isObj(t) && strs(t, "name") && nums(t, "price", "cap", "playerCap", "sold")) &&
    every(v.series, (s) => isObj(s) && strs(s, "name") && nums(s, "first", "last", "sold") && bools(s, "closed")) &&
    every(v.waves, (w) => isObj(w) && nums(w, "first", "last", "start", "playersUntil") && every(w.prices, Number.isFinite)),
  // a gnome, or the realm's "none" ({"version":1,"id":""})
  gnome: (v: unknown): v is GnomeRow | { id: "" } =>
    isObj(v) && typeof v.id === "string" && (v.id === "" || (strs(v, "series", "name", "tier", "traits", "owner") && nums(v, "price") && bools(v, "sold", "closed"))),
  held: (v: unknown): v is Held => isObj(v) && strs(v, "owner") && nums(v, "total", "next") && every(v.rows, (r) => isObj(r) && strs(r, "id", "tier", "traits")),
  worn: (v: unknown): v is Worn => isObj(v) && strs(v, "player", "id", "name", "tier", "traits") && bools(v, "equipped") && isAddress(v.player),
  wornList: (v: unknown): v is { rows: Worn[] } => isObj(v) && every(v.rows, checks.worn),
  auction: (v: unknown): v is Auction | { id: "" } =>
    isObj(v) && typeof v.id === "string" && (v.id === "" || (strs(v, "bidder") && nums(v, "reserve", "top", "end", "min") && bools(v, "over", "settled"))),
  canBuy: (v: unknown): v is CanBuy =>
    isObj(v) && bools(v, "ok") && strs(v, "reason", "said") && nums(v, "total") && perTier(v.left) && isObj(v.window) && nums(v.window, "until") && perTier(v.window.left),
  params: (v: unknown): v is Params => isObj(v) && nums(v, "softClose", "minRaiseBps", "minRaise", "maxHours", "maxBatch") && strs(v, "denom"),
};

const q = (v: unknown) => JSON.stringify(String(v));
const gnomeId = (id: number) => {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Not a gnome number.");
  return q(id);
};
const addr = (a: string) => {
  if (!isAddress(a)) throw new Error("Not a gno.land address.");
  return `address(${q(a)})`;
};

/** The gnomes' reads, each one query of the realm (GNOMES_REALM by default). */
export function makeShop(chain: Pick<Chain, "qjson" | "qstr">, realm = GNOMES_REALM) {
  const read = <T>(expr: string, ok: (v: unknown) => v is T) => chain.qjson(realm, expr, ok);
  return {
    realm,
    collection: () => read("Collection()", checks.collection),
    /** One gnome, null when the realm has none of that number. */
    gnome: async (id: number) => {
      const g = await read(`Gnome(${gnomeId(id)})`, checks.gnome);
      return g.id ? (g as GnomeRow) : null;
    },
    /** Which ids were ever sold: the gallery's one query. */
    sold: async () => soldSet(await chain.qstr(realm, "Sold()")),
    /** A page of a wallet's gnomes (100 a page, from offset); none for what is not an address. */
    gnomesOf: (owner: string, offset = 0): Promise<Held> =>
      isAddress(owner) ? read(`GnomesOf(${addr(owner)}, ${Math.max(0, offset | 0)})`, checks.held) : Promise.resolve({ owner, total: 0, next: -1, rows: [] }),
    /** The gnome a player wears for everyone, null for none ("" from the realm). */
    worn: async (player: string) => {
      if (!isAddress(player)) return null;
      const raw = await chain.qstr(realm, `Worn(${addr(player)})`);
      if (!raw) return null;
      let v: unknown;
      try { v = JSON.parse(raw); } catch { v = null; }
      if (!checks.worn(v)) throw Object.assign(new Error("The chain's answer to Worn is not one this page can read."), { kind: "chain" });
      return v;
    },
    /** What these players wear for everyone (the first 50 addresses, once each): a board's page, a rival. */
    wornMany: async (players: readonly string[]) => {
      const list = [...new Set(players.filter(isAddress))].slice(0, 50), got = new Map<string, Worn>();
      if (!list.length) return got;
      for (const w of (await read(`WornMany(${q(list.join(","))})`, checks.wornList)).rows) if (list.includes(w.player)) got.set(w.player, w);
      return got;
    },
    /** The auction under way, else the last settled; null before the first. */
    auction: async () => {
      const a = await read("Auction()", checks.auction);
      return a.id ? (a as Auction) : null;
    },
    canBuy: async (buyer: string, ids: readonly number[]) => read(`CanBuy(${addr(buyer)}, ${q(ids.map((id) => JSON.parse(gnomeId(id)) as string).join(","))})`, checks.canBuy),
    params: () => read("Params()", checks.params),
  };
}
export type Shop = ReturnType<typeof makeShop>;

/** Sold()'s bitmap as a test of an id: bit id-1, the lowest bit of a byte first. Not hex: nothing sold. */
export function soldSet(hex: string) {
  const ok = /^([0-9a-f]{2})*$/.test(hex);
  return (id: number) => ok && id >= 1 && (parseInt(hex.substr(((id - 1) >> 3) * 2, 2) || "0", 16) & (1 << ((id - 1) & 7))) !== 0;
}

// ------------------------------------------------------------ numbers and dates
/** ugnot as GNOT, exact, thousands apart: 333330000 → "333.33". */
export function gnot(ugnot: number) {
  const n = Math.max(0, Math.round(ugnot)), whole = Math.floor(n / 1e6), frac = String(n % 1e6).padStart(6, "0").replace(/0+$/, "");
  return whole.toLocaleString("en-US") + (frac ? "." + frac : "");
}
/** A typed amount of GNOT as ugnot (commas and spaces aside, at most 6 decimals), NaN for anything else. */
export function parseGnot(text: string) {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text.replace(/[,\s]/g, ""));
  return m ? Number(m[1]) * 1e6 + Number((m[2] || "").padEnd(6, "0")) : NaN;
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A time as a date in UTC, as the screens say it ("Mon 14 Dec, 18:00 UTC"; on its own day "today, 18:00 UTC";
 *  short: the weekday alone within the week). Never a countdown. */
export function utcDate(unix: number, now: number, short = false) {
  const d = new Date(unix * 1000), hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  if (new Date(now * 1000).toISOString().slice(0, 10) === d.toISOString().slice(0, 10)) return `today, ${hm}`;
  if (short && unix > now && unix - now < 6 * 86400) return `${DAYS[d.getUTCDay()]} ${hm}`;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hm}`;
}
/** The same time in the player's own clock, for a hover and a screen reader. */
export const localDate = (unix: number) => new Date(unix * 1000).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const label = (t: string) => (TIER_LOOK[t as Tier] || { label: t }).label;
const plural = (word: string, n: number) => (n === 1 ? word : word + "s");
const homeName = (h: string) => h.charAt(0).toUpperCase() + h.slice(1);
const tierIndex = (c: Collection, t: string) => c.tiers.findIndex((x) => x.name === t);
/** The auction tier: Collection's last. */
const auctionTier = (c: Collection) => c.tiers[c.tiers.length - 1]?.name;

// ------------------------------------------------------------ the sale's life (A9)
type Some = Pick<Entry, "id" | "tier" | "home">;
export interface WaveInfo { n: number; row: WaveRow; home: Home | ""; size: number; sold: number }
/** The gallery's "now" row: closed (made and never made), or the wave of the moment (the last
 *  started, else the next: a teaser) and what it is at, with the next wave once it is sold out. */
export type Now =
  | { at: "closed"; closesAt: number; made: number; never: number }
  | { at: "none" }
  | { at: "teaser" | "players" | "open" | "paused"; wave: WaveInfo }
  | { at: "soldout"; wave: WaveInfo; next?: WaveInfo };
export function nowRow(c: Collection, sold: (id: number) => boolean, entries: readonly Some[], now: number): Now {
  const genesis = c.series[0];
  if (genesis && genesis.closed) return { at: "closed", closesAt: c.closesAt, made: genesis.sold, never: genesis.last - genesis.first + 1 - genesis.sold };
  const top = auctionTier(c);
  const info = (n: number): WaveInfo => {
    const row = c.waves[n - 1], ids = entries.filter((e) => e.id >= row.first && e.id <= row.last && e.tier !== top);
    return { n, row, home: entries.find((e) => e.id === row.first)?.home || "", size: ids.length, sold: ids.filter((e) => sold(e.id)).length };
  };
  const started = c.waves.map((w, i) => [w, i + 1] as const).filter(([w]) => w.start <= now).pop();
  if (!started) {
    const first = c.waves.map((w, i) => [w, i + 1] as const).sort(([a], [b]) => a.start - b.start)[0];
    return first ? { at: "teaser", wave: info(first[1]) } : { at: "none" };
  }
  const wave = info(started[1]);
  if (!c.open) return { at: "paused", wave };
  if (wave.size && wave.sold >= wave.size) {
    const later = c.waves.map((w, i) => [w, i + 1] as const).filter(([w]) => w.start > now).sort(([a], [b]) => a.start - b.start)[0];
    return { at: "soldout", wave, ...(later ? { next: info(later[1]) } : {}) };
  }
  return { at: now < started[0].playersUntil ? "players" : "open", wave };
}

// ------------------------------------------------------------ why not (A2), every CanBuy code in words
/** What the buy panel says instead of buying: its button's words (off) and one note; play: the note links to a hole. */
export interface WhyNot { button: string; note: string; play?: true }
export function whyNot(r: CanBuy, c: Collection, g: Pick<Entry, "tier" | "wave" | "home">, now: number): WhyNot | null {
  if (r.ok) return null;
  const t = g.tier as BuyTier, i = tierIndex(c, t), from = `From Wave ${g.wave} · ${homeName(g.home)}.`;
  const wave = c.waves.find((w) => w.start > now) || c.waves[c.waves.length - 1];
  switch (r.reason) {
    case "paused": return { button: "Paused for a moment", note: "The sale picks up where it stopped." };
    case "players-only": return { button: `Players first until ${utcDate(r.window.until, now, true)}`, note: "Save one round on-chain to buy now.", play: true };
    case "wave-cap": {
      const cap = c.tiers[i]?.playerCap ?? 0;
      return { button: `${cap - r.window.left[t]} of ${cap} ${plural(label(t), cap)} this wave`, note: `Your share until ${utcDate(r.window.until, now, true)}. Then open to everyone.` };
    }
    case "cap": {
      const cap = c.tiers[i]?.cap ?? 0;
      return { button: `${cap - r.left[t]} of ${cap} ${plural(label(t), cap)}`, note: "The most one wallet buys." };
    }
    case "later": return { button: wave ? `Opens ${utcDate(wave.start, now, true)}` : "Not on sale yet", note: from };
    case "unlisted": return { button: "Not on sale yet", note: c.closesAt ? `${from} A wave not open by ${utcDate(c.closesAt, now)} never opens.` : from };
    case "taken": return { button: "Already found a player", note: "" };
    case "closed": return { button: "Never made", note: "The sale closed before this gnome found a player." };
    case "auction": return { button: "Sold at auction", note: "" };
    case "unknown": case "ids": return { button: "No gnome by that number", note: "" };
    default: return { button: "Can't be bought now", note: `The chain says: ${r.said}.` };
  }
}

// ------------------------------------------------------------ the bill (shared pieces)
/** What a signature costs, each line in ugnot: the price, the storage deposit for bytes (and a tenth more:
 *  the chain charges what is written), the network fee for gas (half again for a rising price, as every ask);
 *  most: their sum; short: what the balance lacks (0 enough, null unknown). */
export function bill({ price, bytes, storagePrice, gas, gasPrice, balance }: { price: number; bytes: number; storagePrice: number; gas: number; gasPrice: number; balance: number | null }) {
  const deposit = Math.ceil(bytes * 1.1) * storagePrice, fee = Math.ceil(gas * gasPrice * 1.5);
  const lines: [string, number][] = [["Price", price], ["Storage deposit", deposit], ["Network fee", fee]];
  const most = price + deposit + fee;
  return { lines: lines.filter(([k, v]) => v > 0 || k !== "Price"), most, short: balance == null ? null : Math.max(0, most - balance) };
}

// ------------------------------------------------------------ the auction (A4)
export type AuctionAt = "live" | "outbid" | "leading" | "ended" | "won" | "sold" | "nobid";
/** The auction as the page shows it, for a player (me: their address, null without a wallet; bid: what they bid
 *  last on it, remembered; firstEnd: its end when first seen: a later one was moved by a late bid). */
export function auctionView(a: Auction, { me, now, bid = 0, firstEnd = 0 }: { me: string | null; now: number; bid?: number; firstEnd?: number }) {
  const extended = !!firstEnd && a.end > firstEnd && !a.over;
  let at: AuctionAt;
  if (a.over || now >= a.end) at = !a.bidder ? "nobid" : !a.settled ? "ended" : a.bidder === me ? "won" : "sold";
  else at = me && a.bidder === me ? "leading" : bid > 0 && me ? "outbid" : "live";
  return { at, extended };
}

// ------------------------------------------------------------ the shelf (A1)
/** A page of the gallery's grid. */
export const PAGE = 48;
export type View = "sale" | "mine" | "all" | "made";
interface Seen { c: Collection; sold: (id: number) => boolean; mine: ReadonlySet<number>; now: number }
/** Whether a gnome is on sale now: in a started wave, not sold, not closed, not the auction tier. */
export function onSale(e: Some, c: Collection, sold: (id: number) => boolean, now: number) {
  return e.tier !== auctionTier(c) && !sold(e.id) && !c.series[0]?.closed && c.waves.some((w) => e.id >= w.first && e.id <= w.last && w.start <= now);
}
const neverMade = (e: Some, s: Seen) => !!s.c.series[0]?.closed && e.id >= s.c.series[0].first && e.id <= s.c.series[0].last && !s.sold(e.id);
/** The gallery's list for a view and its filters, in id order (a number searched comes first), and each tier's count in the view. */
export function shelf(entries: readonly Entry[], f: Query & { view: View }, s: Seen) {
  const inView = entries.filter((e) => (f.view === "sale" ? onSale(e, s.c, s.sold, s.now) : f.view === "mine" ? s.mine.has(e.id) : f.view === "made" ? s.sold(e.id) : true));
  const tiers = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const e of inView) if (e.tier in tiers) tiers[e.tier as keyof typeof tiers]++;
  const num = /^#?(\d{1,7})$/.exec((f.text || "").trim());
  // "#94" is that gnome alone; "94" any number holding it, that one first
  const byText = num ? inView.filter((e) => ((f.text || "").trim().startsWith("#") ? String(e.id) === num[1] : String(e.id).includes(num[1]))) : inView;
  const list = filterGnomes(byText, { ...f, text: num ? "" : f.text });
  if (num) list.sort((a, b) => Number(b.id === Number(num[1])) - Number(a.id === Number(num[1])) || a.id - b.id);
  return { list, tiers };
}
/** A card's one fact: the price on sale, "Yours", "Found a player", "Never made", "At auction", or its wave. */
export function cardFact(e: Entry, s: Seen) {
  if (s.mine.has(e.id)) return "Yours";
  if (s.sold(e.id)) return "Found a player";
  if (neverMade(e, s)) return "Never made";
  if (e.tier === auctionTier(s.c)) return "At auction";
  const w = s.c.waves.find((x) => e.id >= x.first && e.id <= x.last);
  if (w && w.start <= s.now) return `${gnot(w.prices[tierIndex(s.c, e.tier)] ?? 0)} GNOT`;
  if (w) return `Opens ${utcDate(w.start, s.now, true)}`;
  return `Wave ${e.wave} · ${homeName(e.home)}`;
}

// ------------------------------------------------------------ a team (A6)
const RANK: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3, earned: 4 };
/** A wallet's gnomes as the shelf lays them out: Legendary first, then Epic, Rare, Common, earned, then by number. */
export const teamOrder = <R extends { id: string; tier: string }>(rows: readonly R[]) =>
  [...rows].sort((a, b) => (RANK[a.tier] ?? 5) - (RANK[b.tier] ?? 5) || Number(a.id) - Number(b.id));

// ------------------------------------------------------------ the share moments' words (A8)
/** What each moment says: short, about the game, never value. */
export const shareWords = {
  bought: (name: string, id: number | string) => `I just adopted ${name}, gnome #${id} of Gnogolf. ${name} rolls for me now`,
  equipped: (name: string, home: string) => `My gnome for the boards: ${name} of the ${homeName(home)}. Race my ghost`,
  bidding: (name: string, ends: string) => `I'm bidding on ${name}, one of seven Legendary gnomes of Gnogolf. Ends ${ends}`,
  won: (name: string) => `${name} is mine: one of seven Legendary gnomes of Gnogolf`,
  team: (count: number, best: string) => (count === 1 ? `My Gnogolf team: ${best}. Race my ghost` : `My Gnogolf team: ${count} gnomes, ${best} up front. Race their ghosts`),
};
