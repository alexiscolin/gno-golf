// @ts-check
// The game's own gnome, as meshes: makeBall (web/lib/scene/gnome.ts) run in
// headless Chrome, every mesh it builds read back with where it stands, its
// colour, its texture and its ink. What the portrait is traced from
// (build.mjs): the realm's SVG is the game's gnome seen from the
// thumbnails' camera, not a drawing of it.
//
// The client is read from DESIGNS (default: this repo's root), bundled with
// the same pinned esbuild as media/gnomes/render.mjs, from its web/ (its node_modules installed). Its bake is kept from
// merging: every object is made "live" as it is made, so each mesh stays one.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep } from "../../lib/cdp.mjs";

export const DESIGNS = path.resolve(process.env.DESIGNS || new URL("../../../", import.meta.url).pathname);

// (runs in the page) every Object3D's userData marked live as it is set: bake
// then leaves each mesh as made, one shape to trace each
const ENTRY = `import * as THREE from "three";
import { makeBall, GNOMES } from "./lib/scene/gnome";
import "./lib/scene/gnome-dress";
import { hatTop } from "./lib/scene/gnome-kit";
import { makeTrail } from "./lib/scene/gnome-fx";
import { makeShowcase } from "./lib/scene/gnome-showcase";
import { PROP_DESIGNS } from "./lib/gnomes/props";
import * as VOCAB from "./lib/gnomes/vocab";
import { TIER_LOOK } from "./lib/gnomes/catalogue";
import { encode, PLAIN } from "./lib/gnomes/codec";
import { lookOf, skinOf, EARNED_KINDS } from "./lib/gnomes/skin";
import { darkBody } from "./lib/gnomes/colour";
import { BALL_R } from "./lib/terrain";
Object.defineProperty(THREE.Object3D.prototype, "userData", { configurable: true,
  get() { return this.__ud; }, set(v) { if (v && typeof v === "object") v.live = true; this.__ud = v; } });
let seed = 7;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
// (by the texture itself: its uuid comes from Math.random, seeded the same for each gnome)
const textures = new Map(), ids = new WeakMap();
const pixels = (t) => {
  if (!t || !t.image) return null;
  if (ids.has(t)) return ids.get(t);
  const id = "t" + textures.size;
  const img = t.image, c = document.createElement("canvas");
  c.width = img.width, c.height = img.height;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  textures.set(id, { w: c.width, h: c.height, data: Array.from(x.getImageData(0, 0, c.width, c.height).data), flipY: t.flipY !== false });
  ids.set(t, id);
  return id;
};
const levels = (t) => (t && t.image && t.image.data ? Array.from(t.image.data) : null);
window.texture = (id) => textures.get(id);
window.gnomes = GNOMES;
window.props = Object.fromEntries(Object.entries(PROP_DESIGNS).map(([k, v]) => [k, "legend" in v ? "legend" : v.at]));
window.hatTop = (skin) => hatTop(skin);
window.vocab = { DARK: VOCAB.COLOURS.map(([, v]) => darkBody(v)), ...Object.fromEntries(Object.entries(VOCAB).filter(([, v]) => Array.isArray(v))), TIER_LOOK };
// the earned nine as every field of their look (their stripes a pattern), by kind
// the gnome some traits draw, every other field plain (lib/gnomes/skin.ts: the client's own reading)
window.skinOf = (t) => skinOf({ ...PLAIN, accessories: [], ...t }, { id: "portrait", name: "", line: "" });
window.earned = EARNED_KINDS.map((k) => encode(lookOf(GNOMES.find((g) => g.unlock === k))));
window.ballR = BALL_R;
// what the showcase draws of him: the gnome standing on the ground, or his trail behind him as he rolled in
const shown = (skin, trail) => {
  seed = 7;
  if (trail) {
    const t = makeTrail(skin);
    if (!t) return null;
    for (let k = 14; k >= 0; k--) t.push(new THREE.Vector3(0.08 * k, 0.04, -0.05 * k - 0.002 * k * k), (14 - k) * 0.03);
    t.step(14 * 0.03);
    const g = new THREE.Group();
    g.add(t.group);
    return g;
  }
  const ball = makeBall(skin);
  ball.position.y = BALL_R;
  return ball;
};
window.meshes = (skin, trail = false) => {
  const ball = shown(skin, trail);
  if (!ball) return [];
  ball.updateMatrixWorld(true);
  const out = [];
  ball.traverse((o) => {
    if (!o.isMesh || o === ball.userData?.shade) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const m = o.material;
    if (m.side === THREE.BackSide) return; // an ink hull: drawn as the outline of its mesh
    // (inked(): the mesh and its hull side by side in a group, on the same geometry)
    const hull = o.parent && o.parent.children.find((c) => c.isMesh && c.geometry === o.geometry && c.material.side === THREE.BackSide);
    const g = o.geometry;
    const at = [];
    if (o.isInstancedMesh) {
      const mm = new THREE.Matrix4();
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, mm);
        const s = new THREE.Vector3().setFromMatrixScale(mm);
        if (s.x > 0.001) at.push(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, mm).elements);
      }
    } else at.push(o.matrixWorld.elements);
    out.push({
      at,
      position: Array.from(g.attributes.position.array),
      normal: g.attributes.normal ? Array.from(g.attributes.normal.array) : null,
      uv: g.attributes.uv ? Array.from(g.attributes.uv.array) : null,
      index: g.index ? Array.from(g.index.array) : null,
      type: m.type,
      color: m.color ? m.color.getHex() : 0xffffff,
      side: m.side,
      opacity: m.transparent ? m.opacity : 1,
      additive: m.blending === THREE.AdditiveBlending,
      map: pixels(m.map),
      emissive: m.emissive ? m.emissive.getHex() : 0,
      emissiveMap: !!m.emissiveMap,
      bands: levels(m.gradientMap),
      ink: hull ? { color: hull.material.color.getHex(), w: Number(String(hull.material.userData.hook || "").replace(/^hull/, "")) || 0.028 } : null,
    });
  });
  return out;
};
// a thumbnail as media/gnomes/render.mjs draws one (the earned nine have none on file)
let showcase = null;
window.thumb = (skin, tier) => {
  showcase ||= makeShowcase(512);
  seed = 7;
  showcase.show(skin, tier);
  return showcase.shot(256, 0.9);
};
window.ready = true;`;

