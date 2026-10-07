// The editor's worker (meter.ts): builder.wasm off the main thread, so
// nothing here holds a frame of the editor. Two jobs, each on a host of its
// own (one's clock and loaded hole never another's):
// - the difficulty meter: one run at a time, the latest asked for; a newer
//   one asked mid-run takes over at the next fan (difficulty.ts pause), the
//   older one dropped unanswered;
// - the proofs carried over an edit (carry.ts): the author's rounds replayed
//   on the new bytes, each ask answered.
import { estimate, shown, type Shown } from "./difficulty";
import { carry, type Carried } from "./carry";
import { loadBuilder, loadModule } from "./load";
import { makeBuilderHost, type BuilderHost } from "./wasm";
import type { Draft } from "./draft";

/** What the editor asks: a run's number and the draft as kept (the meter), or a carry of its proofs onto its bytes. */
export type Ask = { run: number; draft: Draft } | { job: "carry"; n: number; draft: Draft; hex: string; key: string; author: string };
/** Its answer: the run's estimate as the editor shows it (null: fit refused the draft), or what went wrong; a carry's outcome (null: it failed). */
export type Reply = { run: number; shown: Shown | null; err?: string } | { job: "carry"; n: number; carried: Carried | null };

let latest = 0, replays: Promise<BuilderHost> | null = null;
/** Between fans: the messages waiting are let in, and the run goes on only if it is still the latest. */
const still = (run: number) => () => new Promise<boolean>((ok) => setTimeout(() => ok(run === latest), 0));

self.onmessage = async ({ data: m }: MessageEvent<Ask>) => {
  if ("job" in m) {
    let carried: Carried | null = null;
    try {
      replays ??= loadModule().then(makeBuilderHost);
      carried = await carry(await replays, m.draft, m.hex, m.key, m.author);
    } catch {
      replays = null; // (none carried: the edit dropped them, as before)
    }
    return postMessage({ job: "carry", n: m.n, carried } satisfies Reply);
  }
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
