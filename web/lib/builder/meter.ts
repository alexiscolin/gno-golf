// The difficulty meter in the editor: difficulty.ts's estimate, run in a
// worker (meter-worker.ts) on its own builder.wasm, so the editor never waits
// for it. Asked again after each edit (the editor debounces); a newer ask
// makes the older one stale, and only the latest is answered. No worker or
// one that fails: no meter (it never gates anything).
import type { Draft } from "./draft";
import type { Shown } from "./difficulty";
import type { Ask, Reply } from "./meter-worker";

export interface Meter {
  /** measure this draft (the one before it no longer counts) */
  ask(d: Draft): void;
  stop(): void;
}

/** The meter, its answers to onEstimate with the draft they are of; null where there is no worker. */
export function makeMeter(onEstimate: (of: Draft, e: Shown | null) => void): Meter | null {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") return null;
  let worker: Worker | null = new Worker(new URL("./meter-worker.ts", import.meta.url), { type: "module" });
  let run = 0, asked: Draft | null = null;
  const off = () => (worker?.terminate(), (worker = null));
  worker.onmessage = ({ data: r }: MessageEvent<Reply>) => {
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
    stop: off,
  };
}
