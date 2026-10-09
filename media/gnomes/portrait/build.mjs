// @ts-check
// The gnomes realm's portrait art: every trait of format 1 traced from the
// game's own gnome (extract.mjs, raster.mjs) into SVG shapes the realm puts
// together on each read (svg.gno). Writes gno.land/r/gnogolf/gnomes/art.gno.
//   DESIGNS=<the client's checkout> node media/gnomes/portrait/build.mjs [--check]
// --check: fails when art.gno is not what this would write.
//
// A trait's art is the meshes it adds to a plain gnome, seen from the
// thumbnails' camera: each mesh is drawn where it is in front of what is
// painted before it (the body first, then nearest last), its outline inked,
// its light in the game's toon bands (dark overlays), its texture's marks
// (a Rare's pattern, an Epic's grain) as shapes of their own. A colour that
// comes from the gnome (his hat's, his accent…) is a slot the realm fills;
// the rest are the client's own colours. The realm sorts every shape of a
// gnome by its depth key and paints them in that order.
import fs from "node:fs";
import { gnomePage, DESIGNS } from "./extract.mjs";
import { rasterize, maskOf, erode, dilate, trace, simplify, pathOf, areaOf, project, toUnits, unitsAt, LIT_SRGB, N, SIZE } from "./raster.mjs";

const OUT = new URL("../../../gno.land/r/gnogolf/gnomes/art.gno", import.meta.url);
const check = process.argv.includes("--check");

// ---------------------------------------------------------------- colours
//
// A slot is a colour of the gnome's own: a trait field. Each is drawn in a
// colour of its own no palette or mesh has (two sets, to tell a slot from a
// mesh's fixed colour), and once left unset (what the client draws then:
// the slot's default, per mesh).
/** @type {Record<string, string>} slot -> the Traits field it is */
const SLOTS = { H: "hatColour", R: "brim", A: "hair", B: "body", P: "patternColour", C: "accent", Q: "pieceColour",
  O: "propColour", M: "materialColour", T: "trailColour" };
/** @type {Record<string, number>} */
const SET_A = { H: 0xd0a0a1, R: 0xa0d0a2, A: 0xa0a2d0, B: 0xe8e0c4, P: 0x903064, C: 0x309066, Q: 0x306098, O: 0x906038, M: 0x60903a, T: 0x50a0b0 };
const SET_B = Object.fromEntries(Object.entries(SET_A).map(([k, v]) => [k, v + 0x020202]));
const INK = 0x144134;
const hex = (/** @type {number} */ v) => v.toString(16).padStart(6, "0");

// ---------------------------------------------------------------- the light
//
// A shape's fill is its colour under a lit top (LIT_SRGB, applied by the
// realm); where the light on it falls under SHADE[k] of that, an overlay of
// black darkens it (the classes .d and .e of the SVG, the second inside the
// first: together DARKEST); a polished material's brightest band is a white
// overlay (.l).
const SHADE = [0.8, 0.6];
const DARK_1 = 0.12, DARKEST = 0.25;
const OVERLAY = [DARK_1, Math.round((1 - (1 - DARKEST) / (1 - DARK_1)) * 1000) / 1000];

// ---------------------------------------------------------------- tracing
// how far a traced outline may stray (raster pixels) and the smallest speck drawn (pixels²): a
// fill's, its light's (looser: soft edges), and its marks' to start from
const FILL = { tol: 1.6, min: 12 }, LIGHT = { tol: 3, min: 60 }, MARKS = { tol: 1.6, min: 16 };
/** What a mesh's marks may weigh (bytes): past it they are traced coarser, specks dropped first. */
const MARK_BUDGET = 900;
/** How much bolder a mark is drawn than its texture's (raster pixels): its texels are thinner than a trace. */
const MARK_GROW = 2;
/** Mask a, within mask b (the same box). */
const clip = (/** @type {import("./raster.mjs").Mask} */ a, /** @type {import("./raster.mjs").Mask} */ b) => ({ ...a, on: a.on.map((v, i) => v & b.on[i]) });
const INK_W = 0.028; // the gnome's thin hull (materials.ts THIN_HULL), in his own units
const BODY_SCALE = 0.5 / 0.55; // his units to the world's (makeBall: BALL_R / 0.55)
/** The ink's width in SVG units, at his depth. */
const INK_UNITS = unitsAt(INK_W * BODY_SCALE, 5);

