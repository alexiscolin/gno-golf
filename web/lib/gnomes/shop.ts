// The gnomes' shop as the screens read it (the GUI spec, A): the realm's
// answers (r/gnogolf/gnomes, ADR-007) checked into these shapes, one query
// each, and what a screen decides from them, pure, so the tests hold every
// state: the sale's phase, why a gnome can't be bought in plain words, the
// bill before a signature, the gallery's shelf. The
// figures are all read: no price, cap or date is written here.
import { depositFor, feeFor } from "../adena";
import { GNOMES_REALM, isAddress, isObj, nums, shortAddr, strs, type Chain, type Obj } from "../chain";
import { theWorld, worldName } from "../card";
import { TIER_LOOK, filterGnomes, type Listed, type Query } from "./catalogue";
import type { Home, Tier } from "./vocab";

export { SHOP } from "./door";

/** The tiers Buy sells: every one, at its wave's fixed price (there is no auction). */
export const BUY_TIERS = ["common", "rare", "epic", "legendary"] as const;
export type BuyTier = (typeof BUY_TIERS)[number];
type PerTier = Record<BuyTier, number>;

// ------------------------------------------------------------ the shapes (read.gno, equip.gno)
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
/** Why Buy would refuse, its first reason, as CanBuy codes it ("" when it would sell). */
export type Reason = "" | "ids" | "unknown" | "unlisted" | "later" | "taken" | "closed" | "paused" | "players-only" | "wave-cap" | "cap";
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
/** The published wave a gnome is in, by its id (none: not published yet). */
const waveOf = (c: Collection, id: number) => c.waves.find((w) => id >= w.first && id <= w.last);

// ------------------------------------------------------------ the sale's life (A9)
type Some = Pick<Listed, "id" | "tier" | "home">;
export interface WaveInfo { n: number; row: WaveRow; home: Home | ""; size: number; sold: number }
/** The gallery's "now" row: closed (made and never made: the genesis closed, no later series' wave), or the wave
 *  of the moment (the last started, else the next: a teaser) and what it is at, with the next wave once it is sold out. */
export type Now =
  | { at: "closed"; closesAt: number; made: number; never: number }
  | { at: "none" }
  | { at: "teaser" | "players" | "open" | "paused"; wave: WaveInfo }
  | { at: "soldout"; wave: WaveInfo; next?: WaveInfo };
export function nowRow(c: Collection, sold: (id: number) => boolean, entries: readonly Some[], now: number): Now {
  const genesis = c.series[0];
  // each wave and its number; once the genesis closed, a later series' alone
  const waves = c.waves.map((w, i) => [w, i + 1] as const).filter(([w]) => !closedOut(c, w.first));
  if (genesis && genesis.closed && !waves.length) return { at: "closed", closesAt: c.closesAt, made: genesis.sold, never: genesis.last - genesis.first + 1 - genesis.sold };
  const info = (n: number): WaveInfo => {
    const row = c.waves[n - 1], ids = entries.filter((e) => e.id >= row.first && e.id <= row.last);
    return { n, row, home: entries.find((e) => e.id === row.first)?.home || "", size: ids.length, sold: ids.filter((e) => sold(e.id)).length };
  };
  const started = waves.filter(([w]) => w.start <= now).pop();
  if (!started) {
    const first = [...waves].sort(([a], [b]) => a.start - b.start)[0];
    return first ? { at: "teaser", wave: info(first[1]) } : { at: "none" };
  }
  const wave = info(started[1]);
  if (!c.open) return { at: "paused", wave };
  if (wave.size && wave.sold >= wave.size) {
    const later = waves.filter(([w]) => w.start > now).sort(([a], [b]) => a.start - b.start)[0];
    return { at: "soldout", wave, ...(later ? { next: info(later[1]) } : {}) };
  }
  return { at: now < started[0].playersUntil ? "players" : "open", wave };
}

