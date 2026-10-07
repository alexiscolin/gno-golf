// What stands beside the mountain's moving pieces (lib/scene/mountain.ts
// snowCannon, serac): the gust's snow cannon and the serac's ice tower never
// on the lane, whatever the hole; where no spot off the lane exists the piece
// is refused in the Builder (its census: hidden, "room"; pipeline.ts E12),
// never drawn over the ball. The course's own holes that have them
// (mountain/10's cannon, mountain/15's three seracs) draw as they always have.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { build, keysOf, loadWorld } from "./scene-harness.ts";
import { host, lane, stateOf } from "./builder-fixture.ts";
import { entry, loadPalette } from "../lib/builder/palette.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import type { Draft } from "../lib/builder/draft.ts";
import type { Course, Hole } from "../lib/scene/data.ts";

await loadWorld("mountain");
const palette = await loadPalette("mountain");
const { validate } = await import("../lib/builder/pipeline.ts");
const { census } = await import("../lib/builder/drawn.ts");
const ROOM = /no room beside the lane/;

const { buildHole } = await import("../lib/scene/course.ts");
/** The hole's pieces as built, before the merge (a tower's blocks are its own meshes still). */
const pieces = (s: Hole) => buildHole(s, { defer: true });

/** The points seen from above of each thing so named (its vertices, on the ground), up to a height over where it stands. */
function seen(g: Course, name: string, upTo = Infinity): THREE.Vector3[][] {
  g.updateMatrixWorld(true);
  const out: THREE.Vector3[][] = [];
  g.traverse((o) => {
    if (o.name !== name) return;
    const pts: THREE.Vector3[] = [], y0 = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).y;
    o.traverse((m) => {
      const mesh = m as THREE.Mesh, p = mesh.isMesh ? mesh.geometry.attributes.position : null;
      for (let i = 0; p && i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        if (v.y - y0 <= upTo) pts.push(v);
      }
    });
    out.push(pts);
  });
  return out;
}
// what of each is held off the lane: all of the cannon; the tower where it stands on the ground (the course's own
// seracs lean out toward their spot above it, and draw as they always have)
const HELD: Record<string, number> = { "snow cannon": Infinity, "serac tower": 0.3 };
const onLane = (g: Course, pts: THREE.Vector3[]) => pts.filter((p) => g.userData.terrain.onGreen(p.x, p.z));

void test("the course's own snow cannon and seracs (mountain/10, mountain/15) draw exactly as they always have", () => {
  const golden: Record<string, string> = { "mountain/10": "681e1d49ffbd6bd9", "mountain/15": "4595d63838eae7e6" };
  for (const l of fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n")) {
    const [slot, , , hex] = l.split(" ");
    if (!(slot in golden)) continue;
    host.load(slot, hex);
    host.setperiod(5967997);
    const s = JSON.parse(host.state(slot)) as Hole, g = pieces(s);
    assert.equal(createHash("sha256").update(keysOf(build(s)).join("\n")).digest("hex").slice(0, 16), golden[slot], `${slot}: drawn as before`);
    for (const name of Object.keys(HELD)) for (const pts of seen(g, name, HELD[name])) assert.deepEqual(onLane(g, pts), [], `${slot}: its ${name} off the lane`);
  }
});

void test("a gust or a serac anywhere in a lane: its cannon or tower off the lane, or the piece refused (no room), never drawn over the ball", () => {
  const drafts: [string, (pieces: Draft["pieces"]) => Draft][] = [
    ["lane 30x20", (p) => lane("mountain", p)],
    ["lane 40x30", (p) => lane("mountain", p, 40, 30)],
    ["the dogleg starter", (p) => ({ ...STARTERS.mountain.dogleg, pieces: [...STARTERS.mountain.dogleg.pieces, ...p] })],
  ];
  let refused = 0, stood = 0;
  for (const [what, make] of drafts)
    for (const [id, name, size] of [["mountain/air/gust", "snow cannon", 6], ["mountain/hazard/serac", "serac tower", 4]] as const)
      for (let x = 2; x <= 32; x += 5)
        for (let y = 2; y <= 24; y += 4) {
          const d = make([placePiece(entry(id, palette)!, "x", [x, y], { size })]);
          const v = validate(d, { host, palette, census });
          if (v.issues.some((i) => i.severity === "error" && !ROOM.test(i.text))) continue; // (refused for another rule)
          if (v.issues.some((i) => ROOM.test(i.text))) { refused++; continue; }
          const g = pieces(stateOf(d)), stands = seen(g, name, HELD[name]);
          assert.equal(stands.length, 1, `${what}: ${id} at ${x},${y}: its ${name} drawn`);
          const over = onLane(g, stands[0]);
          assert.equal(over.length, 0, `${what}: ${id} at ${x},${y}: its ${name} on the lane at ${over.slice(0, 3).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ")}`);
          stood++;
        }
  assert.ok(stood > 20 && refused < stood, `placed and stood off the lane: ${stood}, refused for want of room: ${refused}`);
});

void test("a gust against the board's edge, its cannon with nowhere to stand up-wind: refused, said plainly (E12)", () => {
  const d = lane("mountain", [placePiece(entry("mountain/air/gust", palette)!, "x", [0, 6], { size: 6 })]);
  const errs = validate(d, { host, palette, census }).issues.filter((i) => i.severity === "error").map((i) => `${i.rule} ${i.text}`);
  assert.deepEqual(errs.filter((e) => ROOM.test(e)).length, 1, errs.join("; "));
  assert.match(errs.find((e) => ROOM.test(e))!, /^E12 /);
});
