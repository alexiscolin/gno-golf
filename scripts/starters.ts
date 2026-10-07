#!/usr/bin/env -S node --experimental-strip-types
// The Builder's starter holes (web/lib/builder/starters.ts): three a world,
// made of its palette's pieces (a straight lane, a dogleg, the world's own
// signature piece), each checked by the whole pipeline, and a holing round
// of each in every weather the world asks for (web/test/builder-starters.json,
// found here by search through builder.wasm, replayed into a proof). Run it
// again after a change to the palette, the checks or the physics; the unit
// test (builder-templates.test.ts) holds what it wrote.
//
//   (from web/) node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs ../scripts/starters.ts

import fs from "node:fs";
import type { Draft, Piece, V } from "../web/lib/builder/draft.ts";
import type { PaletteEntry } from "../web/lib/builder/palette.ts";

const { host } = await import("../web/test/builder-fixture.ts");
await import("../web/test/scene-harness.ts");
const { loadPalette } = await import("../web/lib/builder/palette.ts");
const { placePiece } = await import("../web/lib/builder/edit.ts");
const { frame } = await import("../web/lib/builder/gg1.ts");
const { emptyDraft } = await import("../web/lib/builder/draft.ts");
const { validate } = await import("../web/lib/builder/pipeline.ts");
const { census } = await import("../web/lib/builder/drawn.ts");
const { FIELD } = await import("../web/lib/builder/rules.ts");
const { canonicalHex, proofKey, replay } = await import("../web/lib/builder/proof.ts");
const { plan, holeRow } = await import("../web/lib/builder/testmode.ts");
const { makeLocalChain } = await import("../web/lib/builder/localchain.ts");
const { holing } = await import("../web/lib/builder/difficulty.ts");

/** The test id's author (builder-templates.test.ts proves each starter under it) and the clock its weathers are found from. */
const AUTHOR = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv", NOW = 5967997;
const rail = (id: string, a: V, b: V): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });
const ring = (pts: V[]) => pts.map((p, i) => rail(`r${i + 1}`, p, pts[(i + 1) % pts.length]));

function starters(world: string, palette: readonly PaletteEntry[]): Record<string, Draft> {
  const own = (kind: string) => palette.filter((e) => e.kind === kind && e.world === world);
  const posts = [...own("post"), ...palette.filter((e) => e.kind === "post" && e.world === "*" && e.skin)];
  const [post, post2 = post] = posts;
  const straight = frame({ ...emptyDraft(world), title: "Straight", par: 2, tee: [3, 6], pin: [29, 6],
    pieces: [...ring([[0, 0], [32, 0], [32, 12], [0, 12]]), placePiece(post, "p1", [13, 3.5]), placePiece(post2, "p2", [19, 8.5])] });
  const dogleg = frame({ ...emptyDraft(world), title: "Dogleg", par: 3, tee: [3, 5], pin: [25, 22],
    pieces: [...ring([[0, 0], [30, 0], [30, 26], [20, 26], [20, 10], [0, 10]]), placePiece(post, "p1", [27, 5])] });
  // the world's signature: its first own hill, ground or hazard across the middle, else a post of its own
  const zone = [...own("slope"), ...own("surface"), ...own("hazard")][0];
  const sig = zone ? placePiece(zone, "p1", [14, 4], { size: zone.kind === "hazard" ? 3 : 5 }) : placePiece(own("post")[0] ?? post, "p1", [17, 7]);
  const [, kind, skin] = sig.entry.split("/");
  const signature = frame({ ...emptyDraft(world), title: `The ${skin || kind}`, par: 3, tee: [3, 7], pin: [31, 7], pieces: [...ring([[0, 0], [34, 0], [34, 14], [0, 14]]), sig] });
  return { straight, dogleg, signature };
}

const out: Record<string, Record<string, Draft>> = {}, rounds: Record<string, Record<string, { period: number; shots: string[] }>> = {};
let failed = 0;
for (const world of Object.keys(FIELD)) {
  const palette = await loadPalette(world);
  out[world] = {};
  for (const [name, d0] of Object.entries(starters(world, palette))) {
    const slug = `${world}-${name}`, d = { ...d0, slug };
    const errors = validate(d, { host, palette, census }).issues.filter((i) => i.severity === "error");
    if (errors.length) {
      failed++;
      console.error(`refused: ${slug}: ${errors.map((i) => `${i.rule} ${i.text}`).join("; ")}`);
    }
    const id = `${AUTHOR}/${slug}/v1`, hex = canonicalHex(d, host), key = await proofKey(d, host);
    if (errors.length || !hex || !key) continue;
    host.load(id, hex);
    rounds[slug] = {};
    for (const { kind, period } of plan(host, id, world, NOW)) {
      // a holing round by search (difficulty.ts holing: the best of a fan toward the cup each stroke, 8 strokes at most)
      const shots = await holing(host, id, d.tee, d.pin, period);
      const p = shots && (await replay(makeLocalChain(host, holeRow(id, d), hex, period), { key, id, kind, period, shots }));
      if (p && typeof p !== "string") rounds[slug][kind] = { period, shots: p.shots };
      else {
        failed++;
        console.error(`not holed: ${slug} in ${kind || "clear"}${p ? `: ${p}` : ""}`);
      }
    }
    out[world][name] = { ...d, slug: "" };
  }
}
const ts = `// The Builder's starter holes, three a world: written by scripts/starters.ts
// (which also finds a holing round of each in every weather, kept for the
// unit test in web/test/builder-starters.json). Do not edit by hand: change
// the script and run it again.
import type { Draft } from "./draft";

export const STARTERS: Readonly<Record<string, Readonly<Record<string, Draft>>>> = ${JSON.stringify(out, null, 1)};
`;
fs.writeFileSync(new URL("../web/lib/builder/starters.ts", import.meta.url), ts);
fs.writeFileSync(new URL("../web/test/builder-starters.json", import.meta.url), JSON.stringify(rounds, null, 1) + "\n");
console.log(`${Object.values(out).reduce((n, w) => n + Object.keys(w).length, 0)} starters, ${Object.values(rounds).reduce((n, r) => n + Object.keys(r).length, 0)} rounds${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
