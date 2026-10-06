// The gnome collection's data: its words (append only), the traits'
// encoding and what a reader does with what it does not know, a token's
// gnome, the series' plan, the rules, and data/gnomes.json being exactly what
// data/gnomes/ makes.
import "./canvas.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as V from "../lib/gnomes/vocab.ts";
import { PROPS, PROP_DESIGNS } from "../lib/gnomes/props.ts";
import { FORMAT, LENGTH, PLAIN, decode, encode, type Traits } from "../lib/gnomes/codec.ts";
import { EARNED_KINDS, lookOf, skinOf, skinOfTraits, traitsOf } from "../lib/gnomes/skin.ts";
import { SALE_TIERS, TIER_LOOK, entryOf, evenly, filterGnomes, planSeries, thumbOf, traitRows, type Catalogue, type SeriesConfig } from "../lib/gnomes/catalogue.ts";
import { GROUNDS, MAIN, apart, earnedSignature, readability, tierRules, validate, visualDiff } from "../lib/gnomes/validate.ts";
import { checkRows, rowsOf } from "../lib/gnomes/rows.ts";
import { generateSeries, makeCatalogue, type Design, type Recipe } from "../lib/gnomes/generate.ts";
import { darkBody, deltaE, oklab, over } from "../lib/gnomes/colour.ts";
import { GNOMES } from "../lib/scene/gnome.ts";
import { trianglesOf } from "../lib/scene/gnome-cost.ts";

const DATA = new URL("../../data/", import.meta.url);
const json = (f: string): unknown => JSON.parse(fs.readFileSync(new URL(f, DATA), "utf8"));
const catalogue = json("gnomes.json") as Catalogue;
const config = json("gnomes/series.json") as { series: SeriesConfig[] };
/** A series' data as the generator takes it. */
const dataOf = (id: string) => ({
  recipe: json(`gnomes/${id}/archetypes.json`) as Recipe,
  epics: (json(`gnomes/${id}/epics.json`) as { epics: Design[] }).epics,
  legs: (json(`gnomes/${id}/legendaries.json`) as { legendaries: Design[] }).legendaries,
});

// a gnome of every field, for the round trips
const FULL: Traits = {
  ...PLAIN, series: 1, tier: "epic", kind: 0, home: "mines", archetype: "miner", hat: "slouch", hatColour: V.colour("copper"),
  brim: V.colour("bark"), beard: "chops", hair: V.colour("snow"), body: V.colour("oat"), pattern: "argyle", patternColour: V.colour("navy"),
  accessories: ["glasses", "goggles", "moon"], accent: V.colour("cap"), piece: "scarf", pieceColour: V.colour("plum"),
  material: "metal", materialColour: V.colour("brass"), trail: "sparks", trailColour: V.colour("gold"), holing: "notes",
  holingColour: V.colour("lemon"), prop: "gears", propColour: V.colour("copper"),
};

test("vocab: each table without a repeat, every colour named once and valued once", () => {
  for (const t of [V.TIERS, V.HOMES, V.ARCHETYPES, V.HATS, V.BEARDS, V.PATTERNS, V.ACCESSORIES, V.PIECES, V.MATERIALS, V.TRAILS, V.HOLINGS, PROPS])
    assert.equal(new Set(t).size, t.length, t.join(","));
  assert.equal(new Set(V.COLOURS.map(([n]) => n)).size, V.COLOURS.length);
  assert.equal(new Set(V.COLOURS.map(([, v]) => v)).size, V.COLOURS.length);
  assert.ok(V.COLOURS.length < 255 && V.ACCESSORIES.length <= 32 && PROPS.length < 256, "every code fits its field");
  assert.throws(() => V.colour("chartreuse"), /no colour "chartreuse"/);
  assert.equal(V.colourCode(0x123456), -1);
  assert.equal(V.colourName(0xe0524b), "cap");
});

test("vocab: append only, the codes tokens carry keep their meaning", () => {
  // what the Genesis series was written with: a new entry goes after these, never between
  assert.deepEqual(V.HATS.slice(0, 19), ["cone", "tall", "tricorn", "toque", "tophat", "helmet", "straw", "bucket", "sailor", "bandana", "beret", "beanie", "alpine", "slouch", "pith", "skullcap", "souwester", "mill", "mushroom"]);
  assert.deepEqual(V.ACCESSORIES.slice(0, 22), ["glasses", "pompom", "flower", "cheeks", "stars", "horns", "patch", "parrot", "mask", "flour", "sash", "monocle", "crown", "cape", "lamp", "goggles", "earring", "neckerchief", "leaf", "soot", "freckles", "moon"]);
  assert.deepEqual(V.COLOURS.slice(0, 5).map(([n]) => n), ["cap", "cream", "sun", "white", "ink"]);
  assert.equal(PROPS.indexOf("windup-key"), 1);
  assert.equal(PROPS.indexOf("frost-cap"), PROPS.length - 1);
  assert.equal(V.HOLINGS.indexOf("gale"), V.HOLINGS.length - 1);
});

