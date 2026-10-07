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
import { periodFor } from "./proof";
import { required, weatherName } from "./rules";
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

/** The test's par in the score card's corner, as the game's card says it ("par 3"): the rounds' once every weather is proved, else the difficulty meter's guess ("par 3?"), else nothing. */
export const parSaid = (par: number, guess: number): string => (par ? `par ${par}` : guess ? `par ${guess}?` : "");

/** A finished card's action: play the weather again (R), back to the editor (Escape), and the one going on: prove it (a quick test's), publish. */
export type Act = "again" | "edit" | "prove" | "publish";
export interface Finished {
  /** "Holed in 3"; "Every weather proved" */
  title: string;
  /** a sentence under it ("" none) */
  line: string;
  /** the summary's rows: each weather proved, its strokes and its time in play */
  rows?: { weather: string; strokes: string; time: string }[];
  /** the buttons, in order: the way on last, the one primary; off: why it waits */
  actions: { act: Act; text: string; key?: string; primary?: boolean; off?: string }[];
}
const AGAIN = { act: "again", text: "Try again", key: "R" } as const, EDIT = { act: "edit", text: "Back to edit", key: "Esc" } as const;

/**
 * The card of a round holed in a test, as the game's hole-finished card: a
 * quick test's (never a proof: Prove it is the way on), or a round of
 * Prove's that does not count (why, and play it again). A round of Prove's
 * that counts has none: the next weather starts on its own (provedNote),
 * the last one ends on the summary.
 */
export function finished(o: { quick: boolean; strokes: number; kind: string; why?: string; proveOff?: string }): Finished | null {
  const title = `Holed in ${o.strokes}`;
  if (o.quick) return { title, line: "Prove it in every weather to publish it.", actions: [AGAIN, EDIT, { act: "prove", text: "Prove it", primary: true, ...(o.proveOff ? { off: o.proveOff } : {}) }] };
  if (!o.why) return null;
  return { title, line: `That ${weatherName(o.kind).toLowerCase()} round doesn't count: ${o.why}`, actions: [{ ...AGAIN, primary: true }, EDIT] };
}

/** The HUD's brief word as a weather is proved and the next one starts on its own. */
export const provedNote = (kind: string, next: string) => `${weatherName(kind)} proved · next: ${weatherName(next)}`;

/** Prove's one card at the end: each weather proved, its strokes and its time in play (ms: this visit's round; one proved before has none), the par they set, Publish the way on. */
export function summary(rows: readonly { kind: string; strokes: number; ms?: number }[], par: number): Finished {
  return {
    title: "Every weather proved",
    line: par ? `Par ${par}, from your rounds.` : "",
    rows: rows.map((r) => ({ weather: weatherName(r.kind), strokes: String(r.strokes), time: r.ms != null ? clock(r.ms) : "–" })),
    actions: [AGAIN, EDIT, { act: "publish", text: "Publish →", primary: true }],
  };
}
