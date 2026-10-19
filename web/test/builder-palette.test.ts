// The hole builder's palette (lib/builder/palette.ts): every entry, in every
// world it is offered in, is drawn by the game's own code as itself (not as
// the plain form an unknown skin falls back to), and is bound to physics the
// chain takes: its ranges inside GG1's bounds, and its piece, placed as the
// editor places it (edit.ts) at the ends of its ranges, published by
// builder.wasm's PublishMine checks. Every drawing the scene declares is in
// the palette or in HAND_ONLY, with why.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { added, drawn, loadWorld, worldOf } from "./scene-harness.ts";
import { BINDINGS, HAND_ONLY, HOME, WORLD_NAMES, commonOf, entry, loadPalette, sharedSkins, type PaletteEntry } from "../lib/builder/palette.ts";
import { FIELD, MAX_BOUNCE, WEATHER, kicks } from "../lib/builder/rules.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { writeDraft } from "../lib/builder/gg1.ts";
import { host, lane, stateOf } from "./builder-fixture.ts";

// the Builder's worlds (FIELD's keys): the classic four; the Crystal Mines are the game's alone
const BUILDER_WORLDS = Object.keys(FIELD);
const palettes = new Map<string, readonly PaletteEntry[]>();
for (const w of BUILDER_WORLDS) palettes.set(w, await loadPalette(w));
const every = () => [...palettes.entries()].flatMap(([w, es]) => es.map((e) => [w, e] as const));

void test("the builder's worlds are the scene's classic four (no Crystal Mines); each has a palette with every kind it may offer", async () => {
  assert.deepEqual([...BUILDER_WORLDS].sort(), ["garden", "island", "mountain", "town"]);
  assert.ok(BUILDER_WORLDS.every((w) => WORLD_NAMES.includes(w)));
  await assert.rejects(loadPalette("mines"), /The Builder makes holes in the Garden, the Island, Mushroom Town and the Mountain: this one is in the Crystal Mines/);
  for (const [w, es] of palettes) {
    const kinds = new Set(es.map((e) => e.kind));
    for (const k of ["rail", "bar", "post", "surface", "slope", "tunnel", "hazard"] as const) assert.ok(kinds.has(k), `${w}: no ${k}`);
    // moving air where a world draws it (the mountain's snow cannon); no loop (the island's castle tube is an assembly)
    assert.equal(kinds.has("air"), w === "mountain", `${w}: moving air only where it is drawn`);
    assert.ok(!kinds.has("loop"), `${w}: no loop`);
    assert.equal(new Set(es.map((e) => e.id)).size, es.length, `${w}: an id twice`);
    for (const e of es) assert.equal(entry(e.id, es), e);
  }
  assert.equal(entry("*/post/nope", palettes.get("garden")!), undefined);
  assert.equal(entry("constructor", palettes.get("garden")!), undefined);
});

void test("each world's field is the one most of its course holes have", () => {
  type F = keyof (typeof FIELD)[string];
  const seen = new Map<string, Record<F, number[]>>();
  for (const l of fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n")) {
    // GG1's header (course/data.gno Encode): magic, W, H, Strokes, Substeps, World, Order, Title, Tee, Pin, then the floats
    const b = Buffer.from(l.split(" ")[3], "hex");
    let i = 10;
    const world = b.subarray(i + 1, (i += 1 + b[i])).toString();
    i += 8, (i += 1 + b[i]), (i += 32);
    const f = (k: number) => b.readDoubleLE(i + 8 * k);
    const s = seen.get(world) ?? { substeps: [], friction: [], bounce: [], ballR: [], cupR: [], shelter: [] };
    s.substeps.push(b.readUInt16LE(8)), s.cupR.push(f(0)), s.shelter.push(f(1)), s.friction.push(f(2)), s.bounce.push(f(3)), s.ballR.push(f(4));
    seen.set(world, s);
  }
  // each value the one most of the world's holes have (their substeps vary hole by hole)
  const most = (xs: number[]) => xs.reduce((best, x) => (xs.filter((y) => y === x).length > xs.filter((y) => y === best).length ? x : best));
  for (const [w, s] of seen) {
    if (!Object.hasOwn(FIELD, w)) continue; // (a world the Builder leaves to the game)
    assert.deepEqual(FIELD[w], { substeps: most(s.substeps), friction: most(s.friction), bounce: most(s.bounce), ballR: most(s.ballR), cupR: most(s.cupR), shelter: most(s.shelter) }, w);
  }
});