/** What a trait's art may weigh (bytes): past it, it is traced coarser (the Legendaries' busy pieces). */
const ART_BUDGET = 1000;
/** How much coarser than its own tolerances a trace is now (art()'s budget raises it). */
let coarse = 1;
/** A mask's outlines as path data, specks dropped. */
function outline(/** @type {import("./raster.mjs").Mask} */ m, { tol, min } = FILL) {
  const rings = trace(m).filter((r) => Math.abs(areaOf(r)) >= min * coarse).map((r) => simplify(r, tol * coarse));
  return pathOf(rings.filter((r) => r.length >= 3));
}

const page = await gnomePage();
/** @type {Record<string, any>} */
const vocab = await page.page("vocab");
const PROP_AT = /** @type {Record<string, string>} */ (await page.page("props"));

/** The gnome some traits draw (the client's skinOf), every other field plain; colours as given. */
const skin = (/** @type {object} */ t) => page.page(`skinOf(${JSON.stringify(t)})`);

/**
 * A look drawn three times: its slots in set A, in set B, and unset (the
 * hat in A: a part that takes the hat's colour by default says so).
 * @param {Record<string, unknown>} t traits (no colours)
 * @param {boolean} [trail] his trail, not him
 * @param {Record<string, unknown>} [fixed] colours kept in all three (a dark body)
 */
async function render(t, trail = false, fixed = {}) {
  const set = (/** @type {Record<string, number>} */ s) => ({ ...t, ...Object.fromEntries(Object.entries(SLOTS).map(([k, f]) => [f, s[k]])), ...fixed });
  const [A, B, U] = await Promise.all([set(SET_A), set(SET_B), { ...t, hatColour: SET_A.H, ...fixed }].map(async (x) => page.meshes(await skin(x), trail)));
  if (A.length !== B.length || A.length !== U.length) throw new Error(`portrait: ${JSON.stringify(t)} is not drawn the same in its colours`);
  return { A, B, U };
}
/**
 * A drawing: the look in colour sets A and B and unset; or, real, in its own
 * colours, three times the same, those of its slots named (what a material
 * whose marks are seeded from its colours is drawn in: lava's cracks).
 * @typedef {{ A: import("./extract.mjs").Mesh[], B: import("./extract.mjs").Mesh[], U: import("./extract.mjs").Mesh[],
 *   real?: Record<string, [number, string]> }} Drawn
 */

/** A mesh's identity across two looks: what it is, where, in which colour. */
const sig = (/** @type {import("./extract.mjs").Mesh} */ m) =>
  [m.position.length, m.type, m.color, m.map ? "map" : "", m.at.map((e) => e.map((v) => v.toFixed(3)).join(",")).join(";")].join("|");
/** The meshes of d that base has not: what a trait adds (by index into d). */
const added = (/** @type {Drawn} */ d, /** @type {Drawn} */ base) => {
  const had = new Set(base.A.map(sig));
  return d.A.map((m, i) => (had.has(sig(m)) ? -1 : i)).filter((i) => i >= 0);
};

