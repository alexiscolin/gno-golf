// The editor's worker (meter-worker.ts), on its own builder.wasm, so the
// editor never waits for it: the difficulty meter, difficulty.ts's estimate,
// asked again after each edit (the editor debounces; a newer ask makes the
// older one stale, and only the latest is answered); and the proofs carried
// over an edit (carry.ts), each ask answered. No worker or one that fails: no
// meter (it never gates anything) and no carry (an edit drops the proofs).
import type { Draft } from "./draft";
import type { Shown } from "./difficulty";
import type { Carried } from "./carry";
import type { Ask, Reply } from "./meter-worker";

export interface Meter {
  /** measure this draft (the one before it no longer counts) */
  ask(d: Draft): void;
  /** the draft's older rounds replayed on hex, its canonical bytes (key: its proof key); null if they could not be */
  carry(d: Draft, hex: string, key: string, author: string): Promise<Carried | null>;
  stop(): void;
}

/** The worker, its estimates to onEstimate with the draft they are of; null where there is no worker. */
export function makeMeter(onEstimate: (of: Draft, e: Shown | null) => void): Meter | null {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") return null;
  let worker: Worker | null = new Worker(new URL("./meter-worker.ts", import.meta.url), { type: "module" });
  let run = 0, asked: Draft | null = null, n = 0;
  const carries = new Map<number, (c: Carried | null) => void>();
  const off = () => {
    worker?.terminate();
    worker = null;
    for (const done of carries.values()) done(null);
    carries.clear();
  };
  worker.onmessage = ({ data: r }: MessageEvent<Reply>) => {
    if ("job" in r) return (carries.get(r.n)?.(r.carried), void carries.delete(r.n));
    // (an answer with err is none: its wasm did not load, tried again on the next ask)
    if (r.run === run && asked) onEstimate(asked, r.shown);
  };
  worker.onerror = off;
  return {
    ask(d) {
      if (!worker) return;
      asked = d;
      worker.postMessage({ run: ++run, draft: d } satisfies Ask);
    },
    carry(draft, hex, key, author) {
      if (!worker) return Promise.resolve(null);
      const w = worker;
      return new Promise((done) => {
        carries.set(++n, done);
        w.postMessage({ job: "carry", n, draft, hex, key, author } satisfies Ask);
      });
    },
    stop: off,
  };
}
