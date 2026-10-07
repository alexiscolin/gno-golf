// The game's gate on community holes. Anyone can publish a hole with golf's
// PublishMine through gnokey, bypassing the Builder: the chain checks the
// format, the limits and the work, not how a hole plays or looks. So the game
// lists, links and plays a community hole only once the Builder's own rules
// pass it (lib/builder/verdict.ts judge: its world, its pieces, E1 to E15,
// the render census, the bytes the Builder writes). Each version is judged
// once a browser, its verdict kept by the sha of its data and by its id on its
// chain (a version's data never changes: one known is never read again), under
// the rules' version (VERDICT_RULES: a change to the rules judges every hole
// again), and only for holes about to be shown. The Builder's code and builder.wasm load
// on the first one (a chunk of their own, never on the game's first load);
// a hole not yet judged is not shown. A hole whose data, or the rules, cannot
// be read right now has no verdict at all (verdictOf throws, nothing kept):
// it is said not to load, with Try again, never to break the rules.
import type { Chain } from "./chain";
import { authorOf } from "./builder/holes";
import { bytesOf, sha256 } from "./sha";
import { fnv1a } from "./sky";
import { takenDown } from "./takedown";
import type { HoleRow } from "./types";
import type { Verdict } from "./builder/verdict";
import type { Level } from "./builder/levels";
import type { BuilderHost } from "./builder/wasm";
import type { ValidateOptions } from "./builder/pipeline";

export type { Verdict };

/** The rules' version the kept verdicts were judged under: raise it with any change to the Builder's rules. */
export const VERDICT_RULES = 1;
/** Where a verdict is kept: this, the rules' version, the sha of the data. */
export const VERDICT_KEY = "gnogolf.verdict";
/** What the game says of a community hole it will not show. */
export const NOT_BUILDER = "This hole was not made with the Builder rules.";

/** What judging reads of a chain: a hole's data, and which chain's realm it is (a version's verdict is kept by its id there). */
export type Judging = Pick<Chain, "holeData" | "chainId" | "realm">;

/** What judging needs: builder.wasm's host, and the render census (the game's scene). */
export interface JudgeDeps {
  load: () => Promise<{ host: BuilderHost; census: NonNullable<ValidateOptions["census"]> }>;
}
const builder: JudgeDeps = {
  load: () => Promise.all([import("./builder/load"), import("./builder/drawn")]).then(([l, d]) => l.loadBuilder().then((host) => ({ host, census: d.census }))),
};

const keyOf = async (hex: string) => `${VERDICT_KEY}|${VERDICT_RULES}|${await sha256(bytesOf(hex))}`;
/** A version's key ("<alias>/v<n>": its data never changes), on its chain's realm; null for an alias (it names the next version once one is published). */
const idKeyOf = async (chain: Judging, id: string) => (/\/v\d+$/.test(id) ? `${VERDICT_KEY}|${VERDICT_RULES}|${await chain.chainId()}|${chain.realm}|${id}` : null);
const kept = (key: string): Verdict | null => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? null : v === "" ? { ok: true } : { ok: false, why: v };
  } catch {
    return null;
  }
};
const keep = (key: string, v: Verdict) => {
  try {
    localStorage.setItem(key, v.ok ? "" : v.why);
  } catch {}
};

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

/** The community holes a chain's list holds (anyone's latest versions), none taken down; none while the takedown list is unknown (null). */
export const communityOf = (list: readonly HoleRow[], taken: ReadonlySet<string> | null): HoleRow[] =>
  taken ? list.filter((h) => !h.next && h.official === false && !takenDown(taken, h.id)) : [];

/** Whether the game may play a hole (its version or its alias): a course hole always, never judged (the
 *  realm's own, under no address); a community hole (PublishMine's, under its author's address) once its verdict
 *  passes. Rejects when there is no verdict (its data or the rules not read now): the hole did not load. */
export const playable = async (chain: Judging, id: string, deps: JudgeDeps = builder): Promise<boolean> =>
  !authorOf(id) || verdictOf(chain, id, deps).then((v) => v.ok);

/** Whether the Builder's rules refuse a hole: only on a verdict that refuses it, never for one not read now (a link to it,
 *  or to an id the chain has not, is loaded, and said not to load or to lead nowhere). */
export const refused = (chain: Judging, id: string, deps: JudgeDeps = builder): Promise<boolean> =>
  playable(chain, id, deps).then((ok) => !ok, () => false);

/** A verdict this browser already has for a version, null if none: never a judging (the phone's /build screen loads no builder.wasm). */
export async function knownVerdict(chain: Judging, id: string): Promise<Verdict | null> {
  try {
    const idKey = await idKeyOf(chain, id);
    return (idKey && kept(idKey)) || kept(await keyOf(await chain.holeData(id)));
  } catch {
    return null;
  }
}

/** The rows this browser already passed, in their order: a list that judges none (the phone's /build). */
export async function knownOnly(chain: Judging, rows: readonly HoleRow[]): Promise<HoleRow[]> {
  const known = await Promise.all(rows.map((h) => knownVerdict(chain, h.id)));
  return rows.filter((_, i) => known[i]?.ok === true);
}

/** What a list knows of each hole, by id: its verdict, or null for one not read now (no verdict: asked again on Try again). */
export type Verdicts = ReadonlyMap<string, Verdict | null>;

