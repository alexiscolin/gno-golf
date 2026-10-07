// The editor's worker (meter-worker.ts), on its own builder.wasm, so the
// editor never waits for it: the difficulty meter, difficulty.ts's estimate,
// asked again after each edit (the editor debounces; a newer ask makes the
// older one stale, and only the latest is answered); and the proofs carried
// over an edit (carry.ts), each ask answered; and a published hole's level,
// for the game's community list (each ask answered). No worker or one that
// fails: no meter (it never gates anything), no carry (an edit drops the
// proofs), no level (the hole is listed last).
import type { Draft } from "./draft";
import type { Level, Shown } from "./difficulty";
import type { Carried } from "./carry";
import type { Ask, Reply } from "./meter-worker";

export interface Meter {
  /** measure this draft (the one before it no longer counts) */
  ask(d: Draft): void;
  /** the draft's older rounds replayed on hex, its canonical bytes (key: its proof key); null if they could not be */
  carry(d: Draft, hex: string, key: string, author: string): Promise<Carried | null>;
  /** a published hole's level, its data in hex; null if it could not be measured */
  rate(hex: string): Promise<Level | null>;
  stop(): void;
}

/**
 * The worker, its estimates to onEstimate with the draft they are of. Where
 * no worker can run, a meter all the same: each draft asked said not
 * measured (never "measuring" for ever), none carried, no level.
 */
export function makeMeter(onEstimate: (of: Draft, e: Shown | null) => void): Meter {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    return { ask: (d) => onEstimate(d, null), carry: () => Promise.resolve(null), rate: () => Promise.resolve(null), stop: () => {} };
  }
  let worker: Worker | null = new Worker(new URL("./meter-worker.ts", import.meta.url), { type: "module" });
  let run = 0, asked: Draft | null = null, n = 0;
  // the asks each answered (a carry, a level), by number: null for each if the worker goes
  const waiting = new Map<number, (r: Reply | null) => void>();
  const off = () => {
    worker?.terminate();
    worker = null;
    for (const done of waiting.values()) done(null);
    waiting.clear();
  };
  const ask = <T>(make: (n: number) => Ask, read: (r: Reply) => T | null): Promise<T | null> => {
    if (!worker) return Promise.resolve(null);
    const w = worker, k = ++n;
    return new Promise((done) => {
      waiting.set(k, (r) => done(r && read(r)));
      w.postMessage(make(k));
    });
  };
  worker.onmessage = ({ data: r }: MessageEvent<Reply>) => {
    if ("job" in r) return (waiting.get(r.n)?.(r), void waiting.delete(r.n));
    // (an answer with err is none: its wasm did not load, tried again on the next ask)
    if (r.run === run && asked) onEstimate(asked, r.shown);
  };
  // the worker gone (it could not run here): the draft asked said not measured, and every one after (never "measuring" for ever)
  worker.onerror = () => (off(), asked && onEstimate(asked, null));
  return {
    ask(d) {
      if (!worker) return onEstimate(d, null);
      asked = d;
      worker.postMessage({ run: ++run, draft: d } satisfies Ask);
    },
    carry: (draft, hex, key, author) => ask((k) => ({ job: "carry", n: k, draft, hex, key, author }), (r) => ("carried" in r ? r.carried : null)),
    rate: (hex) => ask((k) => ({ job: "rate", n: k, hex }), (r) => ("level" in r ? r.level : null)),
    stop: off,
  };
}
