// A community hole judged by the Builder's own rules, before the game lists,
// links or plays it. Anyone can call golf's PublishMine with gnokey and any
// data the chain takes (a cup in a wall, a cup cut off, a world or a piece
// the Builder does not make): the chain checks the format, the limits and the
// work, not how a hole plays or looks. The game shows a community hole only
// if the Builder would have made it: its world the Builder's, its pieces its
// palette's, every rule passed (E1 to E15, the render census), and its bytes
// exactly the ones the Builder writes for it (importing.ts asDraft).
import { asDraft } from "./importing";
import { MAX_BYTES, type ValidateOptions } from "./pipeline";
import type { BuilderHost } from "./wasm";
import { NOT_BUILDER } from "../community";

export { NOT_BUILDER };

export type Verdict = { ok: true } | { ok: false; why: string };
const no = (why: string): Verdict => ({ ok: false, why: `${NOT_BUILDER} ${why}` });

/** The Builder's verdict on a published hole's data (hex, as HoleData gives it); census: the render census (E12), as the editor runs it. */
export async function judge(hex: string, host: BuilderHost, census?: ValidateOptions["census"]): Promise<Verdict> {
  // nothing too big or not hex reaches the decoder
  if (!/^(?:[0-9a-f]{2})+$/.test(hex) || hex.length / 2 > MAX_BYTES) return no("Its data is not a hole's.");
  try {
    host.decode(hex);
  } catch {
    return no("Its data is not a hole's.");
  }
  const r = await asDraft(hex, host, census);
  if (typeof r === "string") return no(r);
  return r.hex === hex ? { ok: true } : no("Its data is not as the Builder writes it.");
}
