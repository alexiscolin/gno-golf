// The game's gate on community holes. Anyone can publish a hole with golf's
// PublishMine through gnokey, bypassing the Builder: the chain checks the
// format, the limits and the work, not how a hole plays or looks. So the game
// lists, links and plays a community hole only once the Builder's own rules
// pass it (lib/builder/verdict.ts judge: its world, its pieces, E1 to E15,
// the render census, the bytes the Builder writes). Each version is judged
// once a browser, its verdict kept by the sha of its data and by its id on its
// chain (its id and genesis: a chain reseeded is another; a version's data
// never changes: one known is never read again), under
// the rules' version (VERDICT_RULES: a change to the rules judges every hole
// again), and only for holes about to be shown. The Builder's code and builder.wasm load
// on the first one (a chunk of their own, never on the game's first load);
// a hole not yet judged is not shown. A hole whose data, or the rules, cannot
// be read right now has no verdict at all (verdictOf throws, nothing kept):
// it is said not to load, with Try again, never to break the rules.
//
// And only once its author holds a best on it, on the chain: the Builder
// proves a hole holeable in every weather before it publishes, but a publish
// with gnokey skips the proof, and the chain checks no such thing. A best is
// the chain's own word that the hole can be holed (authorHoled). Two facts,
// kept apart: the rules' verdict (verdictOf) and the best (heldFor), and one
// gate on them (gateOf: "" plays, "unchecked", "unheld"). The author plays
// and sees their own meanwhile (the account connected, the address this
// browser knows, a publish sent from it: keepOwn).
import { isVersion, type Chain } from "./chain";
import { authorOf, knownAuthor } from "./builder/holes";
import { inTurn } from "./duel";
import { bytesOf, sha256 } from "./sha";
import { fnv1a } from "./sky";
import { takenDown } from "./takedown";
import type { DayRow, HoleRow } from "./types";
import type { Verdict } from "./builder/verdict";
import type { Level } from "./builder/levels";
import type { BuilderHost } from "./builder/wasm";
import type { ValidateOptions } from "./builder/pipeline";

export type { Verdict };

/** The rules' version the kept verdicts were judged under: raise it with any change to the Builder's rules. */
export const VERDICT_RULES = 2;
/** Where a verdict is kept: this, the rules' version, then the sha of the data, or which chain's realm and the version's id. */
export const VERDICT_KEY = "gnogolf.verdict";
/** What the game says of a community hole it will not show. */
export const NOT_BUILDER = "This hole was not made with the Builder rules.";
/** What the game says of a community hole its author has not holed yet (no best of theirs on it, on the chain). */
export const NOT_HOLED = "This hole opens once its maker has holed it.";
/** The two modes a best is kept in. */
export const MODES = ["assisted", "pro"] as const;

// this browser's store, read and written as the rest of the site does: a store that throws reads as empty, keeps nothing
const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {}
};
/** The UTC day of a time (ms), "2026-10-22": the day's pick's, its point's. */
export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Which chain's realm: what this browser keeps of a hole is kept under it (a version's verdict, when an alias was first
 *  published), its id, its genesis (a chain reseeded under the same id is another) and the realm. */
type Which = Pick<Chain, "chainId" | "genesis" | "realm">;
const whichOf = async (chain: Which) => `${await chain.chainId()}|${await chain.genesis()}|${chain.realm}`;

/** What judging reads of a chain: a hole's data, its author's best, and which chain's realm it is (a version's verdict is kept by its id there). */
export type Judging = Pick<Chain, "holeData" | "bests"> & Which;

/** What judging needs: builder.wasm's host, and the render census (the game's scene). */
export interface JudgeDeps {
  load: () => Promise<{ host: BuilderHost; census: NonNullable<ValidateOptions["census"]> }>;
}
const builder: JudgeDeps = {
  load: () => Promise.all([import("./builder/load"), import("./builder/drawn")]).then(([l, d]) => l.loadBuilder().then((host) => ({ host, census: d.census }))),
};

