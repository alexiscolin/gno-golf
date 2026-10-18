// The gnomes' shop as the screens read it (the GUI spec, A): the realm's
// answers (r/gnogolf/gnomes, ADR-007, ADR-013) checked into these shapes, one query
// each, and what a screen decides from them, pure, so the tests hold every
// state: the sale's phase, why a gnome can't be bought in plain words, the
// bill before a signature, the gallery's shelf. The
// figures are all read: no price, cap or date is written here.
import { depositFor, feeFor, upToHundredth } from "../adena";
import { GNOMES_REALM, isAddress, isObj, nums, shortAddr, strs, type Chain, type Obj } from "../chain";
import { cap as capitalised, theWorld } from "../card";
import { TIER_LOOK, filterGnomes, type Listed, type Query } from "./catalogue";
import type { Tier } from "./vocab";

export { SHOP } from "./door";

/** The tiers Buy sells: every one, at its sale's fixed price (there is no auction). */
export const BUY_TIERS = ["common", "rare", "epic", "legendary"] as const;
export type BuyTier = (typeof BUY_TIERS)[number];
type PerTier = Record<BuyTier, number>;

// ------------------------------------------------------------ the shapes (read.gno, equip.gno)
export interface TierRow { name: string; price: number; cap: number; playerCap: number; sold: number }
/** A series' sale: its start, its players' window's end (its start: none), its prices per tier (ugnot), as opened. */
export interface SaleRow { start: number; playersUntil: number; prices: number[] }
/** A series, and its sale (null: none opened yet). */
export interface SeriesRow { name: string; first: number; last: number; sold: number; closed: boolean; sale: SaleRow | null }
/** Collection(): the sale's switch (open) and the earned gnomes' (earnedOpen), the genesis's closing date (0: none
 *  set, and then none of the genesis on sale), the tiers (the next sale's prices), the series and their sales. */
export interface Collection {
  version: number; open: boolean; earnedOpen: boolean; closesAt: number; owner: string; treasury: string; pendingTreasury: string; site: string; royaltyBps: number;
  tiers: TierRow[]; series: SeriesRow[];
}
/** Gnome(id): one gnome, its owner ("" unsold) and its price. */
export interface GnomeRow { id: string; series: string; name: string; tier: string; traits: string; owner: string; price: number; sold: boolean; closed: boolean }
/** GnomesOf(owner, offset): a page of a wallet's gnomes, 100 at most; next -1 at the end. */
export interface Held { owner: string; total: number; next: number; rows: { id: string; tier: string; traits: string }[] }
/** Worn(player): the gnome a player wears for everyone (wearing is free): the one put on with Equip
 *  while still held (equipped), else their best. */
export interface Worn { player: string; id: string; name: string; tier: string; traits: string; equipped: boolean }
/** Why Buy would refuse, its first reason, as CanBuy codes it ("" when it would sell). */
export type Reason = "" | "ids" | "unknown" | "unlisted" | "later" | "taken" | "closed" | "paused" | "players-only" | "window-cap" | "cap";
/** CanBuy(buyer, ids): what Buy would do, its own sentence (said), the sum to send; the caps left, the window's while it runs. */
export interface CanBuy { version: number; ok: boolean; reason: Reason; said: string; total: number; left: PerTier; window: { until: number; left: PerTier } }
/** Params(): the longest player window and a Buy's batch, as the realm holds them. */
export interface Params { version: number; maxHours: number; maxBatch: number; denom: string }

