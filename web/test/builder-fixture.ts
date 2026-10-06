// What the builder's tests share: builder.wasm in its host, a lane drafted
// in a world, and the hole as a player's client gets it (written, fitted,
// HoleState answered by the realm's own code).
import fs from "node:fs";
import { frame, writeDraft } from "../lib/builder/gg1.ts";
import { emptyDraft, type Draft, type Piece } from "../lib/builder/draft.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { makeBuilderHost } from "../lib/builder/wasm.ts";
import type { Hole } from "../lib/scene/data.ts";

export const host = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(new URL("../lib/sim/builder.wasm", import.meta.url))));
/** A community hole's id, for the test mode's reads. */
export const ID = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/fixture/v1";
/** A period the test clock is set to. */
export const PERIOD = 5967997;

export const rail = (id: string, a: [number, number], b: [number, number]): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });

/** A lane of w by h in a world: its rails, the tee and the cup at its ends, the pieces given (a pulse if one needs it), framed. */
export function lane(world: string, pieces: Piece[], w = 30, h = 20): Draft {
  return frame({
    ...emptyDraft(world), title: "Fixture", tee: [3, h / 2], pin: [w - 3, h / 2],
    pieces: [rail("r1", [0, 0], [w, 0]), rail("r2", [w, 0], [w, h]), rail("r3", [w, h], [0, h]), rail("r4", [0, h], [0, 0]), ...pieces],
    pulses: pieces.some((p) => p.clock.k === "stroke") ? [{ every: 3, on: 1, phase: 0 }] : [],
  });
}

/** The draft's canonical bytes (fit), or its refusal thrown. */
export function hexOf(d: Draft): string {
  const { hex, bars } = writeDraft(d, FIELD[d.world]);
  const f = host.fit(hex, bars);
  if (!f.ok) throw new Error(f.why);
  return f.hex;
}

/** The hole as a player's client gets it: HoleState, by the realm's code, at PERIOD. */
export function stateOf(d: Draft): Hole {
  host.load(ID, hexOf(d));
  host.setperiod(PERIOD);
  return JSON.parse(host.state(ID)) as Hole;
}