const keyOf = async (hex: string) => `${VERDICT_KEY}|${VERDICT_RULES}|${await sha256(bytesOf(hex))}`;
/** A version's key ("<alias>/v<n>": its data never changes), on its chain's realm; null for an alias (it names the next version once one is published). */
const idKeyOf = async (chain: Judging, id: string) => (isVersion(id) ? `${VERDICT_KEY}|${VERDICT_RULES}|${await whichOf(chain)}|${id}` : null);
const kept = (key: string): Verdict | null => {
  const v = stored(key);
  return v == null ? null : v === "" ? { ok: true } : { ok: false, why: v };
};
const keep = (key: string, v: Verdict) => store(key, v.ok ? "" : v.why);

/** The Builder's verdict on a community hole's version (its id), judged at most once a browser; throws if its data or the rules cannot be read now (no verdict, nothing kept). */
export async function verdictOf(chain: Judging, id: string, deps: JudgeDeps = builder): Promise<Verdict> {
  const idKey = await idKeyOf(chain, id), known = idKey && kept(idKey);
  if (known) return known;
  const hex = await chain.holeData(id);
  const key = await keyOf(hex);
  let v = kept(key);
  if (!v) {
    const [{ judge }, { host, census }] = await Promise.all([import("./builder/verdict"), deps.load()]);
    v = await judge(hex, host, census);
  }
  for (const k of [key, idKey]) if (k) keep(k, v);
  return v;
}

/** Where it is kept that a version's author holds a best on it (only once they do: a best stays its player's), and a
 *  version (or an alias) published from this browser (its author's, who must play it to hold one): this, which chain's
 *  realm, the id. */
export const HOLED_KEY = "gnogolf.holed", OWN_KEY = "gnogolf.own";
// (a hole's best by its version only, whose data never changes; this browser's own also by its alias, which its link names)
const flag = async (chain: Which, key: string, id: string) => (isVersion(id) || key === OWN_KEY ? `${key}|${await whichOf(chain)}|${id}` : null);
const flagged = async (chain: Which, key: string, id: string) => {
  const k = await flag(chain, key, id);
  return !!k && stored(k) === "1";
};
const setFlag = async (chain: Which, key: string, id: string) => {
  const k = await flag(chain, key, id);
  if (k) store(k, "1");
};
/** Marks a hole as published from this browser: its version, and its alias too when the chain was seen naming it
 *  (landed: the link the author is given is the alias); its author plays it here before they hold a best on it. Only
 *  for a transaction sent: Adena's answer, or the landing seen after a gnokey command. */
export const keepOwn = (chain: Which, id: string, landed = false) =>
  Promise.all([setFlag(chain, OWN_KEY, id), landed ? setFlag(chain, OWN_KEY, aliasOf({ id, slot: "" })) : null]).then(() => {});

/** Whether a community hole's author holds a best on it, in either mode (Bests, the chain's word; both asked at once);
 *  kept once they do; throws if it cannot be read now. */
export async function authorHoled(chain: Pick<Chain, "bests"> & Which, id: string): Promise<boolean> {
  const author = authorOf(id);
  if (!author || (await flagged(chain, HOLED_KEY, id))) return true;
  const rows = await Promise.all(MODES.map((m) => chain.bests(id, m, [author])));
  if (!rows.some((b) => b.rows.length)) return false;
  await setFlag(chain, HOLED_KEY, id);
  return true;
}

/** Whether a community hole is open to this player: its author holds a best on it, or it is theirs (self: the account
 *  connected; else the address this browser knows, holes.ts knownAuthor; or published from this browser, keepOwn), to
 *  hole it, on any device; throws if the best cannot be read now. */
export async function heldFor(chain: Pick<Chain, "bests"> & Which, id: string, self?: string | null): Promise<boolean> {
  const author = authorOf(id);
  if (!author || (self ?? knownAuthor()) === author || (await flagged(chain, OWN_KEY, id))) return true;
  return authorHoled(chain, id);
}

/** The community holes a chain's list holds (anyone's latest versions), none taken down; none while the takedown list is unknown (null). */
export const communityOf = (list: readonly HoleRow[], taken: ReadonlySet<string> | null): HoleRow[] =>
  taken ? list.filter((h) => !h.next && h.official === false && !takenDown(taken, h.id)) : [];

