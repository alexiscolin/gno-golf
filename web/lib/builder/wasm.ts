// builder.wasm's host (scripts/wasm.sh builds it): the realm's own checks of
// a hole before it is published (golf's PublishMine: the slug, the data, its
// work, the name and note), and the chain's author.Fit and Encode making a
// draft publishable. A refusal is the realm's sentence, word for word
// (scripts/wasmparity.ts holds them to PublishMine's). No DOM.
import { makeCaller, type Base } from "../sim/wasi";

interface Exports extends Base {
  check(n: number, m: number): void;
  fit(margin: number): void;
  sources(): void;
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

/** A draft fitted: its data (hex), the shift author.Fit applied, the board it sized. */
export type Fitted = { ok: true; hex: string; dx: number; dy: number; w: number; h: number } | { ok: false; why: string };

const refusal = (out: string) => (out.startsWith("panic: ") ? out.slice(7) : null);

export function makeBuilderHost(mod: WebAssembly.Module) {
  const { put, call } = makeCaller<Exports>(mod);
  return {
    /** PublishMine's checks of (slug, data in hex, note), as the realm makes them. */
    check(slug: string, hex: string, note = ""): Checked {
      const out = call((e) => {
        const [n, m] = put(e, slug, hex, note);
        e.check(n, m);
      });
      const why = refusal(out);
      return why != null ? { ok: false, why } : { ok: true, cost: JSON.parse(out) as Cost };
    },
    /** A draft (GG1 in hex, its wall lengths not read) moved and sized by author.Fit, written by Encode. */
    fit(hex: string, margin: number): Fitted {
      const out = call((e) => {
        put(e, hex);
        e.fit(margin);
      });
      const why = refusal(out);
      return why != null ? { ok: false, why } : { ok: true, ...(JSON.parse(out) as { hex: string; dx: number; dy: number; w: number; h: number }) };
    },
    /** {path: sha256} of the deployed .gno files it was built from. */
    sources: () => JSON.parse(call((e) => e.sources())) as Record<string, string>,
  };
}
export type BuilderHost = ReturnType<typeof makeBuilderHost>;
