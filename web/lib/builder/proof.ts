// L3, the proof (the design's "Test mode and par"): the hole, holed in one
// period of each weather that moves the ball, replayed the way a save is
// cut, by the realm's own code on the local chain. What it proves is keyed
// by the hole's canonical data with no name and no par: renaming the hole
// or changing its par keeps the proofs, any other change drops them. Par is
// then at least the most strokes a proof took, plus one.
import { boardWork, chainSplit, gasOf } from "../adena";
import { bytesOf, sha256 } from "../sha";
import { FIELD, MAX_PAR, MIN_SHOT_WORK, required } from "./rules";
import { frame, writeDraft } from "./gg1";
import type { Draft, Proof } from "./draft";
import type { LocalChain } from "./localchain";
import type { BuilderHost } from "./wasm";
import type { SimulateFrom, Vec2 } from "../types";

export type { Proof };


/** The key the draft's proofs hold for: sha-256 of its canonical data written with no name and par 0; null if fit refuses it. */
export async function proofKey(d: Draft, host: BuilderHost): Promise<string | null> {
  const hex = canonicalHex({ ...d, title: "", par: 0 }, host);
  if (hex == null) return null;
  return shaOf(hex);
}

/** The sha-256 of data given in hex, as the realm keeps it (Versions "sha"). */
export const shaOf = (hex: string): Promise<string> => sha256(bytesOf(hex));

/** The draft's canonical bytes (framed, written, fit): what is played in test mode and published; null if fit refuses it. */
export function canonicalHex(d: Draft, host: Pick<BuilderHost, "fit">): string | null {
  const { hex, bars } = writeDraft(frame(d), FIELD[d.world]);
  const f = host.fit(hex, bars);
  return f.ok ? f.hex : null;
}

/** How far back the wasm's find looks (local_builder.go findBack). */
export const FIND_BACK = 10_000;

/**
 * The period a proof of kind is played in, at or before now (-1: none in
 * FIND_BACK): the latest of that kind; for wind, the strongest wind of the
 * wind periods in that time, so the sample is a hard one.
 */
export function periodFor(host: BuilderHost, id: string, kind: string, now: number): number {
  host.setperiod(now);
  let p = host.find(id, kind, now);
  if (kind !== "wind") return p;
  let best = p, most = -1;
  for (; p >= 0 && p > now - FIND_BACK; p = host.find(id, kind, p - 1)) {
    const [x, y] = (JSON.parse(host.forecast(id, p)) as { wind: Vec2 }).wind;
    if (Math.hypot(x, y) > most) (most = Math.hypot(x, y)), (best = p);
  }
  return best;
}

/** A round to replay: the hole (its key and id), the weather (kind and period), the shots. */
export interface Played {
  key: string;
  id: string;
  kind: string;
  period: number;
  shots: string[];
}

/**
 * The round replayed as its save would be: each stroke read for its path and
 * work (as the engine keeps them), then cut into commits by the realm's work
 * model and each commit asked of the chain (adena.ts chainSplit), which holds
 * only if every commit plays all its shots and only the last holes. A Proof,
 * or why not in a sentence.
 */
export async function replay(chain: LocalChain, r: Played): Promise<Proof | string> {
  const got = await replayed(chain, r);
  return typeof got === "string" ? got : got.proof;
}