/** Why the game will not play a hole (its version or its alias): "" it plays, "unchecked" the Builder's rules refuse it,
 *  "unheld" its author holds no best on it yet (heldFor: never to them). A course hole always plays, never judged (the
 *  realm's own, under no address). The rules and the best asked at once; rejects when either is not read now: the hole
 *  did not load (Try again). */
export type Gate = "" | "unchecked" | "unheld";
export async function gateOf(chain: Judging, id: string, deps: JudgeDeps = builder, self?: string | null): Promise<Gate> {
  if (!authorOf(id)) return "";
  const [v, held] = await Promise.all([verdictOf(chain, id, deps), heldFor(chain, id, self)]);
  return !v.ok ? "unchecked" : held ? "" : "unheld";
}
/** gateOf for a link: nothing against one not read now (it is loaded, and said not to load or to lead nowhere). */
export const linkGate = (chain: Judging, id: string, deps: JudgeDeps = builder, self?: string | null): Promise<Gate> =>
  gateOf(chain, id, deps, self).catch(() => "");

/** Whether this browser already knows a version passes the rules, null if not (never a judging: the phone's /build
 *  screen loads no builder.wasm). */
export async function knownVerdict(chain: Judging, id: string): Promise<Verdict | null> {
  try {
    const idKey = await idKeyOf(chain, id);
    return (idKey && kept(idKey)) || kept(await keyOf(await chain.holeData(id)));
  } catch {
    return null;
  }
}

/** The rows this browser already passed and that are open (heldFor: one read a hole, BESTS_AT_ONCE at a time), in
 *  their order: a list that judges none (the phone's /build). */
export async function knownOnly(chain: Judging, rows: readonly HoleRow[], self?: string | null): Promise<HoleRow[]> {
  const turn = inTurn(BESTS_AT_ONCE);
  const open = await Promise.all(rows.map((h) => turn(async () => (await knownVerdict(chain, h.id))?.ok === true && (await heldFor(chain, h.id, self).catch(() => false)))));
  return rows.filter((_, i) => open[i]);
}

/** How many authors' bests the phone's list asks the chain at once. */
export const BESTS_AT_ONCE = 4;

/** What a list knows of each hole, by id: its verdict, or null for one not read now (no verdict: asked again on Try again). */
export type Verdicts = ReadonlyMap<string, Verdict | null>;
/** What a list knows of each hole, by id: whether it is open to the player (heldFor), null for not read now. */
export type Helds = ReadonlyMap<string, boolean | null>;

/** The rows a list shows: those the Builder's rules passed and open to the player; one not known yet waits, one not read now is not shown. */
export const shownOnly = (rows: readonly HoleRow[], verdicts: Verdicts, held: Helds) => rows.filter((h) => verdicts.get(h.id)?.ok === true && held.get(h.id) === true);

/** A list's page (its first n rows): those shown, whether some are still being judged (the list waits, one move), whether some could not be read, how many rows lie beyond. */
export function pageOf(rows: readonly HoleRow[], n: number, verdicts: Verdicts, held: Helds) {
  const page = rows.slice(0, n), known = (h: HoleRow) => verdicts.has(h.id) && (verdicts.get(h.id)?.ok !== true || held.has(h.id));
  return { rows: shownOnly(page, verdicts, held), judging: !page.every(known), unread: page.some((h) => verdicts.get(h.id) === null || (verdicts.get(h.id)?.ok && held.get(h.id) === null)), more: rows.length - page.length };
}

/** How many holes the day's pick judges, at most, for one the Builder's rules pass. */
export const DAY_TRIES = 8;

/** A listed hole's alias (its slot; a version id less its "/v<n>"). */
export function aliasOf(h: Pick<HoleRow, "id" | "slot">) {
  return h.slot || h.id.replace(/\/v\d+$/, "");
}

// the characters of an address after its "g1" (bech32's), in their byte order
const BECH32 = "023456789acdefghjklmnpqrstuvwxyz";
/** Where in alias order the UTC day's pick starts: the day's hash (sky.ts fnv1a, the realm's) spelled as an address
 *  ("g1" and 13 of its characters), so any alias, of any author, is as likely to follow it. */
