// builder.wasm's host (scripts/wasm.sh builds it): the realm's own checks of
// a hole before it is published (golf's PublishMine: the slug, the data, its
// work, the name and note), and the chain's author.Fit and Encode making a
// draft publishable. A refusal is the realm's sentence, word for word
// (scripts/wasmparity.ts holds them to PublishMine's). No DOM.
import { makeCaller } from "../sim/wasi";
import { simCalls, type SimExports } from "../sim/host";
import type { GHole } from "./types";
import { MARGIN } from "./gg1";

interface Exports extends SimExports {
  check(n: number, m: number): void;
  fit(n: number, margin: number): void;
  bar(): void;
  decode(): void;
  setperiod(p: bigint): void;
  state(): void;
  extras(stroke: number): void;
  forecast(period: bigint): void;
  find(n: number, from: bigint): bigint;
  commit(n: number, x: number, y: number, stroke: number, period: bigint): void;
}

/**
 * A publishable hole as the realm takes it: its name and note as the chain
 * keeps them, and what it costs, in golf's work units (gas estimates) against
 * the realm's own limits (golf.gno, "The work budget").
 */
export interface Cost {
  name: string;
  note: string;
  /** the data's bytes (at most 32 KB) */
  bytes: number;
  /** its heaviest shot (newWork's bound), at most maxShot */
  bound: number;
  maxShot: number;
  /** a commit's first shot in its dearest weather (worstGas), at most budget */
  worst: number;
  budget: number;
  /** the physics' work that shot may do there (work.next's cap), at least minShot */
  room: number;
  minShot: number;
}

/** The realm's answer: publishable, with its cost, or refused, with the realm's sentence. */
export type Checked = { ok: true; cost: Cost } | { ok: false; why: string };

/** A draft fitted: its data (hex), the shift author.Fit applied (always none: a draft is framed), the board it sized, the extent's low corner. */
export type Fitted = { ok: true; hex: string; dx: number; dy: number; w: number; h: number; lo: [number, number] } | { ok: false; why: string };

const refusal = (out: string) => (out.startsWith("panic: ") ? out.slice(7) : null);

/**
 * builder.wasm's host: golf.wasm's calls (simCalls: load, from, round,
 * sources), the test mode's reads at a clock it sets, and the builder's own.
 */
export function makeBuilderHost(mod: WebAssembly.Module) {
  const caller = makeCaller<Exports>(mod);
  const { put, call, onStart } = caller;
  const sim = simCalls(caller);
  // the test's clock: set on every instance (a refusal's trap starts a new one)
  let clock = 0n;
  onStart((e) => e.setperiod(clock));
  const onHole = sim.onHole;
  return {
    load: sim.load,
    has: sim.has,
    from: sim.from,
    round: sim.round,
    /** The clock the realm's Period reads: a test is played in that period's weather and none past it. */
    setperiod(p: number) {
      clock = BigInt(p);
      call((e) => e.setperiod(clock));
    },
    /** HoleState: the hole as a player's client reads it, fresh (no round, no wear). */
    state: (id: string) => onHole(id, (e) => (put(e, id), e.state())),
    /** Extras: a stroke's pulse pieces. */
    extras: (id: string, stroke: number) => onHole(id, (e) => (put(e, id), e.extras(stroke))),
    /** Weather: the hole's weather in a period (refused past the clock). */
    forecast: (id: string, period: number) => onHole(id, (e) => (put(e, id), e.forecast(BigInt(period)))),
    /** The latest period at or before from whose weather on the hole is kind; -1 if none in 10,000. */
    find(id: string, kind: string, from: number): number {
      let p = -1n;
      const out = onHole(id, (e) => void (p = e.find(put(e, id, kind)[0], BigInt(from))));
      if (refusal(out) != null) throw new Error(refusal(out)!);
      return Number(p);
    },
    /** SimulateCommit: the shots played on from a ball, at stroke, in a period's weather. */
    commit: (id: string, x: number, y: number, stroke: number, shots: string, period: number) =>
      onHole(id, (e) => e.commit(put(e, id, shots)[0], x, y, stroke, BigInt(period))),
    /** PublishMine's checks of (slug, data in hex, note), as the realm makes them. */
    check(slug: string, hex: string, note = ""): Checked {
      const out = call((e) => {
        const [n, m] = put(e, slug, hex, note);
        e.check(n, m);
      });
      const why = refusal(out);
      return why != null ? { ok: false, why } : { ok: true, cost: JSON.parse(out) as Cost };
    },
    /**
     * A draft (GG1 in hex, its wall lengths not read; bars, gg1.ts's lines,
     * made build.Bar's walls) sized by author.Fit and written by Encode: the
     * hole that will be published. Refused out of its frame.
     */
    fit(hex: string, bars = "", margin = MARGIN): Fitted {
      const out = call((e) => e.fit(put(e, hex, bars)[0], margin));
      const why = refusal(out);
      return why != null ? { ok: false, why } : { ok: true, ...(JSON.parse(out) as Omit<Fitted & { ok: true }, "ok">) };
    },
    /** A hole's data as course.Simple has it, every float exact (types.ts GHole); Decode's refusal thrown. */
    decode(hex: string): GHole {
      const out = call((e) => (put(e, hex), e.decode()));
      const why = refusal(out);
      if (why != null) throw new Error(why);
      return JSON.parse(out) as GHole;
    },
    /** build.Bar's four corners for a bar from a to b, thick wide ([] for one of no length). */
    bar(line: string): [number, number][] {
      const out = call((e) => (put(e, line), e.bar()));
      const why = refusal(out);
      if (why != null) throw new Error(why);
      return JSON.parse(out) as [number, number][];
    },
    /** {path: sha256} of the deployed .gno files it was built from. */
    sources: sim.sources,
  };
}
export type BuilderHost = ReturnType<typeof makeBuilderHost>;
