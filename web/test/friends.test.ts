import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadFriends, saveFriends, addFriend } from "../lib/friends.ts";

// valid addresses per lib/chain.ts: /^g1[0-9a-z]{38}$/
const addr = (c: string) => "g1" + c.repeat(38);
const A = addr("a"), B = addr("b");

beforeEach(() => {
  localStorage.clear();
});

test("loadFriends: empty storage is an empty list", () => {
  assert.deepEqual(loadFriends(), []);
});

test("loadFriends: keeps only well-formed, valid-address entries", () => {
  localStorage.setItem(
    "gnogolf.friends",
    JSON.stringify([
      { addr: A, name: "Ana" },
      { addr: "not-an-address", name: "Bad" },
      { name: "No addr field" },
      "just a string",
      null,
      { addr: B, name: "" },
    ]),
  );
  assert.deepEqual(loadFriends(), [
    { addr: A, name: "Ana" },
    { addr: B, name: "" },
  ]);
});

test("loadFriends: a non-array top level is ignored", () => {
  localStorage.setItem("gnogolf.friends", JSON.stringify({ addr: A }));
  assert.deepEqual(loadFriends(), []);
});

test("loadFriends: corrupt JSON is ignored", () => {
  localStorage.setItem("gnogolf.friends", "{not json");
  assert.deepEqual(loadFriends(), []);
});

test("loadFriends: a storage that throws is ignored", () => {
  localStorage.getItem = () => { throw new Error("boom"); };
  try {
    assert.deepEqual(loadFriends(), []);
  } finally {
    delete (localStorage as unknown as Record<string, unknown>).getItem;
  }
});

test("saveFriends: keeps the latest 49 entries and returns what it stores", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ addr: addr(String.fromCharCode(97 + (i % 26))), name: String(i) }));
  const saved = saveFriends(many);
  assert.equal(saved.length, 49);
  assert.equal(saved[0].name, "11", "the oldest dropped");
  assert.deepEqual(JSON.parse(localStorage.getItem("gnogolf.friends")!), saved, "the list returned is the one stored");
});

test("saveFriends: swallows a storage that throws and still returns the list", () => {
  localStorage.setItem = () => { throw new Error("quota"); };
  try {
    const f = [{ addr: A, name: "Ana" }];
    assert.deepEqual(saveFriends(f), f);
  } finally {
    delete (localStorage as unknown as Record<string, unknown>).setItem;
  }
});

test("addFriend: rejects an invalid address, unchanged list", () => {
  addFriend(A, "Ana");
  const before = loadFriends();
  const after = addFriend("bogus", "Nope");
  assert.deepEqual(after, before);
});

test("addFriend: adds a new friend with a default empty name", () => {
  const f = addFriend(A);
  assert.deepEqual(f, [{ addr: A, name: "" }]);
  assert.deepEqual(loadFriends(), [{ addr: A, name: "" }]);
});

test("addFriend: does not duplicate an address already on the list", () => {
  addFriend(A, "Ana");
  const f = addFriend(A, "Someone else");
  assert.deepEqual(f, [{ addr: A, name: "Ana" }]);
});

test("addFriend: appends, keeping earlier friends", () => {
  addFriend(A, "Ana");
  const f = addFriend(B, "Bo");
  assert.deepEqual(f, [
    { addr: A, name: "Ana" },
    { addr: B, name: "Bo" },
  ]);
});

test("loadFriends: a friend whose name is not text is dropped, not drawn", () => {
  localStorage.setItem("gnogolf.friends", JSON.stringify([{ addr: A, name: { x: 1 } }, { addr: B, name: "Bo" }]));
  assert.deepEqual(loadFriends(), [{ addr: B, name: "Bo" }]);
});

test("saveFriends: a full list keeps the latest (one added now is kept)", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ addr: A, name: String(i) }));
  saveFriends(many);
  const kept = JSON.parse(localStorage.getItem("gnogolf.friends") || "[]") as { name: string }[];
  assert.equal(kept.length, 49);
  assert.equal(kept[48].name, "59");
});