export function dayPoint(now: number): string {
  const h = fnv1a(utcDay(now));
  return "g1" + Array.from({ length: 13 }, (_, i) => BECH32[Number((h >> BigInt(5 * (12 - i))) & 31n)]).join("");
}

/** How many candidates one DayCandidates read takes. */
const DAY_PAGE = 25;

/** The hole of the day's candidates, a page at a time: every community hole the realm lists for it (DayCandidates: each
 *  alias's current version, none hidden, in alias order, with the block it was first published at), from the day's
 *  point on and round to it, each once, none the site took down. Whatever is published, versioned or hidden that day,
 *  the holes published before it keep their order from the point: the day's hole (dayHole's: the first published
 *  before the day began that the Builder's rules pass, the same verdict everywhere) is the same for everyone all day,
 *  no server. A page not read throws. */
export async function* dayRows(chain: Pick<Chain, "dayCandidates">, now: number, taken: ReadonlySet<string>, n = DAY_PAGE): AsyncGenerator<DayRow[]> {
  const at = dayPoint(now);
  // from the point to the end, then from the start up to it
  for (const [from, upTo] of [[at, null], ["", at]] as const) {
    let after: string = from;
    do {
      const p = await chain.dayCandidates(after, n);
      const rows = p.rows.filter((h) => (upTo === null || aliasOf(h) < upTo) && !takenDown(taken, h.id));
      if (rows.length) yield rows;
      after = p.next;
    } while (after && (upTo === null || after < upTo));
  }
}

/** The UTC day's first moment (ms). */
export const dayStart = (now: number) => now - (now % 864e5);

/** How many candidates the day's pick passes over for want of their author's best before the day began, at most. */
export const DAY_SKIPS = 4 * DAY_TRIES;

/** What the day's pick waits on: a candidate's alias birth (born), its author's best before the day (held), the rules' verdict. */
export type DayNeed = { what: "born" | "held" | "verdict"; h: Pick<HoleRow, "id" | "slot"> };

/** The day's hole among its candidates (dayRows'): the first whose alias was published before the day began (born: by
 *  alias), whose author held a best on it before the day began too (held: by id, heldBefore: cheap reads, asked first)
 *  and the Builder's rules pass (verdicts: by id): DAY_TRIES refused by the rules at most, DAY_SKIPS passed over for
 *  want of a best at most. Each is the chain's as it stood when the day began, but a best set before it and bettered
 *  since reads as today's (a realm change would keep a best's first height): so the pick is kept in each browser for
 *  the day (keepDay). Null while one before it is not known yet (need: what to ask next, the caller asks and calls
 *  again), or one could not be read (unread: never skipped, so never another hole than everyone else's). */
export function dayHole<H extends Pick<HoleRow, "id" | "slot">>(candidates: readonly H[], born: ReadonlyMap<string, boolean | null>, verdicts: Verdicts, held: Helds = new Map()): { day: H | null; unread: boolean; need?: DayNeed; done?: boolean } {
  let tried = 0, skipped = 0;
  for (const h of candidates) {
    const b = born.get(aliasOf(h));
    if (b === false) continue;
    if (b !== true) return { day: null, unread: b === null, ...(b === undefined && { need: { what: "born" as const, h } }) };
    const before = held.get(h.id);
    if (before !== true && before !== false) return { day: null, unread: before === null, ...(before === undefined && { need: { what: "held" as const, h } }) };
    if (!before) {
      if (++skipped >= DAY_SKIPS) return { day: null, unread: false, done: true };
      continue;
    }
    const v = verdicts.get(h.id);
    if (!v) return { day: null, unread: v === null, ...(v === undefined && { need: { what: "verdict" as const, h } }) };
    if (v.ok) return { day: h, unread: false };
    if (++tried >= DAY_TRIES) return { day: null, unread: false, done: true };
  }
  return { day: null, unread: false };
}

