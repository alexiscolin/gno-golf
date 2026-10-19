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
import { allTiles, armedByKey, armOn, foldOpen, GROUPS, lookOf, looksShown, pictureOf, saveFold, tileOf, tilesOf, type Tile } from "../lib/builder/tiles.ts";
import { entryName, TILES } from "../lib/builder/names.ts";

const palettes = new Map<string, readonly PaletteEntry[]>();
for (const w of Object.keys(FIELD)) palettes.set(w, await loadPalette(w));
const tiles = (w: string) => { const t = tilesOf(palettes.get(w)!); return [...t.first, ...t.more.flatMap((g) => g.tiles), ...t.others]; };
const named = (w: string, name: string) => tiles(w).find((t) => t.name === name)!;
const skins = (t: Tile) => t.looks.map((e) => e.skin);
// a tile's place in TILES (what it does), a tile of its own last
const order = (t: Tile) => { const k = TILES.findIndex((d) => `other/${d.key}` === t.key); return k < 0 ? TILES.length : k; };

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

void test("the four a first hole needs first, each with its common look first; the rest by group, in order (a Bank among them: an inner bank)", () => {
  for (const w of palettes.keys()) {
    const { first, more } = tilesOf(palettes.get(w)!);
    assert.deepEqual(first.map((t) => [t.name, t.looks[0].id]), [["Bumper", "*/post/bumper"], ["Sand", "*/surface/sand"], ["Water", "*/hazard/water"], ["Slope", "*/slope/"]], w);
    assert.ok(more.find((g) => g.group === "Walls")?.tiles.some((t) => t.name === "Bank" && t.does === "an inner bank"), `${w}: the Bank under More pieces`);
    assert.deepEqual(more.map((g) => g.group), GROUPS.filter((g) => more.some((x) => x.group === g)), w);
    assert.ok(!more.some((g) => g.tiles.some((t) => first.some((f) => f.key === t.key))), `${w}: a first tile again under More`);
  }
});

void test("a world's own pieces first; another world's under From other worlds, by what they do, each look in one place", () => {
  for (const [w, p] of palettes) {
    const { first, more, others } = tilesOf(p);
    for (const t of [...first, ...more.flatMap((g) => g.tiles)]) assert.ok(t.looks.every((e) => !e.borrowed), `${w} ${t.name}: its own looks only`);
    for (const t of others) assert.ok(t.looks.every((e) => e.borrowed) && t.key.startsWith("other/"), `${w} ${t.name}: borrowed looks only, a key of its own`);
    assert.equal(new Set(tiles(w).map((t) => t.key)).size, tiles(w).length, `${w}: a tile's key twice`);
    assert.deepEqual(others.map((t) => t.key), [...others].sort((a, b) => order(a) - order(b)).map((t) => t.key), `${w}: by what they do`);
  }
  const lent = (w: string, name: string) => tilesOf(palettes.get(w)!).others.find((t) => t.name === name);
  assert.ok(skins(named("garden", "Obstacle")).includes("scarecrow") && !skins(named("garden", "Obstacle")).includes("lamp"), "the garden's scarecrow its own, the town's lamp not");
  assert.ok(skins(lent("garden", "Obstacle")!).includes("lamp"), "the town's lamp under From other worlds");
  assert.ok(skins(named("mountain", "Obstacle")).includes("boulder") && skins(lent("mountain", "Obstacle")!).includes("scarecrow"));
  assert.ok(skins(named("town", "Floor")).includes("brick") && skins(named("island", "Water")).includes("lagoon"));
});

void test("variants that play alike are one tile with looks: water, hills, tunnels, posts", () => {
  assert.deepEqual(skins(named("garden", "Water")).sort(), ["", "water"], "the garden's own ponds (the town's under From other worlds; the shore's not at all)");
  assert.deepEqual(skins(named("island", "Water")).slice(0, 4), ["water", "tidepool", "lagoon", "wave"], "the common look, then the island's own");
  assert.deepEqual(skins(named("mountain", "Drop")).sort(), ["cliff", "crevasse"]);
  assert.ok(skins(named("town", "Slope")).includes("quarter pipe") && skins(named("town", "Slope")).includes("stairs"));
  assert.deepEqual(skins(named("garden", "Tunnel")).at(-1), "", "the plain look last");
  assert.deepEqual(skins(named("garden", "Bumper")), ["bumper"]);
  assert.ok(!skins(named("garden", "Obstacle")).includes("bumper"));
  assert.deepEqual(skins(named("mountain", "Ice")), ["ice"]);
  assert.ok(skins(named("town", "Floor")).includes("brick") && !skins(named("town", "Sand")).includes("brick"));
  assert.deepEqual(skins(named("town", "Blinking bar")), ["clock hand"], "named for what it does: it blinks, it never sweeps");
  assert.equal(entryName(named("garden", "Tunnel").looks.at(-1)!), "Pipe", "the plain tunnel, a pipe as drawn");
});

