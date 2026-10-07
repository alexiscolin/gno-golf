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

/** The hole of the day's candidates: the listed community holes (communityOf's, in the chain's order) from
 *  the one the hash of the UTC day picks (sky.ts fnv1a, the realm's), on round the list. The day's hole is the
 *  first the Builder's rules pass (verdictOf: the same verdict everywhere; one not read here now is waited for, never
 *  skipped), so the same for everyone, no server. */
export function dayOrder<H>(rows: readonly H[], now: number): H[] {
  if (!rows.length) return [];
  const at = Number(fnv1a(new Date(now).toISOString().slice(0, 10)) % BigInt(rows.length));
  return [...rows.slice(at), ...rows.slice(0, at)];
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