void test("every drawing the scene declares for the Builder's worlds is bound or hand-only, nothing is both, and no binding is for a drawing none of them has", async () => {
  const declared = [sharedSkins(), ...(await Promise.all(BUILDER_WORLDS.map(async (w) => (await loadWorld(w), worldOf({ world: w }).skins ?? {}))))];
  const used = new Set(declared.flatMap((skins) => Object.entries(skins).flatMap(([kind, list]) => list.map((s) => `${kind}/${s}`))));
  for (const [kind, skins] of Object.entries(BINDINGS)) for (const s of Object.keys(skins)) assert.ok(used.has(`${kind}/${s}`), `${kind}/${s}: bound, but no Builder world draws it`);
  for (const k of Object.keys(HAND_ONLY)) assert.ok(used.has(k), `${k}: hand-only, but no Builder world draws it`);
  for (const skins of declared) {
    for (const [kind, list] of Object.entries(skins)) {
      for (const s of list) {
        const bound = Object.hasOwn(BINDINGS[kind as keyof typeof BINDINGS], s), hand = Object.hasOwn(HAND_ONLY, `${kind}/${s}`);
        assert.ok(bound !== hand, `${kind}/${s}: ${bound ? "bound and hand-only" : "neither bound nor hand-only"}`);
      }
    }
  }
  assert.ok(Object.hasOwn(HAND_ONLY, "bar/tram"));
});

void test("every shared drawing has a home: every world's, some worlds', or the shore's; a world's course pieces are its own; the shore's pieces only by the sea", () => {
  const shared = new Set(Object.entries(sharedSkins()).flatMap(([kind, list]) => list.map((s) => `${kind}/${s}`)).filter((k) => !Object.hasOwn(HAND_ONLY, k)));
  assert.deepEqual(new Set(Object.keys(HOME)), shared, "a home for every shared drawing the palette offers, and for no other");
  for (const [k, home] of Object.entries(HOME)) if (typeof home !== "string") for (const w of home) assert.ok(Object.hasOwn(FIELD, w), `${k}: ${w} is no Builder world`);
  // what the game's own holes of a world place is that world's own, never borrowed
  const course = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "));
  const borrowed: string[] = [];
  for (const [slot, , , hex] of course) {
    const g = host.decode(hex), es = palettes.get(g.world);
    if (!es) continue;
    const zones = [g, ...g.pulses].flatMap((l) => l.zones.map((z) => [z.kind === "slope" && z.air ? "air" : z.kind, z.skin]));
    const pieces = [g, ...g.pulses].flatMap((l) => [...l.posts.map((p) => ["post", p.skin]), ...l.walls.flatMap((w) => [["rail", w.skin], ["bar", w.skin]]), ...zones]);
    for (const [kind, skin] of pieces) for (const e of es) if (e.kind === kind && e.skin === skin && e.borrowed) borrowed.push(`${slot} ${e.id}`);
  }
  assert.deepEqual([...new Set(borrowed)], []);
  // the shore's (a palm, a crab, the waves) look wrong away from the sea: only a world with one offers them
  for (const [w, es] of palettes) {
    const shore = es.filter((e) => e.world === "*" && HOME[`${e.kind}/${e.skin}`] === "sea").map((e) => e.id);
    if (w === "island") assert.ok(shore.includes("*/post/sandcastle") && shore.includes("*/surface/wetsand"), w);
    else assert.deepEqual(shore, [], `${w}: no sea, none of the shore's pieces`);
  }
  // each world's own, as the game dresses it
  const own = (w: string) => palettes.get(w)!.filter((e) => !e.borrowed).map((e) => e.skin);
  const lent = (w: string) => palettes.get(w)!.filter((e) => e.borrowed).map((e) => e.skin);
  for (const s of ["hedge", "flowerbed", "molehill", "sunflower", "scarecrow", "moon bridge", "wheelbarrow"]) assert.ok(own("garden").includes(s), `garden: ${s}`);
  for (const s of ["palm", "wetsand", "lagoon", "rowing boat", "sandcastle", "shipwreck"]) assert.ok(own("island").includes(s), `island: ${s}`);
  for (const s of ["brick", "herringbone", "stall", "lamp", "fountain", "canal"]) assert.ok(own("town").includes(s), `town: ${s}`);
  for (const s of ["boulder", "snowdrift", "ice", "pine", "crevasse"]) assert.ok(own("mountain").includes(s), `mountain: ${s}`);
  assert.ok(lent("mountain").includes("scarecrow") && lent("garden").includes("lamp") && lent("island").includes("hedge"), "another world's pieces, borrowed");
  for (const s of ["", "bumper", "sand", "water"]) for (const w of palettes.keys()) assert.ok(own(w).includes(s), `${w}: "${s}" every world's`);
});

