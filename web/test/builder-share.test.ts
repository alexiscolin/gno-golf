// A published hole shared (components/builder/share.ts): its link is the game's own
// (components/common.ts holeLink: a community hole by its id, the sharer's
// dare with by=), on the site's address; the card's words.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cardLines, holeLinkOf } from "../components/builder/share.ts";
import { holeLink } from "../components/common.ts";
import { SITE } from "../lib/site.ts";

const A = "g1" + "a".repeat(38), ID = `${A}/mole-run/v2`;
const w = globalThis as { window?: unknown };
afterEach(() => void delete w.window);

void test("holeLinkOf: the game's link for a community hole, by its id; a dare with the sharer's address", () => {
  w.window = { location: { origin: "https://gnogolf.xyz", pathname: "/build/", hostname: "gnogolf.xyz", search: "" } };
  assert.equal(holeLinkOf(ID), `https://gnogolf.xyz/${holeLink({ id: ID, place: 0 }, "", "", "hole")}`);
  assert.equal(holeLinkOf(ID), `https://gnogolf.xyz/?hole=${encodeURIComponent(ID)}&src=hole`);
  assert.match(holeLinkOf(ID, A), new RegExp(`&by=${A}&`));
  assert.doesNotMatch(holeLinkOf(ID, "not-an-address"), /by=/);
  w.window = { location: { origin: "http://localhost:3471", pathname: "/build/", hostname: "localhost", search: "?rpc=http://127.0.0.1:26657" } };
  assert.ok(holeLinkOf(ID).startsWith(`${SITE}/?`), "never a local address: the public one");
});

void test("cardLines: the name, the world and par, the author short, and where it was built", () => {
  assert.deepEqual(cardLines({ name: "Mole Run", world: "island", par: 4, author: A }), ["Mole Run", "by g1aaaaaa…aaaa · Island · par 4", "Built on gno.land"]);
  assert.equal(cardLines({ name: "x".repeat(80), world: "garden", par: 3, author: A })[0].length <= 41, true, "a long name cut with an ellipsis");
});