/** The colour most of a texture is (its base): the colour its mesh is drawn in. */
async function baseOf(/** @type {string} */ id) {
  const t = await page.texture(id), n = new Map();
  for (let i = 0; i < t.data.length; i += 4) {
    const c = (t.data[i] << 16) | (t.data[i + 1] << 8) | t.data[i + 2];
    n.set(c, (n.get(c) || 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
}

/** A colour across the three drawings, as the realm reads it: "#rrggbb" fixed, or a slot and its default (6 hex, or "H" the hat's). */
function token(/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ u) {
  if (a === b) return "#" + hex(a);
  const slot = Object.keys(SLOTS).find((k) => SET_A[k] === a && SET_B[k] === b);
  if (!slot) throw new Error(`portrait: a colour that is neither fixed nor a slot: ${hex(a)} / ${hex(b)}`);
  return slot + (u === SET_A.H ? "H" : hex(u));
}
/** A mesh's colour token (a textured one's: its texture's base). */
async function colourOf(/** @type {Drawn} */ d, /** @type {number} */ i) {
  const [a, b, u] = await Promise.all([d.A[i], d.B[i], d.U[i]].map((m) => (m.map ? baseOf(m.map) : m.color)));
  const slot = d.real && Object.entries(d.real).find(([, [v]]) => v === a);
  if (slot) return slot[0] + slot[1][1];
  return token(a, b, u);
}
/** The colours a texel can be a mark of: the slots', and the ink. */
const candidates = (/** @type {Drawn} */ d) =>
  /** @type {[string, number][]} */ ([...(d.real ? Object.entries(d.real).map(([k, [v]]) => [k, v]) : Object.entries(SET_A)), ["ink", INK]]);

/** A texel's mark: the slot or colour it is drawn in over its base, and how much of it (wood's grain is 0.4). */
function markOf(/** @type {number} */ c, /** @type {number} */ base, /** @type {[string, number][]} */ cands) {
  if (c === base) return null;
  const rgb = (/** @type {number} */ v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const [x, b0] = [rgb(c), rgb(base)];
  let best = null;
  for (const [name, s] of cands) {
    if (s === base) continue;
    const d = rgb(/** @type {number} */ (s)).map((v, i) => v - b0[i]), e = x.map((v, i) => v - b0[i]);
    const dd = d.reduce((t, v) => t + v * v, 0);
    if (!dd) continue;
    const t = d.reduce((acc, v, i) => acc + v * e[i], 0) / dd;
    const miss = Math.hypot(...e.map((v, i) => v - t * d[i]));
    if (t > 0.12 && miss < 24 && (!best || miss < best.miss)) best = { name: /** @type {string} */ (name), t: Math.min(1, t), miss };
  }
  return best;
}

/** The depth key of a depth: 2 (far) to 255 (near); 0 and 1 are the body's own (its fill, then its light). */
const keyOf = (/** @type {number} */ z) => 2 + Math.round(Math.max(0, Math.min(1, (6.1 - z) / 2.2)) * 253);
const key2 = (/** @type {number} */ k) => k.toString(16).padStart(2, "0");

/**
 * The shapes of meshes `which` of a drawing, painted after its body (index
 * 0, itself among them when `body`): each where it is in front of what is
 * painted before it.
 * @param {Drawn} d
 * @param {number[]} which
 * @param {{ body?: boolean, ground?: boolean }} [o] body: the body is drawn too (keys 0 and 1); ground: there is
 *   no body (a trail: drawn before him, nothing of it hidden)
 */
async function shapesOf(d, which, { body = false, ground = false } = {}) {
  const tex = async (/** @type {import("./extract.mjs").Mesh} */ m) => (m.map ? page.texture(m.map) : null);
  const front = new Float32Array(N * N).fill(Infinity);
  const B = ground ? null : rasterize(d.A[0], await tex(d.A[0]));
  if (!ground && !B) throw new Error("portrait: no body");
  const bodyAt = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (!B) return Infinity;
    const bx = x - B.x0, by = y - B.y0;
    return bx >= 0 && by >= 0 && bx < B.w && by < B.h ? B.depth[by * B.w + bx] : Infinity;
  };
  /** @type {{ i: number, L: import("./raster.mjs").Layer, key: number }[]} */
  const todo = [];
  for (const i of which) {
    if (i === 0 && !ground) continue;
    const L = rasterize(d.A[i], await tex(d.A[i]));
    if (!L) continue;
    let sum = 0, n = 0;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const z = L.depth[y * L.w + x];
      if (z !== Infinity && z < bodyAt(x + L.x0, y + L.y0)) (sum += z), n++;
    }
    if (n) todo.push({ i, L, key: keyOf(sum / n) });
  }
  todo.sort((a, b) => a.key - b.key);
  const paint = (/** @type {import("./raster.mjs").Layer} */ L) => {
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const z = L.depth[y * L.w + x], o = (y + L.y0) * N + x + L.x0;
      if (z < front[o]) front[o] = z;
    }
  };
  const out = [];
  if (B) {
    if (body) out.push(...(await shapeOf(d, 0, B, null, 0)));
    paint(B);
  }
  for (const t of todo) {
    out.push(...(await shapeOf(d, t.i, t.L, front, t.key)));
    paint(t.L);
  }
  return out;
}

/**
 * One mesh's shapes: its fill (inked, flat or lit), its marks, its light.
 * The body (key 0) puts its light at key 1, after a pattern's marks.
 * @param {Drawn} d @param {number} i @param {import("./raster.mjs").Layer} L
 * @param {Float32Array | null} front what is painted before it (null: nothing)
 * @param {number} key
 */
async function shapeOf(d, i, L, front, key) {
  const m = d.A[i];
  const { mask, count } = maskOf(L, (o, x, y) => !front || L.depth[o] < front[y * N + x]);
  if (!count) return [];
  const path = outline(mask);
  if (!path) return [];
  const lit = m.type === "MeshBasicMaterial";
  const kind = lit ? "g" : m.ink ? "i" : "f";
  let colour = eyes.includes(sig(m)) ? "E" + hex(INK) : await colourOf(d, i);
  const alpha = m.additive ? Math.min(1, m.opacity * 0.8) : m.opacity;
  if (alpha < 0.99) colour += "~" + String(Math.round(alpha * 100)).padStart(2, "0").replace(/0$/, "");
  const k = key2(key);
  const out = [`${k}${kind}${colour}:${path}`];
  // the marks of its texture, kept off its outline's ink
  if (m.map && L.texel) {
    const inner = erode(mask, Math.round((INK_UNITS / 2) * (N / SIZE)));
    const base = await baseOf(m.map), cands = candidates(d);
    // one mark a colour, at the opacity most of its texels have (wood's grain 0.4, the rest 1),
    // its texels those at least half that (an antialiased edge is not a mark of its own)
    /** @type {Map<string, number[]>} */
    const seen = new Map();
    const at = new Array(inner.on.length);
    for (let o = 0; o < inner.on.length; o++) {
      if (!inner.on[o]) continue;
      const mk = markOf(L.texel[o], base, cands);
      if (!mk) continue;
      at[o] = mk;
      if (!seen.has(mk.name)) seen.set(mk.name, Array(11).fill(0));
      /** @type {number[]} */ (seen.get(mk.name))[Math.round(mk.t * 10)]++;
    }
    /** @type {Map<string, Uint8Array>} */
    const marks = new Map();
    for (const [name, hist] of seen) {
      const t = hist.reduce((b, n, i) => (i >= 3 && n > hist[b] ? i : b), 3);
      const on = new Uint8Array(inner.on.length);
      for (let o = 0; o < on.length; o++) if (at[o] && at[o].name === name && at[o].t * 10 >= t / 2) on[o] = 1;
      marks.set(`${name}~${t}`, on);
    }
    // traced within the budget: coarser each time it is over
    let paths = [];
    for (let k2 = 0, o = MARKS; k2 < 8; k2++, o = { tol: o.tol * 1.4, min: o.min * 1.3 }) {
      // (a thin mark, a stitch or a crack, made bold first: traced, a line a pixel wide is a speck)
      paths = [...marks].map(([at, on]) => [at, on, outline(clip(dilate({ ...inner, on }, MARK_GROW), inner), o)]).filter(([, , p]) => p);
      if (paths.reduce((n, [, , p]) => n + p.length, 0) <= MARK_BUDGET) break;
    }
    for (const [at, on, p] of paths) {
      const [name, t] = at.split("~");
      // the mark's colour: its slot (its default: the unset drawing's texel, unblended), or a fixed one
      const tone = name === "ink" ? "#" + hex(INK) : name + (await markDefault(d, i, on, Number(t) / 10));
      // (a glowing texture's marks are lit: lava's cracks)
      out.push(`${k}${m.emissiveMap ? "k" : "m"}${tone}${t === "10" ? "" : "~" + t}:${p}`);
    }
  }
  if (!lit) {
    const lk = key === 0 ? key2(1) : k;
    for (const [c, under] of /** @type {[string, number][]} */ ([["d", SHADE[0]], ["e", SHADE[1]]])) {
      const band = maskOf(L, (o) => mask.on[o] === 1 && L.shade[o] < under).mask;
      const p = outline(band, LIGHT);
      if (p) out.push(`${lk}${c}:${p}`);
    }
    // a polished material's shine: its brightest, narrow band
    if (m.bands && m.bands.length === 5) {
      const p = outline(maskOf(L, (o) => mask.on[o] === 1 && L.band[o] === 4).mask, LIGHT);
      if (p) out.push(`${lk}l:${p}`);
    }
  }
  return out;
}

/** The colour a slot's mark is when the slot is unset: the unset drawing's texels there, unblended from its base. */
async function markDefault(/** @type {Drawn} */ d, /** @type {number} */ i, /** @type {Uint8Array} */ on, /** @type {number} */ t) {
  const slot = d.real && Object.entries(d.real).find(([k]) => k === "M");
  if (slot) return slot[1][1];
  const m = d.U[i];
  if (!m.map) return "ffffff";
  const U = rasterize(m, await page.texture(m.map));
  if (!U || !U.texel) return "ffffff";
  const base = await baseOf(m.map), n = new Map();
  for (let o = 0; o < on.length; o++) if (on[o] && U.texel[o] !== base) n.set(U.texel[o], (n.get(U.texel[o]) || 0) + 1);
  if (!n.size) return "ffffff";
  const c = [...n].sort((a, b) => b[1] - a[1])[0][0];
  const ch = (/** @type {number} */ s) => Math.max(0, Math.min(255, Math.round((((c >> s) & 255) - ((base >> s) & 255) * (1 - t)) / t)));
  return hex((ch(16) << 16) | (ch(8) << 8) | ch(0));
}

/** @type {{ id: number, tier: string, traits: string }[]} the catalogue: the Legendaries' hats, the materials' colours */
const catalogue = JSON.parse(fs.readFileSync(`${DESIGNS}/data/gnomes.json`, "utf8")).gnomes;
/** A field of a token's traits (format 1's bytes: docs/gnomes/design.md, "The trait encoding"). */
const field = (/** @type {string} */ traits, /** @type {number} */ f) => parseInt(traits.slice(2 * f, 2 * f + 2), 16);
const F_HAT = 6, F_BODY = 11, F_MATERIAL = 21, F_MATERIAL_COLOUR = 22, F_PROP = 27;

// ---------------------------------------------------------------- the traits
//
// Each against the plain gnome in the cone hat, beardless: what it adds.
const PLAIN = { beard: "none" };
/** @type {string[]} the eyes' meshes: their colour is the slot E */
const eyes = [];
const S0 = await render(PLAIN);
/** The look's meshes that are base's, by where they stand whatever their colour or surface (a material redresses them). */
const place = (/** @type {import("./extract.mjs").Mesh} */ m) => [m.position.length, m.at.map((e) => e.map((v) => v.toFixed(3)).join(",")).join(";")].join("|");
/** What traits t add to base, as shapes, within ART_BUDGET. */
async function art(/** @type {Record<string, unknown>} */ t, base = S0, extra = {}) {
  const d = await render({ ...PLAIN, ...extra, ...t });
  let out = "";
  for (coarse = 1; coarse < 3; coarse *= 1.25) if ((out = (await shapesOf(d, added(d, base))).join("|")).length <= ART_BUDGET) break;
  coarse = 1;
  return out;
}

// the eyes are a slot of their own (E): ink, or lit on lava
const DARK = 0x2a2433;
const litEye = (await page.meshes(await skin({ ...PLAIN, body: DARK, material: "lava", hatColour: SET_A.H })))
  .find((m) => m.type === "MeshBasicMaterial" && Math.abs(m.at[0][12]) > 0.1);
if (!litEye) throw new Error("portrait: no lit eyes on lava");
const isEye = (/** @type {import("./extract.mjs").Mesh} */ m) =>
  m.color === INK && m.position.length === litEye.position.length && Math.abs(m.at[0][13] - litEye.at[0][13]) < 1e-3 && Math.abs(m.at[0][14] - litEye.at[0][14]) < 1e-3;
if (S0.A.filter(isEye).length !== 2) throw new Error("portrait: the eyes not found");
eyes.push(...S0.A.filter(isEye).map(sig));

// the core: the body, the eyes, the nose (what every hat leaves)
const straw = await render({ ...PLAIN, hat: "straw" });
const strawSigs = new Set(straw.A.map(sig));
const core = S0.A.map((m, i) => (strawSigs.has(sig(m)) ? i : -1)).filter((i) => i >= 0);
const coreSigs = new Set(core.map((i) => sig(S0.A[i])));
const coreArt = (await shapesOf(S0, core, { body: true })).join("|");

// on a body too dark for ink eyes: a white round behind each (lava lights them instead)
const dark = await render(PLAIN, false, { body: DARK });
const whites = (await shapesOf(dark, added(dark, S0).filter((i) => i !== 0))).join("|");

/**
 * Where a part on the hat stands, for each hat (its art drawn on the cone):
 * how far its mesh moves from the cone's, in units, and how much nearer
 * (its depth key's change), "dx,dy,dk" a hat.
 * @param {Record<string, unknown>} t the part @param {(m: import("./extract.mjs").Mesh) => boolean} is its probe mesh
 */
async function shifts(t, is) {
  const at = async (/** @type {string} */ hat) => {
    const base = await render({ ...PLAIN, hat }), d = await render({ ...PLAIN, hat, ...t });
    const m = added(d, base).map((i) => d.A[i]).find(is);
    if (!m) throw new Error(`portrait: ${JSON.stringify(t)} not found on ${hat}`);
    const e = m.at[0], p = /** @type {[number, number, number]} */ ([e[12], e[13], e[14]]);
    return [...toUnits(p), keyOf(project(p)[2])];
  };
  const cone = await at("cone"), out = [];
  for (const h of vocab.HATS) {
    const p = await at(h);
    out.push(p.map((v, i) => Math.round(v - cone[i])).join(","));
  }
  return out.join(" ");
}
const firstInked = (/** @type {import("./extract.mjs").Mesh} */ m) => !!m.ink;
const SHIFT = {
  top: await shifts({ prop: "acorn" }, firstInked),
  pom: await shifts({ accessories: ["pompom"] }, firstInked),
  lamp: await shifts({ accessories: ["lamp"] }, firstInked),
};
/** Which shift table a part follows (its art's first character): ^ the hat's top, * a pompom's, % a headlamp's. */
const MOVES = { pompom: "*", lamp: "%" };

const tables = /** @type {Record<string, string[]>} */ ({});
async function table(/** @type {string} */ name, /** @type {readonly string[]} */ codes, /** @type {(c: string, i: number) => Promise<string>} */ f) {
  tables[name] = [];
  for (let i = 0; i < codes.length; i++) tables[name].push(await f(codes[i], i));
  console.log(`${name}: ${codes.length}, ${tables[name].reduce((n, s) => n + s.length, 0)} bytes`);
}
// a hat is everything of his that is not the core
await table("hats", vocab.HATS, async (h) => {
  const d = await render({ ...PLAIN, hat: h });
  return (await shapesOf(d, d.A.map((_, i) => i).filter((i) => !coreSigs.has(sig(d.A[i]))))).join("|");
});
await table("beards", vocab.BEARDS, (b) => art({ beard: b }));
await table("wear", vocab.ACCESSORIES, async (a) => (MOVES[/** @type {keyof MOVES} */ (a)] ?? "") + (await art({ accessories: [a] })));
await table("pieces", vocab.PIECES, async (p) => (p ? art({ piece: p }) : ""));
// a pattern: the body's marks alone (the body itself is the core's)
await table("patterns", vocab.PATTERNS, async (p) => {
  if (p === "plain") return "";
  const d = await render({ ...PLAIN, pattern: p });
  return (await shapesOf(d, [0], { body: true })).filter((s) => s[2] === "m").join("|");
});
// a material: the body as it makes it ("!": in place of the core's), and what it adds (a metal band, a glint);
// the parts it redresses (the hat, a prop) keep their toon art
await table("materials", vocab.MATERIALS, async (m) => {
  if (m === "toon") return "";
  const d = await render({ ...PLAIN, material: m });
  const was = new Set(S0.A.map(place));
  const extra = added(d, S0).filter((i) => i !== 0 && !was.has(place(d.A[i])));
  return "!" + [...(await shapesOf(await realBody(m), [0], { body: true })), ...(await shapesOf(d, extra))].join("|");
});
/**
 * The body a material makes, drawn in the colours of the first gnome of the
 * catalogue made of it: its marks are seeded from its colours (lava's
 * cracks, stone's speckle), so a drawing in other colours has others.
 */
async function realBody(/** @type {string} */ m) {
  const code = vocab.MATERIALS.indexOf(m);
  const g = catalogue.find((x) => field(x.traits, F_MATERIAL) === code);
  const colour = (/** @type {number} */ f) => { const c = g ? field(g.traits, f) : 255; return c < vocab.COLOURS.length ? vocab.COLOURS[c][1] : null; };
  const body = colour(F_BODY) ?? 0xfdf6e9, detail = colour(F_MATERIAL_COLOUR) ?? 0xffffff;
  const meshes = await page.meshes(await skin({ ...PLAIN, material: m, body, materialColour: detail, hatColour: SET_A.H }));
  /** @type {Drawn} */
  const d = { A: meshes, B: meshes, U: meshes, real: { B: [body, "fdf6e9"], M: [detail, "ffffff"] } };
  return d;
}
// a prop: on the cone ("^" if it stands on the hat's top); a Legendary's piece on his own hat
const legendHat = new Map(catalogue
  .filter((/** @type {{ tier: string }} */ g) => g.tier === "legendary")
  .map((/** @type {{ traits: string }} */ g) => [vocab.PROPS[field(g.traits, F_PROP)], vocab.HATS[field(g.traits, F_HAT)]]));
await table("props", vocab.PROPS, async (p) => {
  if (!p) return "";
  if (PROP_AT[p] === "legend") {
    const hat = legendHat.get(p) ?? "cone", base = await render({ ...PLAIN, hat });
    return art({ prop: p }, base, { hat });
  }
  return (PROP_AT[p] === "top" ? "^" : "") + (await art({ prop: p }));
});
// a trail: on the ground behind him, drawn before him
await table("trails", vocab.TRAILS, async (t) => {
  if (!t) return "";
  const d = await render({ ...PLAIN, trail: t }, true);
  return (await shapesOf(d, d.A.map((_, i) => i), { ground: true })).join("|");
});

// ---------------------------------------------------------------- the frame
//
// The thumbnails' ground: a disc of the tier's plinth colour under him,
// ringed once for a Rare, twice for an Epic or a Legendary, rayed for a
// Legendary (gnome-showcase.ts), and his shadow (makeBall's shade).
/** A circle on the ground, as an ellipse: "cx cy rx ry". */
const ellipse = (/** @type {number} */ r, y = 0.001) => {
  const pts = Array.from({ length: 72 }, (_, k) => toUnits([Math.cos((k / 72) * Math.PI * 2) * r, y, Math.sin((k / 72) * Math.PI * 2) * r]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const f = (/** @type {number} */ v) => Math.round(v * 2) / 2;
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2].map(f).join(" ");
};
// (each a narrow plate on the ground, as raster rings for pathOf: only what is in the picture)
const rays = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * Math.PI * 2, [s, c] = [Math.sin(a), Math.cos(a)];
  return [[-0.025, -0.13], [0.025, -0.13], [0.025, 0.13], [-0.025, 0.13]].map(([u, v]) => project([s * (1.16 + v) + c * u, 0.002, c * (1.16 + v) - s * u]).slice(0, 2));
}).filter((q) => q.some(([x, y]) => x >= 0 && y >= 0 && x <= N && y <= N));
const frame = {
  plinth: ellipse(0.72),
  rings: [ellipse(0.805), ellipse(0.905)],
  ringWidth: Math.round(unitsAt(0.05, 4.9) * 2) / 2,
  shade: ellipse(0.55, 0.011),
  rays: pathOf(rays),
};

