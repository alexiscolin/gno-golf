// lib/gnomes/wear.ts: wearing is free (ADR-007). Everyone sees what the realm
// says a player wears (Worn: the one put on, else their best); the player
// plays any gnome they hold, picked in this browser, nothing on chain; and
// what they see said is one line, never a double state.
import "./canvas.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gnomeById, rivalSkin } from "../lib/scene/gnome.ts";
import { meet, know, pickOf, pick, playing, seen, tokenSkin, onWear } from "../lib/gnomes/wear.ts";
import type { Catalogue } from "../lib/gnomes/catalogue.ts";
import type { Worn } from "../lib/gnomes/shop.ts";

const catalogue = JSON.parse(fs.readFileSync(new URL("../../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;
const A = "g1" + "a".repeat(38), B = "g1" + "b".repeat(38);
const row = (id: number, player = A, equipped = false): Worn => {
  const e = catalogue.gnomes.find((x) => x.id === id)!;
  return { player, id: String(id), name: e.name, tier: e.tier, traits: e.traits, equipped };
};
const earned = (kind: number, player = A): Worn => {
  const e = catalogue.earned.find((x) => x.kind === kind)!;
  return { player, id: String(1_000_000 + kind), name: e.name, tier: "earned", traits: e.traits, equipped: false };
};
const free = (id: string) => id === "classic" || id === "sage";

beforeEach(() => localStorage.clear());

test("wear: a token's skin is known by its id; an earned one is the game's own gnome", () => {
  assert.equal(tokenSkin(row(94)).id, "t94");
  assert.equal(tokenSkin(row(94)).name, catalogue.gnomes.find((x) => x.id === 94)!.name);
  assert.equal(tokenSkin(earned(8)).id, "king");
});

test("wear: what players wear for everyone is met once, and the ghost and the face follow", async () => {
  let told = 0;
  const off = onWear(() => told++);
  await meet([row(104, B)], [A, B]);
  assert.equal(gnomeById("t104").name, catalogue.gnomes.find((x) => x.id === 104)!.name);
  assert.equal(rivalSkin(B, "classic").id, "t104");
  assert.notEqual(rivalSkin(A, "classic").id, "t104", "A wears nothing: the gnome their address picks");
  await meet([], [B]); // B sold him: back to nothing worn
  assert.notEqual(rivalSkin(B, "classic").id, "t104");
  assert.equal(told, 2);
  off();
  const held = await know([row(3), row(73)]);
  assert.deepEqual(held.map((s) => s.id), ["t3", "t73"]);
  assert.equal(gnomeById("t73").id, "t73");
});

test("wear: the gnome played: the pick while it is theirs, else the one worn for everyone, else this browser's", () => {
  const held = new Set(["t3", "t94"]);
  assert.equal(playing({ pick: "t94", held, worn: row(3), saved: "sage", free }), "t94", "their pick, a gnome they hold");
  assert.equal(playing({ pick: "sage", held, worn: row(3), saved: "classic", free }), "sage", "a free gnome picked");
  assert.equal(playing({ pick: "t500", held, worn: row(3), saved: "sage", free }), "t3", "a pick they no longer hold: what they wear");
  assert.equal(playing({ pick: null, held, worn: row(94, A, true), saved: "sage", free }), "t94", "no pick: what everyone sees");
  assert.equal(playing({ pick: null, held: new Set(), worn: null, saved: "sage", free }), "sage", "no wallet, no collection: as before");
  assert.equal(playing({ pick: "wizard", held, worn: null, saved: "classic", free }), "classic", "a locked gnome is never played");
});

test("wear: the pick is kept in this browser, per account", () => {
  assert.equal(pickOf(A), null);
  pick(A, "t94");
  pick(B, "sage");
  assert.equal(pickOf(A), "t94");
  assert.equal(pickOf(B), "sage");
  pick(A, null);
  assert.equal(pickOf(A), null);
});

test("wear: one line says who sees what, and the one action that changes it", () => {
  assert.deepEqual(seen({ worn: row(94), playing: "t94", name: () => "Tansy" }), { line: "Everyone sees Tansy", show: false });
  assert.deepEqual(seen({ worn: row(94), playing: "t3", name: (id) => (id === "t3" ? "Thistle" : "Tansy") }), { line: "You play Thistle · everyone sees Tansy", show: true });
  assert.deepEqual(seen({ worn: null, playing: "t3", name: () => "Thistle" }), { line: "You play Thistle · everyone sees a gnome of the game", show: true });
  assert.deepEqual(seen({ worn: row(94), playing: "classic", name: (id) => (id === "classic" ? "The Classic" : "Tansy") }), { line: "You play The Classic · everyone sees Tansy", show: false }, "a free gnome is not shown to everyone: it is nobody's");
});
