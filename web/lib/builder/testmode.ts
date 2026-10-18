// Play's set-up (the hole-builder design's "Test mode and par"): the hole's
// id as it will be published (its weather hangs on it), a period for each
// weather to beat, the row the engine finds the hole by, and the chain the
// engine plays it on: the local chain's answers (builder.wasm, one clock)
// over the network's (the page's links, the rest the engine reads and copes
// without). With the author's address known, every round played is a try at
// the next weather not holed; without it, a round in calm weather (a try,
// under an id of its own: TRY_HOLE), the address asked once one is holed.
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

/** The chain the engine plays the draft on: the local one's reads over the network's; the hole's data the draft's bytes, its chain
 *  none the takedown list names, nor any node's (its genesis too: the draft's verdict, kept by chain, asks the network nothing). */
export function testChain(base: Chain, local: LocalChain, hex: string): Chain {
  const builder = () => Promise.resolve("builder");
  return { ...base, ...local, holeData: () => Promise.resolve(hex), chainId: builder, genesis: builder };
}

/** The id a round is played under before the author's address is known: no author's, and no proof is ever kept for it. */
export const TRY_HOLE = "try/test/v1";

/** Such a round's one weather: calm, at its period (quickshot.ts calmPeriod), the draft loaded under id first. */
export const tryPlan = (host: Pick<BuilderHost, "setperiod" | "find">, id: string): { kind: string; period: number }[] => [{ kind: "", period: calmPeriod(host, id) }];

/** A weather's time in play, as its chip says it: "0:14.2". */
export function clock(ms: number): string {
  const t = Math.floor(ms / 100), s = Math.floor(t / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${t % 10}`;
}

/** The par in the score card's corner, as the game's card says it ("par 3"): the rounds' once every weather is proved, else the difficulty meter's guess ("par 3?"), else nothing. */
export const parSaid = (par: number, guess: number): string => (par ? `par ${par}` : guess ? `par ${guess}?` : "");

/** A finished card's action: play the weather again (R), back to the editor (Escape), and the one going on: publish. */
export type Act = "again" | "edit" | "publish";
export interface Finished {
  /** "Holed in 3"; "Holed in every weather" */
  title: string;
  /** a sentence under it ("" none) */
  line: string;
  /** the summary's rows: each weather proved, its strokes and its time in play */
  rows?: { weather: string; strokes: string; time: string }[];
  /** the buttons, in order: the way on last, the one primary */
  actions: { act: Act; text: string; key?: string; primary?: boolean }[];
}
const AGAIN = { act: "again", text: "Try again", key: "R" } as const, EDIT = { act: "edit", text: "Back to Build", key: "Esc" } as const;

/**
 * The card of a round holed that does not count, as the game's
 * hole-finished card: why, and play it again. A round that counts has none:
 * the next weather starts on its own (nowSaid), the last one ends on the
 * summary; a try (no address yet) has none either, the HUD asks for the address.
 */
export function finished(o: { strokes: number; kind: string; why?: string }): Finished | null {
  if (!o.why) return null;
  return { title: `Holed in ${o.strokes}`, line: `That ${weatherName(o.kind).toLowerCase()} round doesn't count: ${o.why}`, actions: [{ ...AGAIN, primary: true }, EDIT] };
}

/** The title card a moment as the next weather starts on its own. */
export const nowSaid = (kind: string) => `Now: ${weatherName(kind)}`;

/** Play's one card at the end: each weather proved, its strokes and its time in play (ms: this visit's round; one proved before has none), the par they set, Publish the way on. */
export function summary(rows: readonly { kind: string; strokes: number; ms?: number }[], par: number): Finished {
  return {
    title: "Holed in every weather",
    line: par ? `Par ${par}, from your rounds.` : "",
    rows: rows.map((r) => ({ weather: weatherName(r.kind), strokes: String(r.strokes), time: r.ms != null ? clock(r.ms) : "–" })),
    actions: [AGAIN, EDIT, { act: "publish", text: "Publish →", primary: true }],
  };
}