// ------------------------------------------------------------ the shop's wave line (a little fairway, tee to flag)
/** A tier of the wave: what found a player of what it holds, its price (ugnot, 0: none said), all in words. */
export interface TierShare { tier: BuyTier; found: number; total: number; price: number; label: string }
/** The shop's wave card: the wave's title ("Wave 1 · Garden") and its count ("4 of 104 found a player"), the same said
 *  whole (label), the ball's place
 *  from tee (0) to flag (1) as the share that found a player, each tier's share, the wave's Legendary at
 *  the flag, and the state's chip (a date, never a countdown: none while the wave is simply open; short, a phone's);
 *  closed: what was made and never made; null: no wave to show. */
export type WaveLine =
  | { at: "closed"; title: string; count: string; label: string }
  | { at: "teaser" | "players" | "open" | "paused" | "soldout"; n: number; title: string; count: string; label: string; share: number; tiers: TierShare[];
      legend: { id: number; name: string; words: string } | null; chip: { text: string; short: string; full: string } | null };
export function waveLine(row: Now, c: Collection, entries: readonly Pick<Listed, "id" | "tier" | "name">[], sold: (id: number) => boolean, now: number): WaveLine | null {
  if (row.at === "none") return null;
  if (row.at === "closed") return { at: "closed", title: "The sale is closed", count: `${row.made} made · ${row.never} never made`, label: `The sale is closed: ${row.made} gnomes made, ${row.never} never made` };
  const { wave } = row, inWave = entries.filter((e) => e.id >= wave.row.first && e.id <= wave.row.last);
  const tiers = BUY_TIERS.map((tier) => {
    const of = inWave.filter((e) => e.tier === tier), found = of.filter((e) => sold(e.id)).length, price = wave.row.prices[tierIndex(c, tier)] ?? 0;
    return { tier, found, total: of.length, price, label: `${label(tier)}${price > 0 ? `, ${gnot(price)} GNOT` : ""}: ${found} of ${of.length} found a player` };
  }).filter((t) => t.total > 0);
  const legend = inWave.find((e) => e.tier === "legendary"), until = utcDate(wave.row.playersUntil, now, true), opens = utcDate(wave.row.start, now, true);
  // (short: a phone's, the day said only when it is not today's)
  const bare = (s: string) => s.replace(/^today, /, "");
  const chip = row.at === "teaser" ? { text: `Opens ${opens}`, short: `Opens ${bare(opens)}`, full: `Wave ${wave.n} opens ${opens}.` }
    : row.at === "players" ? { text: `Players first · until ${until}`, short: `Players first · ${bare(until)}`, full: `Players first until ${until}: save one round on-chain to buy now.` }
    : row.at === "paused" ? { text: "Paused for a moment", short: "Paused", full: "Paused for a moment: the sale picks up where it stopped." } : null;
  return {
    at: row.at, n: wave.n, chip, tiers,
    title: `Wave ${wave.n}${wave.home ? ` · ${worldName(wave.home)}` : ""}`,
    count: `${wave.size && wave.sold >= wave.size ? `All ${wave.size}` : `${wave.sold} of ${wave.size}`} found a player`,
    label: `Wave ${wave.n}${wave.home ? `, ${theWorld(wave.home)}` : ""}: ${wave.size && wave.sold >= wave.size ? `all ${wave.size}` : `${wave.sold} of ${wave.size}`} ${plural("gnome", wave.size)} found a player`,
    share: wave.size ? Math.min(1, wave.sold / wave.size) : 0,
    legend: legend ? { id: legend.id, name: legend.name, words: `${legend.name} ${sold(legend.id) ? "found a player" : "waits at the flag"}` } : null,
  };
}

// ------------------------------------------------------------ the collection on the game's screens
/** What the menu's Gnomes card, the picker's Collection section and the finish card say of the sale: the
 *  wave to see (on sale, players first, paused, or the next one opening), its size and what found a player,
 *  its lowest price, its Legendary and three faces (an Epic, a Rare, a Common); null when there is none
 *  to show (closed for good, no wave yet published). Dates, never a countdown. */