// ---------------------------------------------------------------- art.gno
const quote = (/** @type {string} */ s) => {
  if (s.includes("`")) throw new Error("portrait: a backquote in the art");
  return "`" + s + "`";
};
/**
 * A table as a function of its code (a switch: a read builds the one line it
 * takes, never the table) and its count.
 * @param {string} name @param {string} what @param {string[]} t
 */
const switchOf = (name, what, t) => `// ${name} is the art of ${what} k, "" for none; ${name}N is how many codes it has.
func ${name}(k int) string {
	switch k {
${t.map((line, k) => (line ? `\tcase ${k}:\n\t\treturn ${quote(line)}\n` : "")).join("")}\t}
	return ""
}

const ${name}N = ${t.length}
`;
const look = (/** @type {Record<string, { frame: number, ground: number, plinth: number }>} */ L) =>
  vocab.TIERS.map((/** @type {string} */ t) => [L[t].ground, L[t].plinth, L[t].frame].map(hex).join("")).join("");
const litSlot = (/** @type {number} */ i) => Math.round(LIT_SRGB[i] * 256);
const gno = `// Code generated by media/gnomes/portrait/build.mjs from the client's gnome; DO NOT EDIT.

package gnomes

// The portrait's art (svg.gno draws with it): every trait of format 1 as
// the game draws it, traced from the thumbnails' camera. A table is a
// function of a code, in its vocab's order (docs/gnomes/design.md, "The
// trait encoding"); its art is shapes split by "|", each
// "<key><kind><colour>:<path>" (svg.gno, "Shapes"). Append only, as the
// vocab is.

// artPalette is the collection's colours by code, six hex digits each;
// artDark a "1" for each too dark for ink eyes (OKLab L under 0.55).
const (
	artPalette = "${vocab.COLOURS.map((/** @type {[string, number]} */ [, v]) => hex(v)).join("")}"
	artDark    = "${vocab.DARK.map((/** @type {boolean} */ d) => (d ? "1" : "0")).join("")}"
)

// litR, litG, litB turn a colour into its fill under the game's light (a
// lit top), in 256ths; artLitEye is an eye lit on lava; artInkWidth the
// gnome's ink line, in tenths of a unit; artSize the picture's side, in
// units; artLight the toon bands' overlays (.d and .e darker, .l a polished
// thing's shine).
const (
	litR        = ${litSlot(0)}
	litG        = ${litSlot(1)}
	litB        = ${litSlot(2)}
	artLitEye   = "${hex(litEye.color)}"
	artInkWidth = ${Math.round(INK_UNITS * 10)}
	artSize     = "${SIZE}"
	artLight    = ".d{opacity:${OVERLAY[0]}}.e{opacity:${OVERLAY[1]}}.l{fill:#fff;opacity:.4}"
)

// artTiers is each tier's ground, plinth and frame colours (TIER_LOOK), in
// the order of the format's tier codes; the frame's shapes are the
// thumbnails' ground: "cx cy rx ry" ellipses, the rays a path.
const (
	artTiers     = "${look(vocab.TIER_LOOK)}"
	artPlinth    = "${frame.plinth}"
	artRing1     = "${frame.rings[0]}"
	artRing2     = "${frame.rings[1]}"
	artRingWidth = "${frame.ringWidth}"
	artShade     = "${frame.shade}"
	artRays      = "${frame.rays}"
)

// How a part on the hat moves with it, "dx,dy,dk" a hat code (its move and
// its depth key's): ^ an Epic's prop on the hat's top, * a pompom, % a headlamp.
const (
	artShiftTop  = "${SHIFT.top}"
	artShiftPom  = "${SHIFT.pom}"
	artShiftLamp = "${SHIFT.lamp}"
)

// The earned nine's looks, by kind - 1: GNOMES' own gnomes as format 1
// writes every field of them.
${switchOf("artEarned", "earned kind k + 1's look", await page.page("earned"))}
// The gnome every look starts from: his body, eyes and nose; the white
// rounds behind his eyes on a dark body.
const (
	artCore   = ${quote(coreArt)}
	artWhites = ${quote(whites)}
)

${switchOf("artHats", "hat", tables.hats)}
${switchOf("artBeards", "beard", tables.beards)}
${switchOf("artWear", "the thing worn of bit", tables.wear)}
${switchOf("artPieces", "piece", tables.pieces)}
${switchOf("artPatterns", "pattern", tables.patterns)}
${switchOf("artMaterials", "material", tables.materials)}
${switchOf("artProps", "prop", tables.props)}
${switchOf("artTrails", "trail", tables.trails)}`;
page.kill();
if (check) {
  if (fs.readFileSync(OUT, "utf8") !== gno) (console.error("art.gno is not what build.mjs writes: run it"), process.exit(1));
  console.log("art.gno is up to date");
} else {
  fs.writeFileSync(OUT, gno);
  console.log(`art.gno: ${gno.length} bytes`);
}
process.exit(0);
