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
import { BINDINGS, HAND_ONLY, WORLD_NAMES, entry, loadPalette, sharedSkins, type PaletteEntry } from "../lib/builder/palette.ts";
import { FIELD, MAX_BOUNCE, WEATHER, kicks } from "../lib/builder/rules.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { frame, writeDraft } from "../lib/builder/gg1.ts";
import { emptyDraft, type Draft, type Piece } from "../lib/builder/draft.ts";
import { makeBuilderHost } from "../lib/builder/wasm.ts";
import type { Hole } from "../lib/scene/data.ts";

const host = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(new URL("../lib/sim/builder.wasm", import.meta.url))));
const palettes = new Map<string, readonly PaletteEntry[]>();
for (const w of WORLD_NAMES) palettes.set(w, await loadPalette(w));
const every = () => [...palettes.entries()].flatMap(([w, es]) => es.map((e) => [w, e] as const));

const rail = (id: string, a: [number, number], b: [number, number]): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });
/** A lane of w by h in a world, its rails, the tee and the cup at its ends, the pieces given, framed. */
function lane(world: string, pieces: Piece[], w = 30, h = 20): Draft {
  return frame({
    ...emptyDraft(world), title: "Palette", tee: [3, h / 2], pin: [w - 3, h / 2],
    pieces: [rail("r1", [0, 0], [w, 0]), rail("r2", [w, 0], [w, h]), rail("r3", [w, h], [0, h]), rail("r4", [0, h], [0, 0]), ...pieces],
    pulses: pieces.some((p) => p.clock.k === "stroke") ? [{ every: 3, on: 1, phase: 0 }] : [],
  });
}
const ID = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/palette/v1";
/** The hole as a player's client would get it: written, fitted, and HoleState answered by the realm's code. */
function stateOf(d: Draft): Hole {
  const { hex, bars } = writeDraft(d, FIELD[d.world]);
  const f = host.fit(hex, bars);
  if (!f.ok) throw new Error(f.why);
  host.load(ID, f.hex);
  host.setperiod(5967997);
  return JSON.parse(host.state(ID)) as Hole;
}
void test("the builder's worlds are the scene's; each has a palette with every kind it may offer", () => {
  assert.deepEqual(Object.keys(FIELD).sort(), [...WORLD_NAMES].sort());
  for (const [w, es] of palettes) {
    const kinds = new Set(es.map((e) => e.kind));
    for (const k of ["rail", "bar", "post", "surface", "slope", "tunnel", "hazard"] as const) assert.ok(kinds.has(k), `${w}: no ${k}`);
    assert.ok(!kinds.has("loop") && !kinds.has("air"), `${w}: no loop, no moving air (the plan's v1)`);
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
    assert.deepEqual(FIELD[w], { substeps: most(s.substeps), friction: most(s.friction), bounce: most(s.bounce), ballR: most(s.ballR), cupR: most(s.cupR), shelter: most(s.shelter) }, w);
  }
});

void test("every drawing the scene declares is bound or hand-only, and nothing is both; tram and cart are hand-only", async () => {
  const declared = [sharedSkins(), ...(await Promise.all(WORLD_NAMES.map(async (w) => (await loadWorld(w), worldOf({ world: w }).skins ?? {}))))];
  for (const skins of declared) {
    for (const [kind, list] of Object.entries(skins)) {
      for (const s of list) {
        const bound = Object.hasOwn(BINDINGS[kind as keyof typeof BINDINGS], s), hand = Object.hasOwn(HAND_ONLY, `${kind}/${s}`);
        assert.ok(bound !== hand, `${kind}/${s}: ${bound ? "bound and hand-only" : "neither bound nor hand-only"}`);
      }
    }
  }
  assert.ok(Object.hasOwn(HAND_ONLY, "bar/tram") && Object.hasOwn(HAND_ONLY, "bar/cart"));
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
    const g = host.decode(hex), es = palettes.get(g.world)!;
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
