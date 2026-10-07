// Test mode's set-up (the hole-builder design's "Test mode and par"): the
// hole's id as it will be published (its weather hangs on it), a period for
// each weather to beat, the row the engine finds the hole by, and the chain
// the engine plays it on: the local chain's answers (builder.wasm, one
// clock) over the network's (the page's links, the rest the engine reads
// and copes without).
import type { Chain } from "../chain";
import type { HoleRow, Versions } from "../types";
import type { Draft } from "./draft";
import type { LocalChain } from "./localchain";
import { periodFor, required } from "./proof";
import { calmPeriod } from "./quickshot";
import type { BuilderHost } from "./wasm";

/** The id the draft will be published under: the alias's next version (Versions), the first for a new alias. */
export function holeId(author: string, slug: string, versions: Versions | null): string {
  const last = versions?.versions.at(-1)?.v ?? 0;
  return `${author}/${slug}/v${last + 1}`;
}

/** The weathers to beat in order (required), each with the period it is played in (periodFor). */
export function plan(host: BuilderHost, id: string, world: string, now: number): { kind: string; period: number }[] {
  return required(world).map((kind) => ({ kind, period: periodFor(host, id, kind, now) }));
}

/** The draft's row, as the test chain lists it: the engine finds the hole there. Listed as a course hole (official): it is the only hole on that chain, and the engine plays a list of community holes apart; what it plays is the wasm's own entry. */
export function holeRow(id: string, d: Draft): HoleRow {
  return { id, name: d.title, official: true, plays: 0, best: 0, proBest: 0, par: d.par || 3, world: d.world, order: 0, next: "", slot: id.replace(/\/v\d+$/, "") };
}

/** The chain the engine plays the draft on: the local one's reads over the network's; the hole's data the draft's bytes, its chain none the takedown list names. */
export function testChain(base: Chain, local: LocalChain, hex: string): Chain {
  return { ...base, ...local, holeData: () => Promise.resolve(hex), chainId: () => Promise.resolve("builder") };
}

/** The id a quick test plays the draft under: no author's (no address is asked), and no proof is ever kept for it. */
export const QUICK_HOLE = "quick/test/v1";

/** A quick test's one weather: calm, at its period (quickshot.ts calmPeriod), the draft loaded under id first. */
export const quickPlan = (host: Pick<BuilderHost, "setperiod" | "find">, id: string): { kind: string; period: number }[] => [{ kind: "", period: calmPeriod(host, id) }];

/** A weather's time in play, as its chip says it: "0:14.2". */
export function clock(ms: number): string {
  const t = Math.floor(ms / 100), s = Math.floor(t / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${t % 10}`;
}