/** Where this browser keeps the day's pick: this, the rules' version, which chain's realm, the UTC day. */
export const DAY_KEY = "gnogolf.day";
const dayKeyOf = async (chain: Which, now: number) => `${DAY_KEY}|${VERDICT_RULES}|${await whichOf(chain)}|${utcDay(now)}`;
/** The day's pick this browser kept (keepDay), null for none (or one not of a community hole's shape, or the store not read). */
export async function keptDay(chain: Which, now: number): Promise<DayRow | null> {
  try {
    const r = JSON.parse(stored(await dayKeyOf(chain, now)) ?? "null") as DayRow | null;
    return r && typeof r === "object" && isVersion(r.id) && authorOf(r.id) && typeof r.slot === "string" && typeof r.name === "string" && typeof r.world === "string" && Number.isFinite(r.par) ? r : null;
  } catch {
    return null;
  }
}
/** Keeps the day's pick in this browser for the UTC day: a player never sees it change under them (a best bettered today). */
export const keepDay = async (chain: Which, now: number, row: DayRow) => store(await dayKeyOf(chain, now), JSON.stringify(row));

/** Whether a community hole's author held a best on it before a time (ms): their best's block (Ghost, both modes asked
 *  at once, a block of 0 the chain's first), its time; throws if it cannot be read now. A best set since the day began
 *  (their first, or a better one) is not. One held is a best held (authorHoled's flag kept). */
export async function heldBefore(chain: Pick<Chain, "ghost" | "blockTime"> & Which, id: string, at: number): Promise<boolean> {
  const author = authorOf(id);
  if (!author) return true;
  const ghosts = await Promise.all(MODES.map((m) => chain.ghost(id, m, author)));
  if (ghosts.some((g) => g)) await setFlag(chain, HOLED_KEY, id);
  for (const g of ghosts) if (g?.height != null && (await chain.blockTime(g.height)) < at) return true;
  return false;
}

/** Where when an alias was first published is kept (ms): this, which chain's realm (its id, genesis, realm), the alias. */
export const BORN_KEY = "gnogolf.born";
/** Whether a candidate's alias was first published before a time: the block DayCandidates gives (born; 0: long before),
 *  its time kept once known (it never changes); throws if it cannot be read now. */
export async function bornBefore(chain: Pick<Chain, "blockTime"> & Which, h: DayRow, at: number): Promise<boolean> {
  if (!h.born) return true;
  const key = `${BORN_KEY}|${await whichOf(chain)}|${aliasOf(h)}`, was = Number(stored(key) ?? NaN);
  const ms = Number.isFinite(was) ? was : await chain.blockTime(h.born);
  if (!Number.isFinite(was)) store(key, String(ms));
  return ms < at;
}

/** How the community holes are listed: as the chain lists them (newest first), by plays, or by the meter's level. */
export type SortBy = "new" | "played" | "hard";
/** The rows in that order (a copy): most plays first, or the hardest first (levels: the meter's, by id; one not rated yet goes last), a tie in the chain's order. */
export function sortHoles(rows: readonly HoleRow[], by: SortBy, levels: ReadonlyMap<string, number | null>): HoleRow[] {
  const key = (h: HoleRow) => (by === "played" ? h.plays : by === "hard" ? (levels.get(h.id) ?? -1) : 0);
  return rows.map((h, i) => ({ h, i })).sort((x, y) => key(y.h) - key(x.h) || x.i - y.i).map(({ h }) => h);
}

/** Where a hole's level on the meter (lib/builder/difficulty.ts, worked out in this browser) is kept: this, which chain's realm (its id, genesis, realm), its version's id. */
export const HARD_KEY = "gnogolf.hardness";
const hardKeyOf = async (chain: Which, id: string) => (isVersion(id) ? `${HARD_KEY}|${await whichOf(chain)}|${id}` : null);
/** The level kept for a version on its chain (its data never changes), null if none, not one, an alias or its chain not read. */
export async function keptLevel(chain: Which, id: string): Promise<Level | null> {
  try {
    const key = await hardKeyOf(chain, id), v = key && stored(key);
    return v === "0" || v === "1" || v === "2" || v === "3" ? (Number(v) as Level) : null;
  } catch {
    return null;
  }
}
/** Keeps a version's level on its chain (an alias's never; nothing when its chain or the store cannot be read). */
export async function keepLevel(chain: Which, id: string, level: Level): Promise<void> {
  try {
    const key = await hardKeyOf(chain, id);
    if (key) store(key, String(level));
  } catch {}
}
