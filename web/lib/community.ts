// The game's gate on community holes. Anyone can publish a hole with golf's
// PublishMine through gnokey, bypassing the Builder: the chain checks the
// format, the limits and the work, not how a hole plays or looks. So the game
// lists, links and plays a community hole only once the Builder's own rules
// pass it (lib/builder/verdict.ts judge: its world, its pieces, E1 to E15,
// the render census, the bytes the Builder writes). Each version is judged
// once a browser, its verdict kept by the sha of its data under the rules'
// version (VERDICT_RULES: a change to the rules judges every hole again), and
// only for holes about to be shown. The Builder's code and builder.wasm load
// on the first one (a chunk of their own, never on the game's first load);
// a hole whose data cannot be read, or not yet judged, is not shown.
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

/** What judging needs: builder.wasm's host, and the render census (the game's scene). */
export interface JudgeDeps {
  load: () => Promise<{ host: BuilderHost; census: NonNullable<ValidateOptions["census"]> }>;
}
const builder: JudgeDeps = {
  load: () => Promise.all([import("./builder/load"), import("./builder/drawn")]).then(([l, d]) => l.loadBuilder().then((host) => ({ host, census: d.census }))),
};

const keyOf = async (hex: string) => `${VERDICT_KEY}|${VERDICT_RULES}|${await sha256(bytesOf(hex))}`;
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

/** The Builder's verdict on a community hole's version (its id), judged at most once a browser. */
export async function verdictOf(chain: Pick<Chain, "holeData">, id: string, deps: JudgeDeps = builder): Promise<Verdict> {
  let hex: string;
  try {
    hex = await chain.holeData(id);
  } catch {
    return { ok: false, why: "This hole's data could not be read." };
  }
  const key = await keyOf(hex), was = kept(key);
  if (was) return was;
  const [{ judge }, { host, census }] = await Promise.all([import("./builder/verdict"), deps.load()]);
  const v = await judge(hex, host, census);
  keep(key, v);
  return v;
}

/** The community holes a chain's list holds (anyone's latest versions), none taken down; none while the takedown list is unknown (null). */
export const communityOf = (list: readonly HoleRow[], taken: ReadonlySet<string> | null): HoleRow[] =>
  taken ? list.filter((h) => !h.next && h.official === false && !takenDown(taken, h.id)) : [];

/** Whether the game may play a hole (its version or its alias): a course hole always, never judged (the
 *  realm's own, under no address); a community hole (PublishMine's, under its author's address) once its verdict passes. */
export const playable = async (chain: Pick<Chain, "holeData">, id: string, deps: JudgeDeps = builder): Promise<boolean> =>
  !authorOf(id) || verdictOf(chain, id, deps).then((v) => v.ok, () => false); // (the rules not loaded: no, and nothing kept)

/** A verdict this browser already has for a version, null if none: never a judging (the phone's /build screen loads no builder.wasm). */
export async function knownVerdict(chain: Pick<Chain, "holeData">, id: string): Promise<Verdict | null> {
  try {
    return kept(await keyOf(await chain.holeData(id)));
  } catch {
    return null;
  }
}

/** The rows this browser already passed, in their order: a list that judges none (the phone's /build). */
export async function knownOnly(chain: Pick<Chain, "holeData">, rows: readonly HoleRow[]): Promise<HoleRow[]> {
  const known = await Promise.all(rows.map((h) => knownVerdict(chain, h.id)));
  return rows.filter((_, i) => known[i]?.ok === true);
}

/** The rows a list shows: those the Builder's rules passed (verdicts: by id); one not judged yet waits. */
export const shownOnly = (rows: readonly HoleRow[], verdicts: ReadonlyMap<string, Verdict>) => rows.filter((h) => verdicts.get(h.id)?.ok === true);

/** A list's page (its first n rows): those shown, whether some are still being judged (the list waits, one move), how many rows lie beyond. */
export function pageOf(rows: readonly HoleRow[], n: number, verdicts: ReadonlyMap<string, Verdict>) {
  const page = rows.slice(0, n);
  return { rows: shownOnly(page, verdicts), judging: page.some((h) => !verdicts.has(h.id)), more: rows.length - page.length };
}

/** The hole of the day's candidates: the listed community holes (communityOf's, in the chain's order) from
 *  the one the hash of the UTC day picks (sky.ts fnv1a, the realm's), on round the list. The day's hole is the
 *  first the Builder's rules pass (verdictOf: the same verdict everywhere), so the same for everyone, no server. */
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