test("vocab: every colour GNOMES draws is in the palette, so an earned gnome's look can be written", () => {
  const used = GNOMES.flatMap((g) => [g.hat, g.hair, g.body, g.brim, ...(g.stripes ?? [])]).filter((v): v is number => v !== undefined);
  for (const v of used) assert.ok(V.colourCode(v) >= 0, v.toString(16));
});

test("codec: a look reads back as it was written, format first, every field a byte", () => {
  const hex = encode(FULL);
  assert.equal(hex.length, LENGTH);
  assert.equal(hex.slice(0, 2), "01");
  assert.equal(FORMAT, 1);
  assert.deepEqual(decode(hex), FULL);
  assert.deepEqual(decode(encode(PLAIN)), PLAIN);
});

test("codec: what cannot be written is refused, not guessed", () => {
  assert.throws(() => encode({ ...FULL, hatColour: 0x123456 }), /not in the palette/);
  assert.throws(() => encode({ ...FULL, hat: "fez" as Traits["hat"] }), /no hat "fez"/);
  assert.throws(() => encode({ ...FULL, accessories: ["monocle", "cravat" as Traits["accessories"][number]] }), /no accessory "cravat"/);
  assert.throws(() => encode({ ...FULL, kind: 256 }), /not a byte/);
  assert.throws(() => encode({ ...FULL, series: -1 }), /not a byte/);
});

test("codec: what a reader does not know it draws plain, and a later field it skips", () => {
  const hex = encode(FULL), at = (field: number) => 2 + field * 2 + (field > 13 ? 6 : 0); // (the mask is 4 bytes, field 13)
  const put = (h: string, i: number, b: string) => h.slice(0, i) + b + h.slice(i + 2);
  // a hat past the table, a colour past the palette, an accessory bit nobody has yet
  const odd = decode(put(put(put(hex, at(5), "fe"), at(6), "fd"), at(13), "80"))!;
  assert.equal(odd.hat, "cone");
  assert.equal(odd.hatColour, null);
  assert.deepEqual(odd.accessories, ["glasses", "goggles", "moon"], "an unknown bit (31) is dropped, the known kept");
  // shorter: the rest plain; longer (a field from a later client): ignored
  const short = decode(hex.slice(0, at(8)))!;
  assert.equal(short.hat, "slouch");
  assert.equal(short.beard, "full");
  assert.equal(short.material, "toon");
  assert.deepEqual(decode(hex + "07ff"), FULL);
  // another format, or not a look at all: nothing
  for (const bad of ["02" + hex.slice(2), "", "0", "01zz", hex.toUpperCase(), "1"]) assert.equal(decode(bad), null, bad);
});

test("skin: an earned kind is GNOMES' own gnome; anything else is built from its fields", () => {
  for (const [i, unlock] of EARNED_KINDS.entries()) {
    const g = GNOMES.find((x) => x.unlock === unlock)!;
    assert.equal(skinOf({ ...PLAIN, tier: "earned", kind: i + 1 }, { id: "x", name: "x", line: "x" }), g);
    assert.equal(traitsOf(g).kind, i + 1);
    assert.deepEqual(decode(encode(traitsOf(g))), traitsOf(g));
  }
  const s = skinOf(FULL, { id: "t1", name: "Test", line: "A test." });
  assert.equal(s.shape, "slouch");
  assert.equal(s.goggles, true);
  assert.equal(s.material, "metal");
  assert.equal(s.prop, "gears");
  assert.deepEqual(lookOf(s, { series: 1, tier: "epic", home: "mines", archetype: "miner" }), FULL);
  for (const h of ["tall", "helmet", "cone"] as const) assert.equal(traitsOf(skinOf({ ...PLAIN, hat: h }, { id: "", name: "", line: "" })).hat, h);
  // an earned kind past the nine: drawn from its fields
  assert.equal(skinOf({ ...PLAIN, tier: "earned", kind: 42 }, { id: "y", name: "Y", line: "" }).id, "y");
  // a look this client cannot read: the Classic, under its own name
  const unread = skinOfTraits("09ff", { id: "t9", name: "Nine", line: "" });
  assert.equal(unread.hat, GNOMES[0].hat);
  assert.equal(unread.name, "Nine");
  assert.equal(skinOfTraits(encode(FULL), { id: "t1", name: "T", line: "" }).prop, "gears");
  // the Pirate's stripes, as a pattern
  assert.equal(lookOf(GNOMES.find((g) => g.id === "pirate")!).pattern, "stripes");
});

