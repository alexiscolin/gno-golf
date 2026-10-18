// A published hole shared (components/builder/share.ts): its link is the game's own
// (components/common.ts holeLink: a community hole by its id), on the site's
// address; the card's words.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { beatLine, cardLines, holeShare } from "../components/builder/share.ts";
import { builderScore } from "../lib/builder/proof.ts";
import { holeLink } from "../components/common.ts";
import { SITE, siteURL } from "../lib/site.ts";

const A = "g1" + "a".repeat(38), ID = `${A}/mole-run/v2`;
const w = globalThis as { window?: unknown };
afterEach(() => void delete w.window);

void test("holeShare: what the shared Share sends for a published hole, its link the game's own (Share puts it on the public address)", () => {
  const s = holeShare("Mole Run", ID);
  assert.deepEqual(s, { text: "Mole Run, a mini-golf hole on gno.land", link: holeLink({ id: ID, place: 0 }, "", "", "hole") });
  w.window = { location: { origin: "https://gnogolf.xyz", pathname: "/build/", hostname: "gnogolf.xyz", search: "" } };
  assert.equal(siteURL(s.link), `https://gnogolf.xyz/?hole=${encodeURIComponent(ID)}&src=hole`);
  w.window = { location: { origin: "http://localhost:3471", pathname: "/build/", hostname: "localhost", search: "?rpc=http://127.0.0.1:26657" } };
  assert.ok(siteURL(s.link).startsWith(`${SITE}/?`), "never a local address: the public one");
});

void test("cardLines: the name, the world and par, the author short, and where it was built", () => {
  assert.deepEqual(cardLines({ name: "Mole Run", world: "island", par: 4, author: A }), ["Mole Run", "Island · par 4 · by g1aaaaaa…aaaa", "Built on gno.land"]);
  assert.equal(cardLines({ name: "x".repeat(80), world: "garden", par: 3, author: A })[0].length <= 41, true, "a long name cut with an ellipsis");
  assert.equal(cardLines({ name: "Mole Run", world: "island", par: 4, author: A, strokes: 2 })[2], "Beat the builder: 2 strokes · on gno.land", "the author's score to beat");
});

void test("the author's score, the hole's Beat the builder line: the calm round's strokes, else the fewest; said as a dare", () => {
  assert.equal(builderScore([{ kind: "wind", strokes: 2 }, { kind: "", strokes: 3 }]), 3);
  assert.equal(builderScore([{ kind: "wind", strokes: 4 }, { kind: "rain", strokes: 2 }]), 2);
  assert.equal(builderScore([]), 0);
  assert.equal(beatLine(1), "Beat the builder: 1 stroke");
  assert.equal(beatLine(0), "");
  assert.equal(holeShare("Mole Run", ID, 3).text, "Mole Run, a mini-golf hole on gno.land. Beat the builder: 3 strokes");
});