/** replay's Proof, and the gas each of its commits asks for (adena.ts gasOf): what a save of the round sends. */
export async function replayed(chain: LocalChain, r: Played): Promise<{ proof: Proof; gas: number[] } | string> {
  const { id, period, shots } = r;
  if (!shots.length) return "No shot was played.";
  try {
    const [s, fc] = await Promise.all([chain.state(id), chain.weather(id, period)]);
    if ((fc.kind || "") !== r.kind) return `That round was played in another weather than the ${r.kind || "clear"} it is kept for.`;
    const pts: number[] = [], works: number[] = [];
    let rest: Vec2 | null = null, holed = false;
    for (let k = 0; k < shots.length && !holed; k++) {
      const a: SimulateFrom = rest ? await chain.simulateFrom(id, rest, shots[k], k, period) : await chain.simulateRound(id, [shots[k]], period);
      pts.push(a.path.length), works.push(a.work || 0), (rest = a.rest), (holed = a.holed);
      if (holed && k < shots.length - 1) return `The ball dropped at stroke ${k + 1}, before the round's last shot.`;
    }
    if (!holed) return "The ball did not drop: a proof is a round that holes.";
    const maxWork = Math.max(...works);
    if (maxWork > MIN_SHOT_WORK) return `A shot of this round does ${maxWork.toLocaleString("en")} units of work, more than ${MIN_SHOT_WORK.toLocaleString("en")}: on the chain it could be cut short in its dearest weather. Hole it another way.`;
    const work = { ...boardWork(s, { walls: 0, posts: 0, pieces: 0 }, fc.zones), kind: fc.kind, pts, works, fixed: fc.gas || 0 };
    const commits = await chainSplit(chain, { id, shots, period, ...work }, period);
    return { proof: { ...r, shots: [...shots], commits, strokes: shots.length, maxWork }, gas: commits.map(([from, to]) => gasOf(work, from, to)) };
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * L3: the required weathers (required) no proof covers for this hole as it
 * is now (its key) under its id (the weather hangs on it), counting only a
 * proof whose shots stay within minShotWork; none, publishing may open.
 */
export function unproven(proofs: readonly Proof[], world: string, key: string, id: string): string[] {
  const held = new Set(proofs.filter((p) => p.key === key && p.id === id && p.maxWork <= MIN_SHOT_WORK).map((p) => p.kind));
  return required(world).filter((k) => !held.has(k));
}

/** The id the hole as it is now (key) is proved under, for the stepper, Play and Publish alike: next (the alias's next
 *  version, as the chain says: testmode.ts holeId) if every weather is proved there; else null. A round under an earlier
 *  version (published since) proves nothing: the next one has weather of its own. */
export const provedAt = (proofs: readonly Proof[], world: string, key: string, next: string): string | null => (unproven(proofs, world, key, next).length === 0 ? next : null);

/** The ids under prefix that hold a proof of the hole as it is now (key). */
const idsUnder = (proofs: readonly Proof[], key: string, prefix: string) => new Set(proofs.filter((p) => p.key === key && p.id.startsWith(prefix)).map((p) => p.id));
/** The latest id under prefix proving the hole as it is now (key) in every weather; null if none. */
const provedUnder = (proofs: readonly Proof[], world: string, key: string, prefix: string) => [...idsUnder(proofs, key, prefix)].findLast((id) => unproven(proofs, world, key, id).length === 0) ?? null;

/** The id under which the hole as it is now (key) is proved in every weather, among the author's ids for this slug; null if under none. */
export const provedAs = (proofs: readonly Proof[], world: string, key: string, author: string, slug: string) => provedUnder(proofs, world, key, `${author}/${slug}/v`);

/** The same among all the author's addresses (another slug typed since): the one Publish goes back to; null if under none. */
export const provedAnyAs = (proofs: readonly Proof[], world: string, key: string, author: string) => provedUnder(proofs, world, key, `${author}/`);

/** The weathers still to prove for the hole as it is now (key): the fewest under any of the author's ids for this slug; with no author, all. */
export function leftAs(proofs: readonly Proof[], world: string, key: string, author: string | null, slug: string): string[] {
  const ids = author ? idsUnder(proofs, key, `${author}/${slug}/v`) : [];
  return [...ids].map((id) => unproven(proofs, world, key, id)).reduce((a, b) => (b.length < a.length ? b : a), required(world));
}

/** The par the proofs suggest: the most strokes one took, plus one, at most MAX_PAR; 0 with none. */
export function suggestPar(proofs: readonly Pick<Proof, "strokes">[]): number {
  return proofs.length ? Math.min(MAX_PAR, Math.max(...proofs.map((p) => p.strokes)) + 1) : 0;
}

/** The author's own score, the hole's "Beat the builder" line: the strokes of the round that proved it in calm weather (the one most players meet), else the fewest of any; 0 with none. */
export function builderScore(proofs: readonly Pick<Proof, "kind" | "strokes">[]): number {
  return proofs.find((p) => p.kind === "")?.strokes ?? (proofs.length ? Math.min(...proofs.map((p) => p.strokes)) : 0);
}

/** Whether par may be set: a whole number from what the proofs suggest to MAX_PAR (below it, the hole was not shown done in it). */
export function parAllowed(proofs: readonly Pick<Proof, "strokes">[], par: number): boolean {
  const lo = suggestPar(proofs);
  return lo > 0 && Number.isInteger(par) && par >= lo && par <= MAX_PAR;
}