void test("every binding is inside GG1's bounds and the plan's: a bounce above 1 exactly where the skin kicks; mouths 1.5 across; ice a surface; no weather", () => {
  for (const [w, e] of every()) {
    const at = `${w} ${e.id}`;
    for (const [name, r] of Object.entries({ size: e.size, thick: e.thick, bounce: e.bounce, scale: e.scale, grade: e.grade })) {
      if (!r) continue;
      assert.ok(r.min <= r.def && r.def <= r.max && r.step > 0, `${at} ${name}`);
    }
    if (e.kind === "post") assert.ok(e.size.min > 0 && e.size.max <= 8, at);
    if (e.bounce) assert.ok(e.bounce.min >= 0 && e.bounce.max <= (kicks(e.skin) ? 1.5 : MAX_BOUNCE), at);
    if (e.bounce) assert.equal(e.bounce.max > 1, kicks(e.skin), `${at}: above 1 exactly where it kicks`);
    if (e.scale) assert.ok(e.scale.min >= 0 && e.scale.max <= 8, at);
    if (e.grade) assert.ok(e.grade.max <= 0.95, at);
    if (e.kind === "hazard" || e.kind === "tunnel") assert.ok(e.size.min >= 1.5, `${at}: a mouth 1.5 across at least`);
    if (e.skin === "ice") assert.equal(e.kind, "surface", at);
    assert.ok(!(WEATHER as readonly string[]).includes(e.skin), at);
    assert.ok(e.clocks.length > 0, at);
  }
});

void test("every entry's piece, at the ends of its ranges, passes PublishMine's checks", () => {
  for (const [w, e] of every()) {
    for (const end of ["min", "def", "max"] as const) {
      // a lane as big as the draft's board allows (96 less Fit's margins), the piece in its middle; a rail from its edge
      const p = placePiece(e, "x", e.kind === "rail" ? [0, 40] : [40, 40], { size: e.size[end], thick: e.thick?.[end], bounce: e.bounce?.[end], scale: e.scale?.[end], grade: e.grade?.[end], to: [80, 20] });
      const d = lane(w, [p], 93, 93);
      const { hex, bars } = writeDraft(d, FIELD[w]);
      const f = host.fit(hex, bars);
      assert.ok(f.ok, `${w} ${e.id} ${end}: ${f.ok ? "" : f.why}`);
      const c = host.check("palette", f.hex);
      assert.ok(c.ok, `${w} ${e.id} ${end}: ${c.ok ? "" : c.why}`);
    }
  }
});

void test("every entry is drawn as itself, not as the plain form an unknown skin falls back to", async () => {
  const base = new Map<string, string[]>(), plain = new Map<string, string[]>();
  for (const [w, e] of every()) {
    await loadWorld(w);
    if (!base.has(w)) base.set(w, drawn(stateOf(lane(w, []))));
    const at: [number, number] = [14, 9], to = { to: [24, 4] as [number, number] };
    const mine = added(drawn(stateOf(lane(w, [placePiece(e, "x", at, to)]))), base.get(w)!);
    assert.ok(mine.length > 0, `${w} ${e.id}: draws nothing`);
    if (e.plain) continue; // the plain form itself (CLIENT.md, rule 2), on purpose
    const k = `${w}/${e.kind}/${e.clocks[0]}`;
    if (!plain.has(k)) plain.set(k, added(drawn(stateOf(lane(w, [placePiece({ ...e, skin: "zz-unknown", id: `*/${e.kind}/zz-unknown` }, "x", at, to)]))), base.get(w)!));
    assert.notDeepEqual(mine, plain.get(k), `${w} ${e.id}: drawn as the plain form`);
  }
});

