// The shot clip's pure parts: the MP4 picked (or none), the stretch of the
// stroke shown, the sky's stops, the file's name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIP, clipMime, clipName, clipWindow, skyStops } from "../lib/clip.ts";

void test("the best MP4 the browser records, or none at all (no WebM: X takes MP4 only)", () => {
  assert.equal(clipMime(() => true), "video/mp4;codecs=avc1.640028");
  assert.equal(clipMime((t) => t === "video/mp4"), "video/mp4");
  assert.equal(clipMime((t) => t.startsWith("video/webm")), "");
  // a browser that throws on a type it does not know is a no
  assert.equal(clipMime((t) => { if (t.includes("640028")) throw new Error("bad type"); return true; }), "video/mp4;codecs=avc1.42E01F");
});

void test("a short stroke is shown whole, from the moment before the release", () => {
  const w = clipWindow([300, 300, 320]);
  assert.deepEqual(w, { from: 0, lead: CLIP.lead, length: CLIP.lead + 920 + CLIP.tail });
});

void test("a long stroke opens on its last steps, no lead, and stays within the max", () => {
  const ms = Array.from({ length: 60 }, () => 200); // 12 s of rolling
  const w = clipWindow(ms);
  assert.equal(w.lead, 0);
  assert.ok(w.length <= CLIP.max, `${w.length}`);
  assert.equal(w.length, (60 - w.from) * 200 + CLIP.tail);
  assert.ok(w.length + 200 > CLIP.max, "as many steps as fit");
  // one step longer than the whole clip (a spiral slide) is still shown
  assert.deepEqual(clipWindow([100, 9000], { lead: 500, tail: 1000, max: 8000 }), { from: 1, lead: 0, length: 10000 });
});

void test("the sky's stops, read from the computed gradient", () => {
  assert.deepEqual(skyStops("linear-gradient(178deg, rgb(253, 235, 207) 0%, rgb(243, 221, 194) 38%, #bfd9cc 100%)"), [
    [0, "rgb(253, 235, 207)"],
    [0.38, "rgb(243, 221, 194)"],
    [1, "#bfd9cc"],
  ]);
  assert.deepEqual(skyStops("none"), [[0, "#fdebcf"], [1, "#bfd9cc"]]);
});

void test("the file is named after its hole", () => {
  assert.equal(clipName("garden/3/v2"), "gnogolf-garden-3.mp4");
  assert.equal(clipName("mountain/18"), "gnogolf-mountain-18.mp4");
  assert.equal(clipName("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5/My Hole!/v1"), "gnogolf-my-hole.mp4");
  assert.equal(clipName(""), "gnogolf.mp4");
});