export interface Promo {
  at: "open" | "players" | "paused" | "teaser";
  n: number;
  home: Home | "";
  size: number;
  sold: number;
  /** ugnot: the lowest price of the tiers the wave holds (0: none above 0, no price said) */
  from: number;
  start: number;
  playersUntil: number;
  legendary: { id: number; name: string; price: number } | null;
  /** an Epic, a Rare, a Common of the wave, those it holds, each with its own tier */
  faces: { id: number; tier: Tier }[];
}
export function promoOf(now: Now, c: Collection, entries: readonly Pick<Listed, "id" | "tier" | "home" | "name">[]): Promo | null {
  const shown = now.at === "soldout" ? (now.next ? { at: "teaser" as const, wave: now.next } : null) : now.at === "closed" || now.at === "none" ? null : { at: now.at, wave: now.wave };
  if (!shown) return null;
  const { row } = shown.wave, inWave = entries.filter((e) => e.id >= row.first && e.id <= row.last);
  const priceOf = (t: string) => row.prices[tierIndex(c, t)] ?? 0, legend = inWave.find((e) => e.tier === "legendary");
  const prices = [...new Set(inWave.map((e) => e.tier))].map(priceOf).filter((p) => p > 0);
  return {
    at: shown.at, n: shown.wave.n, home: shown.wave.home, size: shown.wave.size, sold: shown.wave.sold,
    from: prices.length ? Math.min(...prices) : 0, start: row.start, playersUntil: row.playersUntil,
    legendary: legend ? { id: legend.id, name: legend.name, price: priceOf("legendary") } : null,
    faces: (["epic", "rare", "common"] as const).flatMap((t) => inWave.filter((e) => e.tier === t).slice(0, 1).map((e) => ({ id: e.id, tier: t }))),
  };
}
/** A promo in words: its title ("Wave 1 · the Garden"), what it holds ("104 gnomes, from 36 GNOT") and where it is. */
export function promoWords(p: Promo, now: number) {
  return {
    title: `Wave ${p.n}${p.home ? ` · ${theWorld(p.home)}` : ""}`,
    line: `${p.size} ${plural("gnome", p.size)}${p.from > 0 ? `, from ${gnot(p.from)} GNOT` : ""}`,
    state: p.at === "teaser" ? `Opens ${utcDate(p.start, now, true)}` : p.at === "paused" ? "Paused for a moment"
      : p.at === "players" ? `Players first until ${utcDate(p.playersUntil, now, true)}` : `${p.sold} of ${p.size} found a player`,
  };
}

// ------------------------------------------------------------ why not (A2), every CanBuy code in words
/** What the buy panel says instead of buying: its button's words (off) and one note; play: the note links to a hole. */
export interface WhyNot { button: string; note: string; play?: true }
export function whyNot(r: CanBuy, c: Collection, g: Pick<Listed, "id" | "tier" | "wave" | "home">, now: number): WhyNot | null {
  if (r.ok) return null;
  const t = g.tier as BuyTier, i = tierIndex(c, t), from = `From Wave ${g.wave} · ${worldName(g.home)}.`;
  const wave = waveOf(c, g.id);
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
    case "unknown": case "ids": return { button: "No gnome by that number", note: "" };
    default: return { button: "Can't be bought now", note: `The chain says: ${r.said}.` };
  }
}

// ------------------------------------------------------------ a buy sent, not confirmed
/** Where a buy the wallet gave no hash for stands, by the gnome read again: the buyer's ("mine": it landed), another's
 *  ("taken"), or null, still unsold: nothing landed (yet). */
export const landing = (row: GnomeRow | null, me: string) => (!row || !row.owner ? null : row.owner === me ? "mine" : "taken");

// ------------------------------------------------------------ the bill (shared pieces)
/** What a signature costs, each line in ugnot: the price, the storage deposit for bytes, the network fee for
 *  gas, both as the wallet is asked them (adena.ts depositFor, feeFor); most: their sum; short: what the
 *  balance lacks (0 enough, null unknown). */
