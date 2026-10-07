#!/usr/bin/env -S node --experimental-strip-types
// The palette's pictures' holes (media/builder/tiles.mjs draws them): for
// every look of every Builder world, a lane with that one piece in it, as
// placed from the palette, as a player's client gets it (builder.wasm's
// HoleState, at period 1, the census's), and where to look at it: the
// piece's middle on the board, how far it reaches, how high to look (and
// from where, for a hill: more from the side).
// Written as JSON to the file named (stdout without one).
//
//   (from web/) node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs ../scripts/tileholes.ts [out.json] [world/kind-skin …]

import fs from "node:fs";
import type { Piece, V } from "../web/lib/builder/draft.ts";
import type { PaletteEntry } from "../web/lib/builder/palette.ts";

const { host, lane } = await import("../web/test/builder-fixture.ts");
await import("../web/test/scene-harness.ts");
const { loadPalette } = await import("../web/lib/builder/palette.ts");
const { placePiece } = await import("../web/lib/builder/edit.ts");
const { handlesOf } = await import("../web/lib/builder/handles.ts");
const { writeDraft } = await import("../web/lib/builder/gg1.ts");
const { FIELD } = await import("../web/lib/builder/rules.ts");
const { pictureOf } = await import("../web/lib/builder/tiles.ts");

const [out, ...only] = process.argv.slice(2);
/** The lane: as big as it takes for its rails, the tee and the cup to be out of the picture; the piece in its middle. */
const W = 30, H = 30, AT: V = [13, 19];

/** The piece as a picture shows it: a size that reads at a glance, a tunnel's way out far off. */
function pieceOf(e: PaletteEntry): Piece {
  const size = e.kind === "rail" ? 4 : e.kind === "bar" ? 3 : e.kind === "post" ? undefined : e.kind === "tunnel" ? 3 : 4;
  return placePiece(e, "x", AT, { size, to: [26, 6] });
}

/** Where to look: the middle of the piece's handles (its ends, its corners, its centre and rim), and its reach; moving air with what blows it (the mountain's cannon, 2 up-wind of its edge). */
function aim(p: Piece, e: PaletteEntry) {
  const pts = handlesOf(p).map((h) => h.at).filter((v) => !p.params.to || v !== p.params.to);
  if (e.kind === "air" && p.geometry.t !== "post" && p.geometry.t !== "rail" && p.geometry.t !== "bar" && p.geometry.t !== "poly") pts.push([p.geometry.min[0] - 3, p.geometry.min[1]]);
  if (p.geometry.t === "post") pts.push([p.geometry.c[0] - p.geometry.r, p.geometry.c[1] - p.geometry.r], [p.geometry.c[0] + p.geometry.r, p.geometry.c[1] + p.geometry.r]);
  if (p.geometry.t === "bar") pts.push(p.geometry.a, p.geometry.b);
  const xs = pts.map((v) => v[0]), ys = pts.map((v) => v[1]);
  const mid: V = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], across = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1.6);
  // a post stands up (a palm, a lamp, a house): framed taller, looked at higher
  if (p.geometry.t === "post") return { mid, span: across + 1.6, lift: (across + 1.6) * 0.42 };
  // a hill seen more from the side, across its push: its rise shows
  return { mid, span: across, lift: across * 0.12, ...(p.params.grade !== undefined && { from: [0.3, 0.6, 1] }) };
}

const jobs = [];
for (const world of Object.keys(FIELD)) {
  for (const e of await loadPalette(world)) {
    const file = pictureOf(world, e).replace(/^\/builder\/tiles\//, "");
    if (only.length && !only.some((o) => file.startsWith(o))) continue;
    const d = lane(world, [pieceOf(e)], W, H), p = d.pieces.at(-1)!;
    const { hex, bars } = writeDraft(d, FIELD[world]);
    const f = host.fit(hex, bars);
    if (!f.ok) throw new Error(`${file}: ${f.why}`);
    host.load(`tiles/${world}/v1`, f.hex);
    host.setperiod(1);
    const state = JSON.parse(host.state(`tiles/${world}/v1`)) as { start: V; weather?: unknown };
    // (the state's board is the framed draft's: fit keeps a framed draft where it is)
    if (state.start[0] !== d.tee[0] || state.start[1] !== d.tee[1]) throw new Error(`${file}: the state is not where the draft is`);
    jobs.push({ file, world, kind: e.kind, ...aim(p, e), state });
  }
}
const json = JSON.stringify(jobs);
if (out) fs.writeFileSync(out, json);
else process.stdout.write(json);
