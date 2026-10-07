// The difficulty meter's worker (meter.ts): builder.wasm in its own host,
// off the main thread, so the meter never holds a frame of the editor. One
// run at a time, the latest asked for: a newer one asked mid-run takes over
// at the next fan (difficulty.ts pause), the older one dropped unanswered.
import { estimate, shown, type Shown } from "./difficulty";
import { loadBuilder } from "./load";
import type { Draft } from "./draft";

/** What the editor asks: a run's number and the draft as kept. */
export type Ask = { run: number; draft: Draft };
/** Its answer: the run's estimate as the editor shows it (null: fit refused the draft), or what went wrong. */
export type Reply = { run: number; shown: Shown | null; err?: string };

let latest = 0;
/** Between fans: the messages waiting are let in, and the run goes on only if it is still the latest. */
const still = (run: number) => () => new Promise<boolean>((ok) => setTimeout(() => ok(run === latest), 0));

self.onmessage = async ({ data: m }: MessageEvent<Ask>) => {
  latest = m.run;
  let r: Reply;
  try {
    const host = await loadBuilder();
    if (m.run !== latest) return;
    const est = await estimate(host, m.draft, { pause: still(m.run) });
    if (m.run !== latest) return;
    r = { run: m.run, shown: est && shown(est) };
  } catch (e) {
    r = { run: m.run, shown: null, err: String(e) };
  }
  postMessage(r);
};