void test("the palette covers the course: every course piece whose skin has an entry in its world lies in that entry's ranges", () => {
  const out: string[] = [];
  const course = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "));
  for (const [slot, , , hex] of course) {
    const g = host.decode(hex), es = palettes.get(g.world);
    if (!es) continue; // (a world the Builder leaves to the game)
    const find = (kind: string, skin: string) => es.find((e) => e.kind === kind && e.skin === skin);
    const inRange = (what: string, v: number, r?: { min: number; max: number }) => r && !(v >= r.min - 1e-9 && v <= r.max + 1e-9) && out.push(`${slot} ${what} ${v} not in ${r.min}..${r.max}`);
    // a passive piece plays MaxBounce at most whatever it says: that is the bounce it has
    const played = (b: number, skin: string) => (kicks(skin) ? b : Math.min(b, MAX_BOUNCE));
    for (const list of [g, ...g.pulses]) {
      for (const p of list.posts) {
        const e = find("post", p.skin);
        if (!e) continue;
        inRange(`post ${p.skin} r`, p.r, e.size);
        if (p.bounce) inRange(`post ${p.skin} bounce`, played(p.bounce, p.skin), e.bounce);
      }
      for (const z of list.zones) {
        const kind = z.kind === "slope" && z.air ? "air" : z.kind, e = find(kind, z.skin);
        if (!e) continue;
        const w = z.max[0] - z.min[0], h = z.max[1] - z.min[1];
        // (a zone thinner than a mouth may be: E5 is the builder's own rule, the course's holes were written by hand)
        if (kind === "surface" || kind === "loop") inRange(`${kind} ${z.skin} scale`, z.scale, e.scale);
        if (kind === "slope") inRange(`slope ${z.skin} grade`, Math.hypot(z.vec[0], z.vec[1]), e.grade);
        inRange(`${kind} ${z.skin} size`, Math.max(w, h), { min: 0, max: e.size.max });
      }
    }
  }
  assert.deepEqual(out, []);
});

void test("the four common pieces first, named plainly, in every Builder world: Bumper, Sand, Water, Slope (the rest, a Wall among them, under More pieces)", async () => {
  for (const world of Object.keys(FIELD)) {
    const p = await loadPalette(world), common = commonOf(p);
    assert.deepEqual(common.map((c) => c.name), ["Bumper", "Sand", "Water", "Slope"], world);
    for (const c of common) assert.ok(p.includes(c.entry), `${world} ${c.name}: one of its own entries`);
    assert.deepEqual(common.map((c) => c.entry.kind), ["post", "surface", "hazard", "slope"], world);
  }
});

void test("the moving pieces are judged like any other: a blowhole out onto a rock, the serac's ice on the cup, a gust over a hill, refused", async () => {
  const { validate } = await import("../lib/builder/pipeline.ts");
  const { census } = await import("../lib/builder/drawn.ts");
  const said = (w: string, pieces: Parameters<typeof lane>[1]) => validate(lane(w, pieces), { host, palette: palettes.get(w)!, census }).issues.filter((i) => i.severity === "error").map((i) => `${i.rule} ${i.piece}: ${i.text}`);
  const put = (w: string, id: string, at: [number, number], p: Parameters<typeof placePiece>[3] = {}) => placePiece(entry(id, palettes.get(w)!)!, id.split("/").at(-1)!, at, p);
  // each placed alone in the lane: it passes
  for (const [w, id] of [["island", "island/tunnel/blowhole"], ["mountain", "mountain/hazard/serac"], ["mountain", "mountain/air/gust"]] as const) assert.deepEqual(said(w, [put(w, id, [12, 4], { size: 4, to: [20, 15] })]), [], id);
  assert.deepEqual(said("island", [put("island", "island/tunnel/blowhole", [8, 8], { to: [20, 10] }), put("island", "*/post/rock", [20, 10])]), ["E6 blowhole: The blowhole comes out at (21.5, 11.5), on a wall or a post"]);
  assert.deepEqual(said("mountain", [put("mountain", "mountain/hazard/serac", [25, 8], { size: 3 })]), ["E3 serac: The cup touches the serac at (28.5, 11.5)"]);
  assert.deepEqual(said("mountain", [put("mountain", "mountain/air/gust", [10, 6], { size: 6 }), put("mountain", "mountain/slope/kicker", [12, 8], { size: 4 })]), ["E13 gust: The snow cannon lies over the kicker at (11.5, 7.5)"]);
});