test("catalogue: a series' plan is its waves, each one run of ids, every count from the config", () => {
  assert.deepEqual(evenly(65, 7), [10, 10, 9, 9, 9, 9, 9]);
  for (const s of config.series) {
    const plan = planSeries(s);
    assert.equal(plan.length, s.waves.length);
    let next = s.first;
    for (const w of plan) {
      assert.equal(w.first, next, "no gap between waves");
      for (const t of SALE_TIERS) (assert.equal(w.tiers[t].first, next), (next += w.tiers[t].count));
      assert.equal(w.last, next - 1);
    }
    for (const t of SALE_TIERS) assert.equal(plan.reduce((n, w) => n + w.tiers[t].count, 0), s.supply[t], t);
  }
});

test("catalogue: data/gnomes.json holds the series as configured, its gnomes as they draw", () => {
  const supply = config.series.reduce((n, s) => n + SALE_TIERS.reduce((m, t) => m + s.supply[t], 0), 0);
  assert.equal(catalogue.gnomes.length, supply);
  assert.deepEqual(catalogue.gnomes.map((g) => g.id), Array.from({ length: supply }, (_, i) => i + 1));
  for (const g of catalogue.gnomes) assert.deepEqual(skinOf(decode(g.traits)!, { id: `t${g.id}`, name: g.name, line: g.line }), g.skin, `#${g.id}`);
  for (const t of SALE_TIERS)
    assert.equal(catalogue.gnomes.filter((g) => g.tier === t).length, config.series.reduce((n, s) => n + s.supply[t], 0));
  assert.equal(entryOf(catalogue, 1)!.id, 1);
  assert.equal(entryOf(catalogue, 99999), undefined);
  assert.equal(thumbOf(7), "7.webp");
  assert.deepEqual(Object.keys(TIER_LOOK), [...V.TIERS]);
});

test("catalogue: it is what data/gnomes/ makes, gnome for gnome (scripts/gnomes.ts --check holds the file)", () => {
  assert.deepEqual(makeCatalogue((f) => json(`gnomes/${f}`), (t) => trianglesOf(skinOf(t, { id: "", name: "", line: "" }))), catalogue);
});

test("catalogue: a gallery's filters and a token's trait list", () => {
  const all = catalogue.gnomes;
  assert.equal(filterGnomes(all, {}).length, all.length);
  assert.ok(filterGnomes(all, { tier: "legendary" }).every((g) => g.tier === "legendary"));
  assert.ok(filterGnomes(all, { home: "mines", tier: "common" }).every((g) => g.home === "mines" && g.tier === "common"));
  assert.ok(filterGnomes(all, { hat: "beanie" }).every((g) => decode(g.traits)!.hat === "beanie"));
  assert.ok(filterGnomes(all, { trail: true }).every((g) => g.tier !== "common"));
  assert.equal(filterGnomes(all, { trail: false }).length, all.filter((g) => g.tier === "common").length);
  assert.deepEqual(filterGnomes(all, { text: "the miller" }).map((g) => g.name), ["The Miller"]);
  assert.equal(filterGnomes(all, { wave: 1, series: "genesis", archetype: "fisher" }).length, all.filter((g) => g.wave === 1 && g.archetype === "fisher").length);
  assert.equal(filterGnomes(all, { series: "nope" }).length, 0);
  const rows = traitRows(FULL);
  assert.deepEqual(rows.find((r) => r.trait === "Hat"), { trait: "Hat", value: "Copper slouch" });
  assert.deepEqual(rows.filter((r) => r.trait === "Wears").map((r) => r.value), ["Glasses", "Goggles", "Moon"]);
  assert.ok(rows.some((r) => r.trait === "Material" && r.value === "Metal"));
  assert.ok(!traitRows(PLAIN).some((r) => ["Material", "Trail", "Holing", "Prop", "Piece"].includes(r.trait)), "nothing that is not there");
  assert.equal(traitRows({ ...PLAIN, beard: "none" }).find((r) => r.trait === "Beard")!.value, "Clean-shaven");
});

