// Proofs that survive an edit (the game-design review's "proofs that
// survive edits"): when the hole changes, each weather's latest round of the
// hole before is replayed whole on the new canonical bytes, by the realm's
// own code (proof.ts replay, as Test mode and Publish replay it). A round
// that still holes, in the strokes it took, is the new hole's proof in that
// weather, keyed to it; the others are said in a plain line, and Test opens
// on the first weather left. Nothing here plays a shot of its own: only the
// author's rounds, replayed. Run in the editor's worker (meter-worker.ts).
import { makeLocalChain } from "./localchain";
import { replay, type Proof } from "./proof";
import { holeRow } from "./testmode";
import type { Draft } from "./draft";
import { weatherName } from "./rules";
import type { BuilderHost } from "./wasm";


/**
 * The rounds to replay for the hole as it is now (key): for each of the
 * author's ids for this slug and each weather, the latest proof of another
 * key, where the hole has none in that weather already.
 */
export function toCarry(proofs: readonly Proof[], key: string, author: string, slug: string): Proof[] {
  const mine = proofs.filter((p) => p.id.startsWith(`${author}/${slug}/v`)), held = new Set(mine.filter((p) => p.key === key).map((p) => `${p.id} ${p.kind}`));
  const last = new Map<string, Proof>();
  for (const p of mine) if (p.key !== key && !held.has(`${p.id} ${p.kind}`)) last.set(`${p.id} ${p.kind}`, p);
  return [...last.values()];
}

/** A round that did not hold on the new hole, in the author's words. */
function brokenLine(kind: string, why: string): string {
  const round = `Your ${weatherName(kind)} round`;
  if (/did not drop/.test(why)) return `${round} now stops short`;
  const early = /dropped at stroke (\d+)/.exec(why);
  if (early) return `${round} now drops at stroke ${early[1]}, before its last shot`;
  if (/another weather/.test(why)) return `${round}'s weather is not this hole's any more`;
  if (/units of work/.test(why)) return `${round} now takes too much work for the chain`;
  return `${round} no longer holds: ${why}`;
}

/** What a carry found: the proofs kept (keyed to the new hole), and the weathers whose round broke, each with its line. */
export interface Carried {
  proofs: Proof[];
  broken: { kind: string; why: string }[];
}

/** The draft's older rounds (toCarry) replayed on hex, its canonical bytes (key: their proof key): kept or broken. */
export async function carry(host: BuilderHost, d: Draft, hex: string, key: string, author: string): Promise<Carried> {
  const out: Carried = { proofs: [], broken: [] };
  for (const p of toCarry(d.proofs, key, author, d.slug)) {
    const r = await replay(makeLocalChain(host, holeRow(p.id, d), hex, p.period), { key, id: p.id, kind: p.kind, period: p.period, shots: p.shots });
    if (typeof r !== "string" && r.strokes === p.strokes) out.proofs.push(r);
    else out.broken.push({ kind: p.kind, why: brokenLine(p.kind, typeof r === "string" ? r : "The ball did not drop.") });
  }
  return out;
}

/** The weathers the hole before (prev, its key) was proved in that the hole now (key) is not: what an edit dropped. */
export function dropped(proofs: readonly Proof[], prev: string | null, key: string): string[] {
  if (!prev || prev === key) return [];
  const now = new Set(proofs.filter((p) => p.key === key).map((p) => p.kind));
  return [...new Set(proofs.filter((p) => p.key === prev && !now.has(p.kind)).map((p) => p.kind))];
}

/** How many keys' proofs a draft keeps: the hole as it is and the few before it (an undo's own draft keeps its own). */
export const KEPT_KEYS = 4;

/** The draft's proofs with the carried ones in, the oldest keys' let go past KEPT_KEYS. */
export function withCarried(proofs: readonly Proof[], carried: readonly Proof[]): Proof[] {
  const all = [...proofs, ...carried], keys: string[] = [];
  for (let i = all.length - 1; i >= 0; i--) if (!keys.includes(all[i].key)) keys.push(all[i].key);
  const keep = new Set(keys.slice(0, KEPT_KEYS));
  return all.filter((p) => keep.has(p.key));
}
