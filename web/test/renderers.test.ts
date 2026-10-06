// A WebGL context let go by whoever owns its canvas: three's dispose() frees
// what a renderer made but keeps the context until the canvas is collected,
// and a browser holds about sixteen (the oldest then lost, a live one with
// them). The title, the clips and the gnomes force the loss of their own;
// the game's engine draws on its caller's canvas (Golf's lives as long as
// the page, a new engine on it takes the same context back); the Builder's
// preview (each visit to Edit) and test mode (each visit to Test) make a
// canvas of their own each mount and free its context when they go.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(WEB, f), "utf8");
const sources = (dir: string): string[] =>
  fs.readdirSync(path.join(WEB, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []);
const FREES = /forceContextLoss\(\)|WEBGL_lose_context/;

void test("every renderer made on a canvas of its own is let go with its context", () => {
  const CALLERS = new Set([path.join("lib", "scene", "camera.ts"), path.join("lib", "engine.ts")]); // (makeRenderer's home; the engine, on its caller's canvas)
  const makers = ["lib", "components"].flatMap(sources).filter((f) => !CALLERS.has(f) && /makeRenderer\(|new THREE\.WebGLRenderer\(/.test(read(f)));
  assert.ok(makers.length >= 5, "the scan finds them");
  for (const f of makers) assert.match(read(f), FREES, `${f} makes a renderer and never frees its context`);
});

void test("a canvas the Builder hands the game is its own each visit, freed when the visit ends (the game's own lives with the page)", () => {
  const owners = ["components", "app"].flatMap(sources).filter((f) => /createGame\(/.test(read(f)));
  assert.deepEqual(owners.sort(), [path.join("components", "Golf.tsx"), path.join("components", "builder", "TestMode.tsx")]);
  const tm = read(path.join("components", "builder", "TestMode.tsx"));
  assert.match(tm, /document\.createElement\("canvas"\)/, "test mode makes its canvas each mount");
  assert.match(tm, FREES, "and frees its context");
  assert.match(read(path.join("components", "builder", "Preview.tsx")), /document\.createElement\("canvas"\)[\s\S]*forceContextLoss\(\)[\s\S]*el\.remove\(\)/, "the preview too");
});
