// Test mode's chain: the slice of makeChain the engine plays a hole on,
// answered by builder.wasm (the realm's own code) for a hole the chain does
// not have yet. Every answer agrees on one clock, the proof's period p:
// period() is p, now() a time inside it (so the engine never moves the round
// to another weather), the state and the weather are p's, and a weather past
// it is refused as the realm refuses it. Answers are checked as the chain's
// are (chain.ts checks); a refusal is the realm's sentence, as from the chain.
import { checks, RULES, type Chain } from "../chain";
import type { HoleRow, Vec2 } from "../types";
import type { BuilderHost } from "./wasm";

/** What the engine and the proof read of a chain, locally. */
export type LocalChain = Pick<Chain, "holes" | "state" | "period" | "now" | "weather" | "simulateFrom" | "simulateRound" | "simulateCommit" | "extras">;

const answer = <T>(out: string, ok: (v: unknown) => v is T): Promise<T> => {
  if (out.startsWith("panic: ")) return Promise.reject(Object.assign(new Error(out.slice(7)), { kind: "chain" as const }));
  try {
    const v: unknown = JSON.parse(out);
    if (ok(v)) return Promise.resolve(v);
  } catch {}
  return Promise.reject(new Error("The builder's answer is not one the chain would give."));
};

/** The draft's hole (row: as the chain would list it; hex: its canonical data), played at period p. */
export function makeLocalChain(host: BuilderHost, row: HoleRow, hex: string, p: number): LocalChain {
  host.load(row.id, hex);
  // (the host is shared: its clock set again before each read that depends on it)
  const at = <T>(f: () => string, ok: (v: unknown) => v is T) => (host.setperiod(p), answer(f(), ok));
  return {
    holes: () => Promise.resolve([row]),
    state: (id: string) => at(() => host.state(id), checks.state),
    period: () => Promise.resolve(p),
    now: () => p * RULES.periodMs + RULES.periodMs / 2,
    weather: (id: string, q: number) => at(() => host.forecast(id, q), checks.weather),
    simulateFrom: (id: string, ball: Vec2, shot: string, stroke: number, q: number) => at(() => host.from(id, ball[0], ball[1], shot, stroke, q), checks.simFrom),
    simulateRound: (id: string, shots: readonly string[], q: number | null | undefined) => at(() => host.round(id, shots.join(";"), q ?? p), checks.simRound),
    simulateCommit: (id: string, ball: Vec2, stroke: number, shots: readonly string[], q: number) => at(() => host.commit(id, ball[0], ball[1], stroke, shots.join(";"), q), checks.simRound),
    extras: (id: string, stroke: number) => at(() => host.extras(id, Math.max(0, stroke | 0)), checks.extras),
  };
}