export function bill({ price, bytes, storagePrice, gas, gasPrice, balance }: { price: number; bytes: number; storagePrice: number; gas: number; gasPrice: number; balance: number | null }) {
  const deposit = depositFor(bytes, storagePrice), fee = feeFor(gas, gasPrice);
  const lines: [string, number][] = [["Price", price], ["Storage deposit", deposit], ["Network fee", fee]];
  const most = price + deposit + fee;
  return { lines: lines.filter(([k, v]) => v > 0 || k !== "Price"), most, short: balance == null ? null : Math.max(0, most - balance) };
}

// ------------------------------------------------------------ the shelf (A1)
/** A page of the gallery's grid. */
export const PAGE = 48;
export type View = "sale" | "mine" | "all" | "made";
interface Seen { c: Collection; sold: (id: number) => boolean; mine: ReadonlySet<number>; now: number }
/** Whether a gnome is on sale now: in a started wave, not sold, not the closed genesis's. */
export function onSale(e: Some, c: Collection, sold: (id: number) => boolean, now: number) {
  return !sold(e.id) && !closedOut(c, e.id) && c.waves.some((w) => e.id >= w.first && e.id <= w.last && w.start <= now);
}
/** Whether a gnome was never made: the closed genesis's, never sold. */
export const neverMade = (e: Some, s: Seen) => closedOut(s.c, e.id) && !s.sold(e.id);
/** The gallery's list for a view and its filters, in id order (a number searched comes first), and each tier's count in the view. */
export function shelf<E extends Listed>(entries: readonly E[], f: Query & { view: View }, s: Seen) {
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
/** A player's gnomes page's title: their gno.land name, else their short address ("g1abcdef…89cd's gnomes"). */
export const theirTitle = (name: string, who: string) => `${name || shortAddr(who)}'s gnomes`;
/** Whether the gallery says the genesis sale's closing date: one is set (0: none, as a launch may leave it), not yet passed. */
export const showsClosing = (c: Collection) => c.closesAt > 0 && !c.series[0]?.closed;
/** The closing line's place in the shop's head: its line, none, or its room kept while the sale is not read yet (null). */
export const closingSlot = (c: Collection | null): "line" | "none" | "room" => (!c ? "room" : showsClosing(c) ? "line" : "none");
/** Whether a card in the gallery shows Buy: on sale now (its wave open, unsold, the sale not closed) and not the player's. */
export const canBuyCard = (e: Listed, s: Seen) => !s.mine.has(e.id) && onSale(e, s.c, s.sold, s.now);
/** A card's one fact: the price on sale, "Yours", "Found a player", "Never made", or its wave. */
export function cardFact(e: Listed, s: Seen) {
  if (s.mine.has(e.id)) return "Yours";
  if (s.sold(e.id)) return "Found a player";
  if (neverMade(e, s)) return "Never made";
  const w = waveOf(s.c, e.id);
  if (w && w.start <= s.now) return `${gnot(w.prices[tierIndex(s.c, e.tier)] ?? 0)} GNOT`;
  if (w) return `Opens ${utcDate(w.start, s.now, true)}`;
  return `Wave ${e.wave} · ${worldName(e.home)}`;
}

/** The Legendaries the gallery shows coming, to look at: each wave's while no started wave holds it (not published
 *  yet, or its start to come), in id order; none of the genesis once it has closed (a wave not open by then never opens). */
export function comingLegends<E extends Some>(entries: readonly E[], c: Collection, now: number): E[] {
  return entries.filter((e) => e.tier === "legendary" && !closedOut(c, e.id) && !c.waves.some((w) => e.id >= w.first && e.id <= w.last && w.start <= now));
}
/** A coming Legendary's one fact: his wave, no price, no date. */
export const comingFact = (e: Pick<Listed, "wave">) => `Coming · wave ${e.wave}`;

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
