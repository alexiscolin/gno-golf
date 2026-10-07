// A WebGL context let go by whoever owns its canvas: three's dispose() frees
// what a renderer made but keeps the context until the canvas is collected,
// and a browser holds about sixteen (the oldest then lost, a live one with
// them). The title, the clips and the gnomes force the loss of their own;
// the game's engine draws on its caller's canvas (Golf's lives as long as
// the page, a new engine on it takes the same context back). The Builder
// has one canvas for the page (lib/builder/stage.ts): its 3D board draws on
// it, and test mode is lent it each visit, so no visit makes a context; the
// Publish step's preview makes its own and frees it when it goes.
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
  const CALLERS = new Set([path.join("lib", "scene", "camera.ts"), path.join("lib", "engine.ts"), path.join("lib", "builder", "stage.ts")]); // (makeRenderer's home; the engine, on its caller's canvas; the Builder's one canvas, kept for the page)
  const makers = ["lib", "components"].flatMap(sources).filter((f) => !CALLERS.has(f) && /makeRenderer\(|new THREE\.WebGLRenderer\(/.test(read(f)));
  assert.ok(makers.length >= 5, "the scan finds them");
  for (const f of makers) assert.match(read(f), FREES, `${f} makes a renderer and never frees its context`);
});

void test("the Builder's one canvas: made once for the page, the board drawing on it and test mode lent it, never a canvas or a context a visit", () => {
  const owners = ["components", "app"].flatMap(sources).filter((f) => /createGame\(/.test(read(f)));
  assert.deepEqual(owners.sort(), [path.join("components", "Golf.tsx"), path.join("components", "builder", "TestMode.tsx")]);
  const stage = read(path.join("lib", "builder", "stage.ts"));
  assert.match(stage, /canvas \?\?= document\.createElement\("canvas"\)/, "one canvas, made once");
  assert.match(stage, /renderer = makeRenderer\(stageCanvas\(\)\)/, "one renderer for the board, made once");
  for (const f of [path.join("components", "builder", "TestMode.tsx"), path.join("components", "builder", "Scene.tsx")]) {
    assert.match(read(f), /hold\(/, `${f} holds the Builder's canvas`);
    assert.doesNotMatch(read(f), /createElement\("canvas"\)/, `${f} makes no canvas of its own`);
    assert.doesNotMatch(read(f), FREES, `${f} never loses the shared context`);
  }
  assert.match(read(path.join("components", "builder", "Preview.tsx")), /document\.createElement\("canvas"\)[\s\S]*forceContextLoss\(\)[\s\S]*el\.remove\(\)/, "Publish's preview: its own, freed");
});