void test("each piece's looks, in the Inspector: every look of a piece of several, each once, in the tile's order; none for a piece of one", () => {
  for (const w of palettes.keys())
    for (const t of tiles(w)) {
      const shown = looksShown(t);
      if (t.looks.length === 1) assert.deepEqual(shown, [], `${w} ${t.name}: one look, its row is it`);
      else assert.deepEqual(shown.map((e) => e.id), t.looks.map((e) => e.id), `${w} ${t.name}: all its looks, in order`);
      for (const e of t.looks) assert.equal(tileOf(palettes.get(w)!, e.id)?.key, t.key, `${w} ${e.id}: its tile`);
    }
  assert.equal(looksShown(named("garden", "Obstacle")).length, 6, "the garden's obstacle: its six looks");
  assert.deepEqual(looksShown(named("mountain", "Ice")), [], "the ice: one look, none under it");
  assert.equal(tileOf(palettes.get("garden")!, "no/such/entry"), null);
  for (const w of palettes.keys()) {
    const p = palettes.get(w)!, { first, more, others } = tilesOf(p);
    assert.deepEqual(allTiles(p).map((t) => t.key), [...first, ...more.flatMap((g) => g.tiles)].map((t) => t.key), `${w}: every tile of its own, in order`);
    assert.equal(allTiles(p, true).length, allTiles(p).length + others.length, `${w}: the other worlds' after them`);
  }
});

void test("1 to 4 arm the first four pieces, each in its look as chosen (its first until then); past four, nothing", () => {
  const p = palettes.get("island")!, { first } = tilesOf(p);
  assert.deepEqual([0, 1, 2, 3].map((n) => armedByKey(p, n, {})?.id), first.map((t) => t.looks[0].id), "the first look of each");
  const water = first[2], lagoon = water.looks.find((e) => e.skin === "lagoon")!;
  assert.equal(armedByKey(p, 2, { [water.key]: lagoon.id })?.id, lagoon.id, "3: the water as chosen, the lagoon");
  assert.equal(lookOf(water, { [water.key]: lagoon.id }), lagoon);
  assert.equal(lookOf(water, { [water.key]: "a look it has not" }), water.looks[0], "a look not its own: its first");
  assert.equal(armedByKey(p, 4, {}), null, "5: nothing");
});

void test("the moving pieces the course's own holes have: the mountain's snow cannon and falling serac, the island's blowhole, each timed from the start", () => {
  const moving = (w: string) => tilesOf(palettes.get(w)!).more.find((g) => g.group === "Moving pieces")?.tiles ?? [];
  const looks = (w: string, name: string) => moving(w).find((t) => t.name === name)?.looks ?? [];
  assert.deepEqual(looks("mountain", "Moving air").map((e) => [e.id, entryName(e), e.clocks]), [["mountain/air/gust", "Snow cannon", ["substep"]]]);
  assert.deepEqual(looks("mountain", "Timed trap").map((e) => [e.id, e.clocks[0]]), [["mountain/hazard/serac", "substep"]]);
  assert.deepEqual(looks("island", "Timed tunnel").map((e) => [e.id, entryName(e), e.clocks, e.shapes]), [["island/tunnel/blowhole", "Blowhole", ["substep"], ["round"]]]);
  assert.deepEqual(moving("town").map((t) => t.name), ["Blinking bar"]);
  assert.deepEqual(moving("garden"), [], "the garden's own moving pieces are assemblies (the mill, the seesaw): none to place alone");
  assert.ok(!skins(named("mountain", "Drop")).includes("serac"), "the serac falls now and then: a timed trap, not a drop");
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
  // and no picture of a look no world has (one taken out of its palette)
  const looks = new Set([...palettes].flatMap(([w, p]) => p.map((e) => pictureOf(w, e))));
  const dir = new URL("../public/builder/tiles/", import.meta.url);
  const stale = fs.readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".webp") && !looks.has(`/builder/tiles/${f}`));
  assert.deepEqual(stale, [], "a picture of no look: remove it");
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

void test("the palette's folds: More pieces and From other worlds folded at first (the five first in sight, no scroll); as the author leaves them, for the visit; a browser that keeps nothing, at first", () => {
  sessionStorage.clear();
  assert.deepEqual([foldOpen("more"), foldOpen("others"), foldOpen("group/Walls")], [false, false, true]);
  saveFold("more", true), saveFold("others", true);
  assert.deepEqual([foldOpen("more"), foldOpen("others")], [true, true]);
  sessionStorage.clear();
  const real = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", { get: () => { throw new Error("blocked"); }, configurable: true });
  try {
    saveFold("more", true);
    assert.deepEqual([foldOpen("more"), foldOpen("others")], [false, false]);
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", { value: real, configurable: true, writable: true });
  }
});

void test("a piece pressed is armed, always: a second press after a drop refused carries it again (never puts it back); Enter again puts it back", () => {
  const p = palettes.get("garden")!, water = named("garden", "Water").looks[0], wall = p[0];
  assert.equal(armOn(null, water, "press"), water);
  assert.equal(armOn(water, water, "press"), water, "pressed again, still armed: the drag carries it");
  assert.equal(armOn(wall, water, "press"), water);
  assert.equal(armOn(water, water, "key"), null, "Enter again: put back");
  assert.equal(armOn(null, water, "key"), water);
});
