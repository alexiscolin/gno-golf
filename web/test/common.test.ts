// holeLink: the address every share and copied link is built from. A cup's
// hole by its own page (its link card), anything else by its id.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Snapshot } from "../lib/engine.ts";
import { holeLink, pasted, shareLinks, suggestName } from "../components/common.ts";

const snap = (s: Partial<Snapshot>) => s as Snapshot;
const onPage = (search: string, f: () => void) => {
  const had = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { location: { search } };
  try {
    f();
  } finally {
    (globalThis as { window?: unknown }).window = had;
  }
};

test("a cup's hole links to its own page, whatever its version", () => {
  assert.equal(holeLink(snap({ id: "garden/3/v1", place: 3, world: "garden" }), ""), "h/garden-3/");
  assert.equal(holeLink(snap({ id: "mountain/18/v4", place: 18, world: "mountain" }), ""), "h/mountain-18/");
});

test("the gnome rides along as a query", () => {
  assert.equal(holeLink(snap({ id: "island/9/v1", place: 9, world: "island" }), "wizard"), "h/island-9/?gnome=wizard");
});

test("a hole in no cup (community, archived) links by its id", () => {
  const community = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5/my-hole/v1";
  assert.equal(holeLink(snap({ id: community, place: 0 }), ""), `?hole=${encodeURIComponent(community)}`);
  // archived: no place in a cup any more, even with a slot-shaped id
  assert.equal(holeLink(snap({ id: "garden/3/v1" }), ""), "?hole=garden%2F3%2Fv1");
});

test("a page pointed at another chain keeps pointing there", () => {
  onPage("?rpc=https%3A%2F%2Frpc.example&web=https%3A%2F%2Fweb.example&other=1", () => {
    const l = holeLink(snap({ id: "town/5/v1", place: 5, world: "town" }), "");
    assert.ok(l.startsWith("h/town-5/?"), l);
    const q = new URLSearchParams(l.split("?")[1]);
    assert.equal(q.get("rpc"), "https://rpc.example");
    assert.equal(q.get("web"), "https://web.example");
    assert.equal(q.get("other"), null, "only rpc and web are kept");
  });
});

test("X puts the link after the text, the others put it first, for its card", () => {
  const text = "Ace on Down the Tunnel. Somewhere on gno.land a realm just nodded.", url = "https://gnogolf.xyz/h/garden-3/";
  const l = Object.fromEntries(shareLinks(text, url));
  const x = new URL(l.X).searchParams;
  assert.equal(x.get("text"), text);
  assert.equal(x.get("url"), url);
  for (const k of ["WhatsApp", "Bluesky"]) assert.ok(new URL(l[k]).searchParams.get("text")!.startsWith(url + "\n"), k);
  assert.equal(new URL(l.Facebook).searchParams.get("u"), url);
  assert.ok(pasted(text, url).startsWith(url));
});

test("a name to start from: the gnome's letters and 3 digits, as the registrar wants", () => {
  assert.equal(suggestName("classic", 0), "classic100");
  assert.equal(suggestName("Big-Viking", 0.999), "bigviking999");
  assert.equal(suggestName("bob", 0.5), "golfer550"); // too short
  assert.equal(suggestName("gnomey", 0), "golfer100"); // the registrar refuses gno…
  assert.match(suggestName("the ultimate champion"), /^[a-z]{5,13}\d{3}$/);
});
