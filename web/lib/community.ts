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
import type { HoleRow } from "./types";
import type { Verdict } from "./builder/verdict";
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