/** A headless Chrome with the client's gnome in it: { meshes(skin, trail?), texture(id), page(expr), kill() }; the
 *  page also holds gnomes (GNOMES), props (each prop's anchor), vocab (the code tables, TIER_LOOK), earned (the nine's looks). */
export async function gnomePage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gnogolf-portrait-"));
  const bundle = path.join(tmp, "extract.js");
  execFileSync("npx", ["--yes", "esbuild@0.24.2", "--bundle", "--format=iife", "--sourcefile=extract.js", `--outfile=${bundle}`, "--log-level=warning"], {
    input: ENTRY, stdio: ["pipe", "inherit", "inherit"], cwd: path.join(DESIGNS, "web"), // (three resolves from the client's own node_modules)
  });
  const b = await launch({ width: 300, height: 300 });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  await b.js(fs.readFileSync(bundle, "utf8") + ";1");
  if (!(await b.ev("window.ready"))) throw new Error(`the gnome page did not start: ${b.errors.slice(0, 3)}`);
  /** @type {Map<string, any>} */
  const tex = new Map();
  return {
    /** @param {object} skin @param {boolean} [trail] his trail instead of him */
    meshes: async (skin, trail = false) => /** @type {Mesh[]} */ (await b.js(`meshes(${JSON.stringify(skin)}, ${trail})`)),
    /** @param {string} id */
    texture: async (id) => tex.get(id) ?? (tex.set(id, await b.js(`texture(${JSON.stringify(id)})`)), tex.get(id)),
    /** @param {string} expr */
    page: (expr) => b.js(expr),
    kill: () => b.kill(),
  };
}

/**
 * @typedef {{ at: number[][], position: number[], normal: number[] | null, uv: number[] | null, index: number[] | null,
 *   type: string, color: number, side: number, opacity: number, additive: boolean, map: string | null, emissive: number, emissiveMap: boolean,
 *   bands: number[] | null, ink: { color: number, w: number } | null }} Mesh
 */