test("validate: the catalogue passes every rule", () => {
  const r = validate(catalogue, GNOMES.map((g) => lookOf(g)));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.counts.tier, { common: 504, rare: 144, epic: 65, legendary: 7 });
});

test("validate: each rule catches what it is for", () => {
  const common: Traits = { ...PLAIN, tier: "common", hatColour: V.colour("cap"), body: V.colour("linen") };
  assert.deepEqual(tierRules(common), []);
  assert.match(tierRules({ ...common, piece: "scarf" }).join(), /only the base traits/);
  assert.match(tierRules({ ...common, tier: "rare", trail: "ribbon" }).join(), /a pattern or a piece/);
  assert.match(tierRules({ ...common, tier: "rare", trail: "ribbon", piece: "scarf", prop: "gears" }).join(), /no material nor prop/);
  assert.match(tierRules({ ...common, tier: "epic", trail: "sparks", holing: "sparks" }).join(), /material and a prop/);
  assert.match(tierRules({ ...common, tier: "legendary", trail: "snow", holing: "avalanche", prop: "gears" }).join(), /own piece and number/);
  assert.match(tierRules({ ...common, trail: "snow" }).join(), /not a common's/);
  assert.match(tierRules({ ...common, hat: "mill" }).join(), /Legendary's/);
  assert.match(tierRules({ ...common, tier: "rare", trail: "ribbon", piece: "bowtie", beard: "full" }).join(), /bow tie/);
  // the earned gnomes' own
  assert.match(earnedSignature({ ...common, accessories: ["crown"] }), /earned gnomes' own/);
  assert.match(earnedSignature({ ...common, hat: "tricorn", accessories: ["patch"] }), /Pirate/);
  assert.match(earnedSignature({ ...common, hat: "toque", accessories: ["flour"] }), /Baker/);
  assert.match(earnedSignature({ ...common, hat: "tophat", accessories: ["sash", "monocle"] }), /wears sash/);
  assert.match(earnedSignature({ ...common, accessories: ["mask"] }), /wears mask/);
  assert.equal(earnedSignature(common), "");
  // readable: eyes, hat on body, every ground, the ghost, the trail
  assert.deepEqual(readability(common), []);
  assert.match(readability({ ...common, body: V.colour("olive") }).join(), /eyes/);
  assert.match(readability({ ...common, hatColour: V.colour("linen") }).join(), /too close/);
  assert.match(readability({ ...common, hatColour: GROUNDS.fairway, body: V.colour("sage") }).join(), /lost on fairway/);
  assert.match(readability({ ...common, trailColour: GROUNDS.fairway }).join(), /lost on the fairway/);
  // apart: three fields at least, one of them the silhouette or a main colour
  assert.deepEqual(visualDiff(common, common), []);
  // what is drawn, not what is written: no body is the cream one, no hat colour the cap's red
  assert.deepEqual(visualDiff({ ...common, body: null }, { ...common, body: V.colour("cream") }), []);
  assert.deepEqual(visualDiff({ ...common, hatColour: null }, { ...common, hatColour: V.colour("cap") }), []);
  // and no gnome of the collection only three drawn fields from one of GNOMES
  const gnomes = GNOMES.map((g) => lookOf(g));
  for (const e of catalogue.gnomes) for (const g of gnomes) assert.ok(apart(decode(e.traits)!, g, 4), `#${e.id} near ${visualDiff(decode(e.traits)!, g).join(", ")}`);
  assert.deepEqual(visualDiff({ ...common, beard: "full", hair: 1 }, { ...common, beard: "full", hair: 2 }), ["hair"]);
  const twin = { ...common, beard: "bushy" as const, accessories: ["neckerchief" as const, "glasses" as const] };
  assert.deepEqual(visualDiff(common, twin), ["beard", "neckerchief", "glasses"]);
  assert.equal(apart(common, twin), false, "a beard and small things alone: twins at ball size");
  assert.equal(apart(common, { ...twin, hatColour: V.colour("plum") }), true);
  assert.equal(apart(common, { ...common, hat: "straw", accessories: ["glasses"] }), false, "two fields are not enough");
  assert.equal(apart(common, { ...common, hat: "straw", accessories: ["glasses"], beard: "goatee" }, 4), false, "four from GNOMES");
  for (const f of ["hat", "hat colour", "body", "pattern", "material", "prop"]) assert.ok(MAIN.has(f), f);
  assert.ok(!MAIN.has("beard"));
});

test("rows: what the realm receives decodes to the catalogue's traits, id for id, its tier the traits'", () => {
  for (const s of catalogue.series) {
    const rows = rowsOf(catalogue, s.id), mine = catalogue.gnomes.filter((g) => g.series === s.id);
    assert.deepEqual(checkRows(rows, s.first), []);
    const lines = rows.split("\n");
    assert.equal(lines.length, mine.length);
    lines.forEach((line, i) => {
      const [id, tier, name, traits] = line.split("|");
      assert.deepEqual([Number(id), tier, name], [mine[i].id, mine[i].tier, mine[i].name]);
      assert.deepEqual(decode(traits), decode(mine[i].traits), `#${id}`);
      assert.equal(traits, mine[i].traits);
    });
    // and the file sent is these rows, byte for byte (scripts/gnomerows.ts --check holds it too)
    assert.equal(fs.readFileSync(new URL(`gnomes/rows/${s.id}.txt`, DATA), "utf8"), rows);
  }
  const g = catalogue.gnomes[0], row = (tier: string, traits = g.traits, id = 1, name = g.name) => `${id}|${tier}|${name}|${traits}`;
  assert.match(checkRows(row("rare"), 1).join(), /tier rare, its traits say common/);
  assert.match(checkRows(row("common", "zz"), 1).join(), /do not decode/);
  assert.match(checkRows(row("common", g.traits, 2), 1).join(), /id 2, not 1/);
  assert.match(checkRows(row("common", g.traits, 1, "x".repeat(49)), 1).join(), /name/);
  assert.match(checkRows("1|common|x", 1).join(), /not id\|tier\|name\|traits/);
});

test("validate: a catalogue off its plan, or with twins, is reported", () => {
  const first = catalogue.gnomes[0], twin = { ...catalogue.gnomes[1], traits: first.traits, name: first.name, line: first.line };
  const r = validate({ ...catalogue, gnomes: [first, twin, { ...first, id: 99999 }] }, []);
  assert.ok(r.errors.some((e) => /gnomes for 720 planned/.test(e)));
  assert.ok(r.errors.some((e) => /not in any series' plan/.test(e)));
  assert.ok(r.errors.some((e) => /twice/.test(e)));
  assert.ok(r.errors.some((e) => /looks like #/.test(e)));
  const bad = validate({ ...catalogue, gnomes: [{ ...first, traits: "zz" }, { ...catalogue.gnomes[1], tier: "epic", name: "x" }] }, []);
  assert.ok(bad.errors.some((e) => /do not decode/.test(e)));
  assert.ok(bad.errors.some((e) => /planned genesis wave 1/.test(e)));
  assert.ok(bad.errors.some((e) => /name "x"/.test(e)));
});

test("generate: the same data and seed make the same gnomes; too little data says so", () => {
  const s = config.series[0], { recipe, epics, legs } = dataOf(s.id);
  assert.throws(() => generateSeries(s, recipe, epics.slice(1), legs, []), /garden has 9 epic designs for 10 planned/);
  assert.throws(() => generateSeries({ ...s, waves: ["attic" as SeriesConfig["waves"][number], ...s.waves.slice(1)] }, recipe, epics, legs, []), /no archetype for attic/);
  const tiny = { ...recipe, archetypes: recipe.archetypes.map((a) => ({ ...a, palettes: a.palettes.slice(0, 1), hair: ["snow"] })) };
  assert.throws(() => generateSeries(s, tiny, epics, legs, []), /looks apart/);
  // every hand design is a prop of the table, every Legendary's piece a legend one
  for (const d of epics) assert.ok(PROP_DESIGNS[d.prop] && !("legend" in PROP_DESIGNS[d.prop]), d.prop);
  for (const d of legs) assert.ok("legend" in PROP_DESIGNS[d.prop], d.prop);
});

test("colour: OKLab lightness and distance as the eye sees them", () => {
  assert.ok(Math.abs(oklab(0xffffff)[0] - 1) < 1e-3 && Math.abs(oklab(0)[0]) < 1e-3);
  assert.equal(deltaE(0x60ab96, 0x60ab96), 0);
  assert.ok(deltaE(0xe0524b, 0x60ab96) > 0.2);
  assert.equal(over(0xffffff, 0x000000, 0.5), 0x808080);
  assert.ok(darkBody(0x2a2433) && !darkBody(0xfdf6e9));
});
