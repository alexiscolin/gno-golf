// holeLink: the address every share and copied link is built from. A cup's
// hole by its own page (its link card), anything else by its id.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Snapshot } from "../lib/engine.ts";
import { holeLink } from "../components/common.ts";

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