// (the shape checks the chain's reads use, chain.ts; booleans, the gnomes' alone)
const bools = (v: Obj, ...k: string[]) => k.every((x) => typeof v[x] === "boolean");
const every = (v: unknown, ok: (x: unknown) => boolean) => Array.isArray(v) && v.every(ok);
const perTier = (v: unknown): v is PerTier => isObj(v) && nums(v, ...BUY_TIERS);
const checks = {
  collection: (v: unknown): v is Collection =>
    isObj(v) && bools(v, "open", "earnedOpen") && nums(v, "closesAt") && strs(v, "site") &&
    every(v.tiers, (t) => isObj(t) && strs(t, "name") && nums(t, "price", "cap", "playerCap", "sold")) &&
    every(v.series, (s) => isObj(s) && strs(s, "name") && nums(s, "first", "last", "sold") && bools(s, "closed") &&
      (s.sale === null || (isObj(s.sale) && nums(s.sale, "start", "playersUntil") && every(s.sale.prices, Number.isFinite)))),
  // a gnome, or the realm's "none" ({"version":1,"id":""})
  gnome: (v: unknown): v is GnomeRow | { id: "" } =>
    isObj(v) && typeof v.id === "string" && (v.id === "" || (strs(v, "series", "name", "tier", "traits", "owner") && nums(v, "price") && bools(v, "sold", "closed"))),
  held: (v: unknown): v is Held => isObj(v) && strs(v, "owner") && nums(v, "total", "next") && every(v.rows, (r) => isObj(r) && strs(r, "id", "tier", "traits")),
  worn: (v: unknown): v is Worn => isObj(v) && strs(v, "player", "id", "name", "tier", "traits") && bools(v, "equipped") && isAddress(v.player),
  wornList: (v: unknown): v is { rows: Worn[] } => isObj(v) && every(v.rows, checks.worn),
  canBuy: (v: unknown): v is CanBuy =>
    isObj(v) && bools(v, "ok") && strs(v, "reason", "said") && nums(v, "total") && perTier(v.left) && isObj(v.window) && nums(v.window, "until") && perTier(v.window.left),
  params: (v: unknown): v is Params => isObj(v) && nums(v, "maxHours", "maxBatch") && strs(v, "denom"),
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
    /** A wallet's gnomes, every page (10 at most: 1,000 gnomes), best first as the realm lists them. */
    allOf: async (owner: string) => {
      const rows: Held["rows"] = [];
      for (let at = 0, n = 0; at >= 0 && n < 10 && isAddress(owner); n++) {
        const p = await read(`GnomesOf(${addr(owner)}, ${at})`, checks.held);
        rows.push(...p.rows);
        at = p.next;
      }
      return rows;
    },
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
    canBuy: async (buyer: string, ids: readonly number[]) => read(`CanBuy(${addr(buyer)}, ${q(ids.map((id) => JSON.parse(gnomeId(id)) as string).join(","))})`, checks.canBuy),
    params: () => read("Params()", checks.params),
    /** A gnome's picture as the chain draws it: his TokenURI once minted, else his page (Render), which draws any
     *  gnome of a published series; the answer as the realm gives it (onchain.ts reads it). */
    portrait: async (id: number) => {
      const tid = gnomeId(id);
      return chain.qstr(realm, `func() string { if u, err := TokenURI(${tid}); err == nil { return u }; return Render(${tid}) }()`);
    },
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
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A time's words as the screens and the receipt say them, read in UTC (another zone: its time shifted first):
 *  its weekday ("Mon"), its day ("14 Dec"), its hour ("18:00"), its year. */
export const dateParts = (unix: number) => {
  const d = new Date(unix * 1000);
  return { weekday: DAYS[d.getUTCDay()], day: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, hm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`, year: d.getUTCFullYear() };
};
/** A time as a date in UTC, as the screens say it ("Mon 14 Dec, 18:00 UTC"; on its own day "today, 18:00 UTC";
 *  short: the weekday alone within the week). Never a countdown. */
export function utcDate(unix: number, now: number, short = false) {
  const p = dateParts(unix), hm = `${p.hm} UTC`;
  if (new Date(now * 1000).toISOString().slice(0, 10) === new Date(unix * 1000).toISOString().slice(0, 10)) return `today, ${hm}`;
  if (short && unix > now && unix - now < 6 * 86400) return `${p.weekday} ${hm}`;
  return `${p.weekday} ${p.day}, ${hm}`;
}
/** The same time in the player's own clock, for a hover and a screen reader. */
export const localDate = (unix: number) => new Date(unix * 1000).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const label = (t: string) => (TIER_LOOK[t as Tier] || { label: t }).label;
const plural = (word: string, n: number) => (n === 1 ? word : word + "s");
const tierIndex = (c: Collection, t: string) => c.tiers.findIndex((x) => x.name === t);
/** Whether a gnome is the closed genesis's: the closing closes the genesis alone (close.gno isClosed), a later series sells on. */
const closedOut = (c: Collection, id: number) => !!c.series[0]?.closed && id >= c.series[0].first && id <= c.series[0].last;
/** The sale a gnome is in, his series' (none: not opened yet). */
const saleOf = (c: Collection, id: number) => c.series.find((s) => id >= s.first && id <= s.last)?.sale;

// ------------------------------------------------------------ the sale's life (A9)
type Some = Pick<Listed, "id" | "tier">;
/** A series' sale as the screens say it: its series (the realm's name) and its name for people ("Genesis"), its
 *  row, its ids, its size and what found a player. */
export interface SaleInfo { series: string; name: string; row: SaleRow; first: number; last: number; size: number; sold: number }
/** The gallery's "now" row: closed (made and never made: the genesis closed, no later series' sale), or the sale
 *  of the moment (the latest started still selling, else the next: a teaser) and what it is at. */
export type Now =
  | { at: "closed"; closesAt: number; made: number; never: number }
  | { at: "none" }
  | { at: "teaser" | "players" | "open" | "paused" | "soldout"; sale: SaleInfo };
/** names: the catalogue's series, their names for people (none: the realm's, capitalised). */
export function nowRow(c: Collection, sold: (id: number) => boolean, entries: readonly Some[], now: number, names: readonly { id: string; name: string }[] = []): Now {
  const genesis = c.series[0];
  // the series with a sale; once the genesis closed, a later series' alone
  const on = c.series.filter((s): s is SeriesRow & { sale: SaleRow } => !!s.sale && !closedOut(c, s.first));
  if (genesis && genesis.closed && !on.length) return { at: "closed", closesAt: c.closesAt, made: genesis.sold, never: genesis.last - genesis.first + 1 - genesis.sold };
  const info = (s: SeriesRow & { sale: SaleRow }): SaleInfo => {
    const ids = entries.filter((e) => e.id >= s.first && e.id <= s.last);
    return { series: s.name, name: names.find((n) => n.id === s.name)?.name || capitalised(s.name), row: s.sale, first: s.first, last: s.last, size: ids.length, sold: ids.filter((e) => sold(e.id)).length };
  };
  // by start: the latest started still selling; all sold out, the next to come (a teaser), else the latest sold out
  const byStart = [...on].sort((a, b) => a.sale.start - b.sale.start);
  const started = byStart.filter((s) => s.sale.start <= now).map(info), ahead = byStart.find((s) => s.sale.start > now);
  const out = (s: SaleInfo) => s.size > 0 && s.sold >= s.size;
  const sale = started.filter((s) => !out(s)).pop() ?? (ahead ? undefined : started.pop());
  if (!sale) return ahead ? { at: "teaser", sale: info(ahead) } : { at: "none" };
  if (!c.open) return { at: "paused", sale };
  if (out(sale)) return { at: "soldout", sale };
  return { at: now < sale.row.playersUntil ? "players" : "open", sale };
}

// ------------------------------------------------------------ the shop's sale card (a little fairway, tee to flag)
/** A tier of the sale: what found a player of what it holds, its price (ugnot, 0: none said), all in words. */
export interface TierShare { tier: BuyTier; found: number; total: number; price: number; label: string }
/** The shop's sale card: the series' name ("Genesis") and its count ("4 of 720 found a player": big "4", rest the words), the same said
 *  whole (label), the ball's place
 *  from tee (0) to flag (1) as the share that found a player, each tier's share, its Legendaries at
 *  the flag, and the state's chip (a date, never a countdown: none while the sale is simply open; short, a phone's);
 *  closed: what was made and never made; null: no sale to show. */
export type SaleCard =
  | { at: "closed"; title: string; count: string; label: string }
  | { at: "teaser" | "players" | "open" | "paused" | "soldout"; title: string; count: string; big: string; rest: string; label: string; share: number; tiers: TierShare[];
      legend: { id: number; name: string; words: string } | null; chip: { text: string; short: string; full: string } | null };
export function saleLine(row: Now, c: Collection, entries: readonly Pick<Listed, "id" | "tier" | "name">[], sold: (id: number) => boolean, now: number): SaleCard | null {
  if (row.at === "none") return null;
  if (row.at === "closed") return { at: "closed", title: "The sale is closed", count: `${row.made} made · ${row.never} never made`, label: `The sale is closed: ${row.made} gnomes made, ${row.never} never made` };
  const { sale } = row, inSale = entries.filter((e) => e.id >= sale.first && e.id <= sale.last);
  const tiers = BUY_TIERS.map((tier) => {
    const of = inSale.filter((e) => e.tier === tier), found = of.filter((e) => sold(e.id)).length, price = sale.row.prices[tierIndex(c, tier)] ?? 0;
    return { tier, found, total: of.length, price, label: `${label(tier)}${price > 0 ? `, ${gnot(price)} GNOT` : ""}: ${found} of ${of.length} found a player` };
  }).filter((t) => t.total > 0);
  const legends = inSale.filter((e) => e.tier === "legendary"), waiting = legends.filter((e) => !sold(e.id)), until = utcDate(sale.row.playersUntil, now, true), opens = utcDate(sale.row.start, now, true);
  // (short: a phone's, the day said only when it is not today's)
  const bare = (s: string) => s.replace(/^today, /, "");
  const chip = row.at === "teaser" ? { text: `Opens ${opens}`, short: `Opens ${bare(opens)}`, full: `${sale.name} opens ${opens}.` }
    : row.at === "players" ? { text: `Players first · until ${until}`, short: `Players first · ${bare(until)}`, full: `Players first until ${until}: save one round on-chain to buy now.` }
    : row.at === "paused" ? { text: "Paused for a moment", short: "Paused", full: "Paused for a moment: the sale picks up where it stopped." } : null;
  const all = sale.size && sale.sold >= sale.size;
  // the count's figure (the card says it big) and the words after it
  const big = all ? "All" : String(sale.sold), rest = `${all ? sale.size : `of ${sale.size}`} found a player`;
  return {
    at: row.at, chip, tiers, big, rest,
    title: sale.name,
    count: `${big} ${rest}`,
    label: `${sale.name}: ${all ? `all ${sale.size}` : `${sale.sold} of ${sale.size}`} ${plural("gnome", sale.size)} found a player`,
    share: sale.size ? Math.min(1, sale.sold / sale.size) : 0,
    // (several: the first still waiting stands for them, the words their count)
    legend: legends.length > 1 ? legendsWords(legends.length, waiting.length, (waiting[0] ?? legends[0]).id)
      : legends[0] ? { id: legends[0].id, name: legends[0].name, words: `${legends[0].name} ${sold(legends[0].id) ? "found a player" : "waits at the flag"}` } : null,
  };
}

/** Several Legendaries at the flag, in words that start with their name (the card bolds it): "5 of 7 Legendaries wait at the flag". */
function legendsWords(all: number, waiting: number, id: number) {
  const name = waiting === all ? `${all} Legendaries` : waiting ? `${waiting} of ${all} Legendaries` : `All ${all} Legendaries`;
  return { id, name, words: `${name} ${waiting ? (waiting === 1 ? "waits at the flag" : "wait at the flag") : "found a player"}` };
}

// ------------------------------------------------------------ the collection on the game's screens
/** What the menu's Gnomes card, the picker's Collection section and the finish card say of the sale: the
 *  sale to see (on sale, players first, paused, or opening), its series' name, its size and what found a player,
 *  its lowest price, its Legendary and three faces (an Epic, a Rare, a Common); null when there is none
 *  to show (closed for good, sold out, none opened yet). Dates, never a countdown. */
export interface Promo {
  at: "open" | "players" | "paused" | "teaser";
  name: string;
  size: number;
  sold: number;
  /** ugnot: the lowest price of the tiers the sale holds (0: none above 0, no price said) */
  from: number;
  start: number;
  playersUntil: number;
  legendary: { id: number; name: string; price: number } | null;
  /** an Epic, a Rare, a Common of the sale, those it holds, each with its own tier */
  faces: { id: number; tier: Tier }[];
}
export function promoOf(now: Now, c: Collection, entries: readonly Pick<Listed, "id" | "tier" | "name">[]): Promo | null {
  if (now.at === "soldout" || now.at === "closed" || now.at === "none") return null;
  const { sale } = now, { row } = sale, inSale = entries.filter((e) => e.id >= sale.first && e.id <= sale.last);
  const priceOf = (t: string) => row.prices[tierIndex(c, t)] ?? 0, legend = inSale.find((e) => e.tier === "legendary");
  const prices = [...new Set(inSale.map((e) => e.tier))].map(priceOf).filter((p) => p > 0);
  return {
    at: now.at, name: sale.name, size: sale.size, sold: sale.sold,
    from: prices.length ? Math.min(...prices) : 0, start: row.start, playersUntil: row.playersUntil,
    legendary: legend ? { id: legend.id, name: legend.name, price: priceOf("legendary") } : null,
    faces: (["epic", "rare", "common"] as const).flatMap((t) => inSale.filter((e) => e.tier === t).slice(0, 1).map((e) => ({ id: e.id, tier: t }))),
  };
}
/** A promo in words: its title ("Genesis"), what it holds ("720 gnomes, from 36 GNOT") and where it is. */
export function promoWords(p: Promo, now: number) {
  return {
    title: p.name,
    line: `${p.size} ${plural("gnome", p.size)}${p.from > 0 ? `, from ${gnot(p.from)} GNOT` : ""}`,
    state: p.at === "teaser" ? `Opens ${utcDate(p.start, now, true)}` : p.at === "paused" ? "Paused for a moment"
      : p.at === "players" ? `Players first until ${utcDate(p.playersUntil, now, true)}` : `${p.sold} of ${p.size} found a player`,
  };
}

// ------------------------------------------------------------ why not (A2), every CanBuy code in words
/** What the buy panel says instead of buying: its button's words (off) and one note; play: the note links to a hole. */
export interface WhyNot { button: string; note: string; play?: true }
export function whyNot(r: CanBuy, c: Collection, g: Pick<Listed, "id" | "tier" | "home">, now: number): WhyNot | null {
  if (r.ok) return null;
  const t = g.tier as BuyTier, i = tierIndex(c, t), from = `From ${theWorld(g.home)}.`;
  const sale = saleOf(c, g.id);
  switch (r.reason) {
    case "paused": return { button: "Paused for a moment", note: "The sale picks up where it stopped." };
    case "players-only": return { button: `Players first until ${utcDate(r.window.until, now, true)}`, note: "Save one round on-chain to buy now.", play: true };
    case "window-cap": {
      const cap = c.tiers[i]?.playerCap ?? 0;
      return { button: `${cap - r.window.left[t]} of ${cap} ${plural(label(t), cap)} this window`, note: `Your share until ${utcDate(r.window.until, now, true)}. Then open to everyone.` };
    }
    case "cap": {
      const cap = c.tiers[i]?.cap ?? 0;
      return { button: `${cap - r.left[t]} of ${cap} ${plural(label(t), cap)}`, note: "The most one wallet buys." };
    }
    case "later": return { button: sale ? `Opens ${utcDate(sale.start, now, true)}` : "Not on sale yet", note: from };
    case "unlisted": return { button: "Not on sale yet", note: c.closesAt ? `${from} Its sale opens before ${utcDate(c.closesAt, now)}, or never.` : from };
    case "taken": return { button: "Already found a player", note: "" };
    case "closed": return { button: "Never made", note: "The sale closed before this gnome found a player." };
    case "unknown": case "ids": return { button: "No gnome by that number", note: "" };
    default: return { button: "Can't be bought now", note: `The chain says: ${r.said}.` };
  }
}

// ------------------------------------------------------------ a buy sent, not confirmed
/** Where a buy the wallet gave no hash for stands, by the gnome read again: the buyer's ("mine": it landed), another's
 *  ("taken"), or null, still unsold: nothing landed (yet). */
export const landing = (row: GnomeRow | null, me: string) => (!row || !row.owner ? null : row.owner === me ? "mine" : "taken");

// ------------------------------------------------------------ the bill (shared pieces)
/** A bill's figure as it is said, in ugnot: its parts' sum up to the hundredth of a GNOT, never under what the wallet
 *  may be asked. The one rounding rule: the review's Total, the order's button and a sheet's chain costs all say it. */
export const totalOf = (...ugnot: number[]) => upToHundredth(ugnot.reduce((a, b) => a + b, 0));
/** What a signature costs, in ugnot: the price, the storage deposit for bytes, the network fee for gas, both as
 *  the wallet is asked them (adena.ts depositFor, feeFor); most: their sum; total: that sum as said (totalOf);
 *  short: what the balance lacks (0 enough, null unknown). */
export function bill({ price, bytes, storagePrice, gas, gasPrice, balance }: { price: number; bytes: number; storagePrice: number; gas: number; gasPrice: number; balance: number | null }) {
  const deposit = depositFor(bytes, storagePrice), fee = feeFor(gas, gasPrice);
  const most = price + deposit + fee;
  return { price, deposit, fee, most, total: totalOf(price, deposit, fee), short: balance == null ? null : Math.max(0, most - balance) };
}
export type Bill = ReturnType<typeof bill>;

// ------------------------------------------------------------ the shelf (A1)
/** A page of the gallery's grid. */
export const PAGE = 48;
export type View = "mine" | "all";
interface Seen { c: Collection; sold: (id: number) => boolean; mine: ReadonlySet<number>; now: number }
/** Whether a gnome is on sale now: his series' sale started, not sold, not the closed genesis's. */
export function onSale(e: Some, c: Collection, sold: (id: number) => boolean, now: number) {
  const s = saleOf(c, e.id);
  return !sold(e.id) && !closedOut(c, e.id) && !!s && s.start <= now;
}
/** Whether a gnome was never made: the closed genesis's, never sold. */
export const neverMade = (e: Some, s: Seen) => closedOut(s.c, e.id) && !s.sold(e.id);
/** The gallery's list for a view and its filters, in id order (a number searched comes first), and each tier's count in the view. */
export function shelf<E extends Listed>(entries: readonly E[], f: Query & { view: View }, s: Seen) {
  const inView = f.view === "mine" ? entries.filter((e) => s.mine.has(e.id)) : entries;
  const tiers = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const e of inView) if (e.tier in tiers) tiers[e.tier as keyof typeof tiers]++;
  const num = /^#?(\d{1,7})$/.exec((f.text || "").trim());
  // "#94" is that gnome alone; "94" any number holding it, that one first
  const byText = num ? inView.filter((e) => ((f.text || "").trim().startsWith("#") ? String(e.id) === num[1] : String(e.id).includes(num[1]))) : inView;
  const list = filterGnomes(byText, { ...f, text: num ? "" : f.text });
  if (num) list.sort((a, b) => Number(b.id === Number(num[1])) - Number(a.id === Number(num[1])) || a.id - b.id);
  return { list, tiers };
}
/** A player's gnomes page's title: their gno.land name, else their short address ("g1abcdef…89cd's gnomes"). */
export const theirTitle = (name: string, who: string) => `${name || shortAddr(who)}'s gnomes`;
/** Whether the gallery says the genesis sale's closing date: one is set (0: none, as a launch may leave it), not yet passed. */
export const showsClosing = (c: Collection) => c.closesAt > 0 && !c.series[0]?.closed;
/** The closing line's place in the shop's head: its line, none, or its room kept while the sale is not read yet (null). */
export const closingSlot = (c: Collection | null): "line" | "none" | "room" => (!c ? "room" : showsClosing(c) ? "line" : "none");
/** Whether a card in the gallery shows Buy: on sale now (its sale started, unsold, the sale not closed) and not the player's. */
export const canBuyCard = (e: Listed, s: Seen) => !s.mine.has(e.id) && onSale(e, s.c, s.sold, s.now);
/** A card's one fact: the price on sale, "Yours", "Found a player", "Never made", when it opens, or not on sale yet. */
export function cardFact(e: Listed, s: Seen) {
  if (s.mine.has(e.id)) return "Yours";
  if (s.sold(e.id)) return "Found a player";
  if (neverMade(e, s)) return "Never made";
  const sale = saleOf(s.c, e.id);
  if (sale && sale.start <= s.now) return `${gnot(sale.prices[tierIndex(s.c, e.tier)] ?? 0)} GNOT`;
  return sale ? `Opens ${utcDate(sale.start, s.now, true)}` : "Not on sale yet";
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
  equipped: (name: string, home: string) => `My gnome for the boards: ${name} of ${theWorld(home)}. Race my ghost`,
  team: (count: number, best: string) => (count === 1 ? `My Gnogolf team: ${best}. Race my ghost` : `My Gnogolf team: ${count} gnomes, ${best} up front. Race their ghosts`),
};
