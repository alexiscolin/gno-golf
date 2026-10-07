// lib/gnomes/collection.ts: the collection as status, never as a gift
// (ADR-011). A player's album (per world, per tier, per archetype set, from
// the catalogue's own data), a collector rank from what they hold (the one
// config's thresholds), read one page a player and kept for the visit, shown
// where the ADR says, in words with no money in them.
import "./canvas.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { Catalogue } from "../lib/gnomes/catalogue.ts";
import {
  COLLECTOR, album, albumLine, albumShown, makeCollectors, nextRank, pointsOf, rankOf, rankWords, rankLine, ranksShown, type Holding,
} from "../lib/gnomes/collection.ts";

const catalogue = JSON.parse(fs.readFileSync(new URL("../../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;
const gnomes = catalogue.gnomes, earned = catalogue.earned;
const A = "g1" + "a".repeat(38), B = "g1" + "b".repeat(38), C = "g1" + "c".repeat(38);
const byTier = (t: string) => gnomes.filter((g) => g.tier === t);
const row = (id: number) => ({ id: String(id), tier: gnomes.find((g) => g.id === id)!.tier, traits: gnomes.find((g) => g.id === id)!.traits });
const earnedRow = (kind: number) => ({ id: String(1_000_000 + kind), tier: "earned", traits: earned.find((e) => e.kind === kind)!.traits });
const held = (rows: readonly { id: string; tier: string }[], total = rows.length): Holding => ({ total, rows });

// ------------------------------------------------------------ the album
test("collection: the album's worlds, tiers and sets are the catalogue's own, none owned", () => {
  const a = album(gnomes, earned, []);
  const homes = [...new Set(gnomes.map((g) => g.home))];
  assert.deepEqual(a.worlds.map((w) => w.key), homes, "one row per home, in the catalogue's order");
  for (const w of a.worlds) assert.equal(w.of, gnomes.filter((g) => g.home === w.key).length);
  assert.equal(a.worlds[0].label, "Garden");
  assert.deepEqual(a.tiers.map((t) => [t.key, t.of]), [["common", 504], ["rare", 144], ["epic", 65], ["legendary", 7], ["earned", earned.length]]);
  assert.deepEqual(a.tiers.map((t) => t.label), ["Commons", "Rares", "Epics", "Legendaries", "Earned"]);
  const kinds = [...new Set(gnomes.map((g) => g.archetype))];
  assert.equal(a.sets.length, kinds.length, "a set per archetype the catalogue carries, none invented");
  for (const s of a.sets) assert.equal(s.of, gnomes.filter((g) => g.archetype === s.key).length);
  assert.equal(a.sets.find((s) => s.key === "fisher")!.label, "All the fishers");
  assert.equal(a.sets.find((s) => s.key === "stormwatch")!.label, "All the storm watchers");
  for (const p of [...a.worlds, ...a.tiers, ...a.sets]) assert.equal(p.have, 0);
  assert.equal(a.have, 0);
  assert.equal(a.unknown, 0);
  // every slot of a row is a silhouette to fill, in id order
  const garden = a.worlds[0];
  assert.equal(garden.items.length, garden.of);
  assert.ok(garden.items.every((x, i, l) => !x.mine && (i === 0 || (l[i - 1].id ?? 0) < (x.id ?? 0))));
});

test("collection: some owned fill their world, tier and set; an earned gnome its own row", () => {
  const legend = byTier("legendary")[0], epic = byTier("epic")[0];
  const a = album(gnomes, earned, [row(1), row(2), row(legend.id), row(epic.id), earnedRow(8)]);
  const g1 = gnomes.find((g) => g.id === 1)!;
  assert.equal(a.worlds.find((w) => w.key === g1.home)!.have, [1, 2, legend.id, epic.id].filter((id) => gnomes.find((g) => g.id === id)!.home === g1.home).length);
  assert.equal(a.tiers.find((t) => t.key === "legendary")!.have, 1);
  assert.equal(a.tiers.find((t) => t.key === "earned")!.have, 1);
  assert.ok(a.tiers.find((t) => t.key === "earned")!.items.some((x) => x.unlock === "king" && x.mine));
  assert.equal(a.sets.find((s) => s.key === g1.archetype)!.items.find((x) => x.id === 1)!.mine, true);
  assert.equal(a.have, 5);
  assert.equal(albumLine(a, g1.home), `${a.worlds.find((w) => w.key === g1.home)!.label} ${a.worlds.find((w) => w.key === g1.home)!.have}/${a.worlds.find((w) => w.key === g1.home)!.of}`);
  assert.match(albumLine(a), /^\w+ \d+\/\d+$/, "no world asked: the one most filled");
});

test("collection: all owned fills every row; unknown ids are counted apart, never in a row", () => {
  const a = album(gnomes, earned, [...gnomes.map((g) => row(g.id)), ...earned.map((e) => earnedRow(e.kind))]);
  for (const p of [...a.worlds, ...a.tiers, ...a.sets]) assert.equal(p.have, p.of, p.label);
  const b = album(gnomes, earned, [{ id: "999", tier: "common", traits: "" }, { id: "1000099", tier: "earned", traits: "ff" }, { id: "x", tier: "rare" }, row(1), row(1)]);
  assert.equal(b.unknown, 3, "a later series' gnome, an earned kind this page does not know, a broken id");
  assert.equal(b.have, 1, "the same gnome twice counts once");
  assert.equal(b.tiers.reduce((n, t) => n + t.have, 0), 1);
});

// ------------------------------------------------------------ the rank
test("collection: the rank is the one config's, at its boundaries", () => {
  const { points, ranks } = COLLECTOR;
  assert.deepEqual(ranks.map((r) => r.id), ["bronze", "silver", "gold", "legendary"]);
  assert.ok(ranks.every((r, i) => i === 0 || r.points > ranks[i - 1].points), "thresholds rise");
  assert.equal(rankOf(held([])), null, "nothing held: no rank");
  const commons = (n: number) => byTier("common").slice(0, n).map((g) => row(g.id));
  assert.equal(pointsOf(held(commons(1))), points.common);
  for (const r of ranks.filter((x) => !("holds" in x))) {
    const at = commons(r.points / points.common), under = commons(r.points / points.common - 1);
    assert.equal(rankOf(held(at))?.id, r.id, `${r.id} at ${r.points}`);
    assert.notEqual(rankOf(held(under))?.id, r.id, `${r.id} not one under`);
  }
  const top = ranks[ranks.length - 1];
  assert.ok("holds" in top && top.holds === "legendary");
  const legend = row(byTier("legendary")[0].id);
  const fill = commons(top.points - points.legendary);
  assert.equal(rankOf(held([legend, ...fill]))?.id, "legendary", "its points with a Legendary");
  assert.equal(rankOf(held(commons(top.points)))?.id, "gold", "its points without one: the rank below");
  assert.equal(rankOf(held([legend, ...fill.slice(1)]))?.id, "gold", "a Legendary one point short");
  assert.equal(pointsOf(held([earnedRow(1)])), points.earned, "an earned gnome counts: proof of play");
  assert.equal(pointsOf(held([{ id: "5000", tier: "mythic" }])), 0, "a tier this page does not know counts nothing");
});

test("collection: one page decides the rank: what follows the first page counts as the least", () => {
  const top = COLLECTOR.ranks[COLLECTOR.ranks.length - 1];
  assert.ok(top.points <= 100 * Math.min(...Object.values(COLLECTOR.points)), "a full first page reaches every threshold");
  const page = byTier("common").slice(0, 100).map((g) => row(g.id));
  assert.equal(pointsOf(held(page, 150)), 150);
  assert.equal(rankOf(held(page, 150))?.id, "gold");
});

test("collection: the next rank, and the rank in words", () => {
  const c = (n: number) => byTier("common").slice(0, n).map((g) => row(g.id));
  assert.deepEqual(nextRank(held([])), { rank: COLLECTOR.ranks[0], points: 1 });
  assert.deepEqual(nextRank(held(c(9))), { rank: COLLECTOR.ranks[2], points: COLLECTOR.ranks[2].points - 9 });
  assert.equal(nextRank(held([row(byTier("legendary")[0].id), ...c(40)])), null, "the top: nothing next");
  assert.equal(rankWords(COLLECTOR.ranks[1]), "Collector silver");
  assert.equal(rankLine(held(c(9))), "Collector silver · 9 points · gold at 20");
  assert.equal(rankLine(held([])), "No gnome yet");
  assert.match(rankLine(held(c(36))), /^Collector gold · 36 points · legendary at 36, with a Legendary$/);
});

// ------------------------------------------------------------ the reader
test("collection: a player's holding is one page, read once a visit, holders only, a few at a time", async () => {
  const pages: string[] = [], holds: string[] = [];
  let running = 0, most = 0;
  const reads = {
    holds: (p: string) => (holds.push(p), Promise.resolve(p !== C)),
    page: async (p: string) => {
      pages.push(p);
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { total: p === A ? 3 : 1, rows: [row(1)] };
    },
  };
  const k = makeCollectors(reads, 2);
  const players = [A, B, C, ...Array.from({ length: 5 }, (_, i) => "g1" + String.fromCharCode(100 + i).repeat(38))];
  const got = await Promise.all([...players, A, B, "not an address"].map((p) => k.holding(p)));
  assert.equal(got[0].total, 3);
  assert.deepEqual(got[2], { total: 0, rows: [] }, "wears nothing: holds nothing, no page read");
  assert.deepEqual(got[got.length - 1], { total: 0, rows: [] });
  assert.equal(pages.filter((p) => p === A).length, 1, "the same player once");
  assert.ok(!pages.includes(C));
  assert.equal(pages.length, players.length - 1);
  assert.ok(most <= 2, `at most 2 at a time (${most})`);
  assert.equal(k.peek(A)?.total, 3, "known at once next time: no flash");
  await k.holding(A);
  assert.equal(pages.filter((p) => p === A).length, 1, "cached for the visit");
  // what the page has read already (the player's own gnomes) costs nothing
  const D = "g1" + "z".repeat(38);
  k.know(D, held([row(1), row(2)]));
  assert.equal((await k.holding(D)).total, 2);
  assert.ok(!pages.includes(D));
});

test("collection: a read that fails is asked again next time, and says no rank meanwhile", async () => {
  let fail = true, n = 0;
  const k = makeCollectors({ holds: () => Promise.resolve(null), page: async () => (n++, fail ? Promise.reject(new Error("down")) : { total: 1, rows: [row(1)] }) });
  await assert.rejects(k.holding(A));
  assert.equal(k.peek(A), undefined);
  fail = false;
  assert.equal((await k.holding(A)).total, 1, "unknown whether they wear one (null): the page is read");
  assert.equal(n, 2);
});

// ------------------------------------------------------------ where it shows (ADR-011)
test("collection: the album where the shop opens; ranks wherever the shop is built, as the faces", () => {
  assert.equal(albumShown(false, true), false, "the shop's flag off: nothing");
  assert.equal(albumShown(true, false), false, "a blocked region: no album");
  assert.equal(albumShown(true, null), false, "the region not read yet: not yet");
  assert.equal(albumShown(true, true), true);
  assert.equal(ranksShown(false), false, "the shop's flag off: no rank anywhere");
  assert.equal(ranksShown(true), true, "a board reads the same in every region: a fact of the chain, as the gnome worn");
});

// ------------------------------------------------------------ honest words
test("collection: the module's words carry no money, no promise and no hurry", () => {
  const BANNED = /\b(value|valuable|worth|invest\w*|asset|floor|profit\w*|resale|resell|flip|apprecia\w*|scarc\w*|rarest|hurry|last chance|limited time|only \d+ left|don't miss|price|gain|earnings?|roi)\b/i;
  for (const f of ["../lib/gnomes/collection.ts"]) {
    const src = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    // what a player reads: quoted strings, template literals and JSX text (comments aside)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const words = [...code.matchAll(/"([^"\\\n]|\\.)*"|`([^`\\]|\\.)*`|>([^<>{}=;()]+)</g)].map((m) => m[0]);
    assert.ok(words.length > 3, `${f}: words found`);
    for (const w of words) assert.doesNotMatch(w, BANNED, `${f}: ${w}`);
  }
});
