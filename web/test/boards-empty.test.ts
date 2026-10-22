// An empty board (components/Leaderboard.tsx) once the chain has answered with nobody: its places drawn free (no bars,
// the first one's words), never the bars of a board still read; while it is read, the bars, and no "empty" said.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../components/Leaderboard.tsx", import.meta.url), "utf8");

void test("a board read with nobody: its places free, its line said; one still read: its bars, nothing said", () => {
  assert.match(src, /const FREE = "Yours to take";/);
  assert.match(src, /\{!rows && !err && ghosts\(\)\}/, "still read: the bars");
  assert.match(src, /\{rows && rows\.length === 0 && \(<>\{ghosts\(FREE\)\}<p className="lb__empty late">No saved round yet/, "read, nobody: free, and said");
  assert.match(src, /free === undefined \? <><i \/><i \/><i \/><\/> : i === 0 && free && <b>\{free\}<\/b>/, "a row: the bars only while read");
  assert.match(src, /free === undefined \? <i \/> : at <= 1 && free && <b className="podium__free">\{free\}<\/b>/, "a sticker: the same");
});

void test("the records to beat: blank while read, free once read with nobody (flagged: free, no words), the line kept", () => {
  assert.match(src, /<StickerGhost at=\{empty \? i \+ 1 : 0\} free=\{empty \? \(top && top\.flagged \? "" : FREE\) : undefined\} \/>/);
  assert.match(src, /const empty = !!top && !top\.cards\.length;/, "empty only once the read has answered");
  assert.match(src, /"Nobody yet: save a round on-chain and be the first record here\."/);
});