/** The rows a list shows: those the Builder's rules passed; one not judged yet waits, one not read now is not shown. */
export const shownOnly = (rows: readonly HoleRow[], verdicts: Verdicts) => rows.filter((h) => verdicts.get(h.id)?.ok === true);

/** A list's page (its first n rows): those shown, whether some are still being judged (the list waits, one move), whether some could not be read, how many rows lie beyond. */
export function pageOf(rows: readonly HoleRow[], n: number, verdicts: Verdicts) {
  const page = rows.slice(0, n);
  return { rows: shownOnly(page, verdicts), judging: page.some((h) => !verdicts.has(h.id)), unread: page.some((h) => verdicts.get(h.id) === null), more: rows.length - page.length };
}

/** How many holes the day's pick judges, at most, for one the Builder's rules pass. */
export const DAY_TRIES = 8;

/** A listed hole's alias (its slot; a version id less its "/v<n>"). */
export const aliasOf = (h: Pick<HoleRow, "id" | "slot">) => h.slot || h.id.replace(/\/v\d+$/, "");

/** The hole of the day's candidates: the listed community holes (communityOf's) in the UTC day's own order, each alias
 *  hashed with the day (sky.ts fnv1a, the realm's), so a hole published, versioned or taken down moves no other. The
 *  day's hole is dayHole's: the first published before the day began that the Builder's rules pass (the same verdict
 *  everywhere), so the same for everyone all day, no server. */
export function dayOrder<H extends Pick<HoleRow, "id" | "slot">>(rows: readonly H[], now: number): H[] {
  const day = new Date(now).toISOString().slice(0, 10);
  return rows.map((h) => ({ h, k: fnv1a(`${day} ${aliasOf(h)}`) })).sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : 0)).map(({ h }) => h);
}

/** The UTC day's first moment (ms). */
export const dayStart = (now: number) => now - (now % 864e5);

/** The day's hole among its candidates (dayOrder's): the first whose alias was published before the day began (born: by
 *  alias) and the Builder's rules pass (verdicts: by id), DAY_TRIES judged at most; null while one before it is not known
 *  yet, or one could not be read (unread: never skipped, so never another hole than everyone else's). */
export function dayHole<H extends Pick<HoleRow, "id" | "slot">>(candidates: readonly H[], born: ReadonlyMap<string, boolean | null>, verdicts: Verdicts): { day: H | null; unread: boolean } {
  let tried = 0;
  for (const h of candidates) {
    const b = born.get(aliasOf(h));
    if (b === false) continue;
    const v = b ? verdicts.get(h.id) : b;
    if (v === undefined || v === null) return { day: null, unread: v === null };
    if (v.ok) return { day: h, unread: false };
    if (++tried >= DAY_TRIES) break;
  }
  return { day: null, unread: false };
}

/** Where when an alias was first published is kept (ms): this, its chain's realm, the alias. */
export const BORN_KEY = "gnogolf.born";
/** Whether a community hole's alias was first published before a time: its oldest version's block (Versions, then that
 *  block's time), kept once known (it never changes); throws if it cannot be read now. */
export async function bornBefore(chain: Pick<Chain, "versions" | "blockTime" | "chainId" | "realm">, alias: string, at: number): Promise<boolean> {
  const key = `${BORN_KEY}|${await chain.chainId()}|${chain.realm}|${alias}`;
  let ms: number | null = null;
  try {
    const v = Number(localStorage.getItem(key) ?? NaN);
    if (Number.isFinite(v)) ms = v;
  } catch {}
  if (ms == null) {
    const first = (await chain.versions(alias)).versions[0];
    ms = first ? await chain.blockTime(first.height) : Infinity; // (no version: not one listed before)
    try {
      if (Number.isFinite(ms)) localStorage.setItem(key, String(ms));
    } catch {}
  }
  return ms < at;
}

/** How the community holes are listed: as the chain lists them (newest first), by plays, or by the meter's level. */
export type SortBy = "new" | "played" | "hard";
/** The rows in that order (a copy): most plays first, or the hardest first (levels: the meter's, by id; one not rated yet goes last), a tie in the chain's order. */
export function sortHoles(rows: readonly HoleRow[], by: SortBy, levels: ReadonlyMap<string, number | null>): HoleRow[] {
  const key = (h: HoleRow) => (by === "played" ? h.plays : by === "hard" ? (levels.get(h.id) ?? -1) : 0);
  return rows.map((h, i) => ({ h, i })).sort((x, y) => key(y.h) - key(x.h) || x.i - y.i).map(({ h }) => h);
}

/** Where a hole's level on the meter (lib/builder/difficulty.ts, worked out in this browser) is kept: this, its version's id. */
export const HARD_KEY = "gnogolf.hardness";
/** The level kept for a version (its data never changes), null if none or not one. */
export function keptLevel(id: string): Level | null {
  try {
    const v = localStorage.getItem(`${HARD_KEY}|${id}`);
    return v === "0" || v === "1" || v === "2" || v === "3" ? (Number(v) as Level) : null;
  } catch {
    return null;
  }
}
export function keepLevel(id: string, level: Level): void {
  try {
    localStorage.setItem(`${HARD_KEY}|${id}`, String(level));
  } catch {}
}
