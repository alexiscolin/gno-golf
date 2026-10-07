// The palette as tiles (lib/builder/tiles.ts): in every Builder world each
// entry in exactly one tile, the tiles by what they do (a look is still its
// own entry: what the chain stores does not change), the five a first hole
// needs first, named plainly, the rest by group; and every look's picture,
// drawn by the game's own meshes (media/builder/tiles.mjs), there and small.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "./scene-harness.ts";
import { loadPalette, type PaletteEntry } from "../lib/builder/palette.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { GROUPS, pictureOf, tilesOf, type Tile } from "../lib/builder/tiles.ts";
import { entryName } from "../lib/builder/names.ts";

const palettes = new Map<string, readonly PaletteEntry[]>();
for (const w of Object.keys(FIELD)) palettes.set(w, await loadPalette(w));
const tiles = (w: string) => { const t = tilesOf(palettes.get(w)!); return [...t.first, ...t.more.flatMap((g) => g.tiles)]; };
const named = (w: string, name: string) => tiles(w).find((t) => t.name === name)!;
const skins = (t: Tile) => t.looks.map((e) => e.skin);

void test("every entry of every Builder world in exactly one tile, each tile one kind and one way of playing", () => {
  for (const [w, p] of palettes) {
    const seen = tiles(w).flatMap((t) => t.looks);
    assert.equal(seen.length, p.length, `${w}: an entry twice or left out`);
    assert.deepEqual(new Set(seen), new Set(p), w);
    for (const t of tiles(w)) {
      assert.equal(new Set(t.looks.map((e) => e.kind)).size, 1, `${w} ${t.name}: one kind`);
      assert.equal(new Set(t.looks.map((e) => `${e.clocks[0]} ${e.bounce?.max ?? ""} ${e.grade?.max ?? ""} ${e.shapes?.join() ?? ""}`)).size, 1, `${w} ${t.name}: its looks play alike`);
      assert.ok(t.does && t.does.split(" ").length <= 3, `${w} ${t.name}: what it does in two or three words: ${t.does}`);
    }
  }
});

void test("the five a first hole needs first, each with its common look first; the rest by group, in order", () => {
  for (const w of palettes.keys()) {
    const { first, more } = tilesOf(palettes.get(w)!);
    assert.deepEqual(first.map((t) => [t.name, t.looks[0].id]), [["Wall", "*/rail/"], ["Bumper", "*/post/bumper"], ["Sand", "*/surface/sand"], ["Water", "*/hazard/water"], ["Slope", "*/slope/"]], w);
    assert.deepEqual(more.map((g) => g.group), GROUPS.filter((g) => more.some((x) => x.group === g)), w);
    assert.ok(!more.some((g) => g.tiles.some((t) => first.some((f) => f.key === t.key))), `${w}: a first tile again under More`);
  }
});

void test("variants that play alike are one tile with looks: water, hills, tunnels, posts", () => {
  assert.deepEqual(skins(named("garden", "Water")).sort(), ["", "canal", "fountain", "lagoon", "tidepool", "water", "wave"]);
  assert.deepEqual(skins(named("island", "Water")).slice(0, 4), ["water", "tidepool", "lagoon", "wave"], "the common look, then the island's own");
  assert.deepEqual(skins(named("mountain", "Drop")).sort(), ["cliff", "crevasse", "serac"]);
  assert.ok(skins(named("town", "Slope")).includes("quarter pipe") && skins(named("town", "Slope")).includes("stairs"));
  assert.deepEqual(skins(named("garden", "Tunnel")).at(-1), "", "the plain look last");
  assert.deepEqual(skins(named("garden", "Bumper")), ["bumper"]);
  assert.ok(!skins(named("garden", "Obstacle")).includes("bumper"));
  assert.deepEqual(skins(named("mountain", "Ice")), ["ice"]);
  assert.ok(skins(named("town", "Floor")).includes("brick") && !skins(named("town", "Sand")).includes("brick"));
  assert.deepEqual(skins(named("town", "Blinking bar")), ["clock hand"], "named for what it does: it blinks, it never sweeps");
  assert.equal(entryName(named("garden", "Tunnel").looks.at(-1)!), "Pipe", "the plain tunnel, a pipe as drawn");
});

void test("every look in every Builder world has its picture: a small WebP of the game's drawing", () => {
  const missing: string[] = [], big: string[] = [];
  for (const [w, p] of palettes) {
    for (const e of p) {
      const f = new URL(`../public${pictureOf(w, e)}`, import.meta.url);
      if (!fs.existsSync(f)) { missing.push(`${w} ${e.id}`); continue; }
      const b = fs.readFileSync(f);
      assert.equal(b.toString("latin1", 8, 12), "WEBP", `${w} ${e.id}`);
      if (b.length > 8192) big.push(`${w} ${e.id} ${b.length} B`);
    }
  }
  assert.deepEqual(missing, [], "no picture: run `node media/builder/tiles.mjs`");
  assert.deepEqual(big, [], "over 8 KB");
});

void test("one name per piece, its own: a clean name for every entry of every world, the same on the board, in the looks and in every sentence", async () => {
  const { entryName, pieceName } = await import("../lib/builder/names.ts");
  const piece = (entry: string) => ({ id: "x", entry, geometry: { t: "post" as const, c: [0, 0] as [number, number], r: 1 }, params: {}, clock: { k: "fixed" as const } });
  const said: [string, string][] = [
    ["*/rail/", "the wall"], ["*/slope/", "the slope"], ["*/post/bumper", "the bumper"], ["*/surface/wetsand", "the wet sand"], ["*/surface/flowerbed", "the flowerbed"],
    ["*/bar/clock hand", "the blinking hand"], ["*/hazard/lagoon", "the lagoon"], ["*/post/rock", "the rock"], ["*/bar/plank", "the plank"], ["*/tunnel/", "the pipe"],
  ];
  for (const [id, want] of said) assert.equal(pieceName(piece(id)), want, id);
  // a word said once in a name, its plural too ("Sand sand", "Logs log", "Clock hand moving bar" never)
  const stem = (w: string) => w.toLowerCase().replace(/(es|s)$/, "");
  for (const [w, p] of palettes) {
    const names = new Map<string, string>();
    for (const e of p) {
      const name = entryName(e), words = name.split(" ");
      assert.match(name, /^[A-Z][a-z-]*( [a-z-]+)*$/, `${w} ${e.id}: "${name}" is words, not an id`);
      assert.equal(new Set(words.map(stem)).size, words.length, `${w} ${e.id}: "${name}" says a word twice`);
      assert.ok(!names.has(name), `${w}: "${name}" names both ${names.get(name)} and ${e.id}`);
      names.set(name, e.id);
      assert.equal(`the ${name.toLowerCase()}`, pieceName(piece(e.id)), `${w} ${e.id}: one name on the board and in a sentence`);
    }
  }
});
