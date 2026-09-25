// The bake: every static mesh under a root merged into one mesh per
// material kind (a few dozen draw calls for a whole course), and the weather
// looks of the decor. Its own module, on materials.js alone, so the course,
// the worlds and the gnome picker share it without importing each other.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { plantFeet } from "./materials.js";

/**
 * Merges everything that does not move into one mesh per material — the look
 * is the same, the draw calls go from a thousand or so to a few dozen. What
 * moves (marked live), what carries a texture, lines and sprites are left as
 * they are. Geometry is baked in the course's own space, so the merged meshes
 * need no transform, and the wind shader reads the same world heights.
 */
// a stable id per shader hook function, for the bake signature (two hooks
// with the same source text are not the same shader if they close over
// different uniforms)
const hookIds = new WeakMap();
let nextHook = 1;
const hookId = (f) => (f ? (hookIds.has(f) || hookIds.set(f, nextHook++), hookIds.get(f)) : 0);

/** Merges every static mesh under root into one mesh per material kind (see
 *  the signature below). The one merge helper: worlds use it too. With a
 *  board (the Low tier), the outlines of what stands over INK_OFF units off
 *  it are left out. local: merged in root's own frame, so a group that moves
 *  as one (a boat, a chair lift, the tram) can go on moving; returns root. */
const INK_OFF = 10, _c = new THREE.Vector3();
export function bake(root, { board = null, local = false } = {}) {
  if (local) {
    // out of its parent and back to the identity while it merges, then put back as it was set
    root.updateMatrix(); // its position as set, not as last rendered
    const m = root.matrix.clone(), parent = root.parent;
    if (parent) parent.remove(root);
    root.matrix.identity();
    root.matrix.decompose(root.position, root.quaternion, root.scale);
    bake(root, { board });
    m.decompose(root.position, root.quaternion, root.scale);
    if (parent) parent.add(root);
    return root;
  }
  plantFeet(root); // what sways is weighed from its own foot (before its geometry is merged)
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const taken = [];
  const isLive = (o) => {
    for (let p = o; p && p !== root; p = p.parent) if (p.userData && (p.userData.live || p.userData.isFlag)) return true;
    return false;
  };
  // materials that draw the same are one bucket, not one per material object:
  // flat(color, opts) makes a fresh material each call, and each was a draw
  // call of its own. (Only meshes that never change are here: nothing mutates
  // a baked material afterwards, and none has been rendered yet.)
  // Plain colours go further: a flat-coloured untextured material's colour is
  // written into its pieces' vertices, so every colour of a kind (toon, same
  // side, same shader tweaks) is one draw call. Textured or vertex-coloured
  // ones keep their own bucket.
  const tint = (m) => !m.map && !m.alphaMap && !m.vertexColors && m.color && !m.transparent;
  const sig = (m) => [m.userData.hook || hookId(m.onBeforeCompile), m.userData.maskId || "", m.type, tint(m) ? "tint" : m.color && m.color.getHex(), m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.vertexColors, m.map && m.map.uuid, m.alphaMap && m.alphaMap.uuid, m.gradientMap && m.gradientMap.uuid, m.customProgramCacheKey && m.customProgramCacheKey()].join("|");
  const firstOf = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || isLive(o)) return;
    // a textured piece merges only with others using that same texture, and
    // only if it has the uvs for it
    if ((o.material.map || o.material.alphaMap) && !o.geometry.attributes.uv) return;
    if (board && o.material.userData.hull) {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      _c.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const dx = Math.max(-_c.x, 0, _c.x - board.w), dz = Math.max(-_c.z, 0, _c.z - board.h);
      if (Math.hypot(dx, dz) > INK_OFF) return void taken.push(o); // dropped, not merged
    }
    const k = sig(o.material);
    if (!firstOf.has(k)) firstOf.set(k, o.material);
    const mat = firstOf.get(k);
    // the piece as it stands: merged below straight from its own buffers
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push({ geo: o.geometry, at: o.matrixWorld, color: tint(o.material) ? o.material.color : null });
    taken.push(o);
  });
  for (const o of taken) o.parent.remove(o);
  // what the merge emptied: the groups that held those meshes, walked every
  // frame for nothing (town18 kept 1777 of them) — gone, bottom up
  const prune = (o) => {
    for (let i = o.children.length - 1; i >= 0; i--) prune(o.children[i]);
    if (o !== root && !o.children.length && (o.type === "Group" || o.type === "Object3D") && !isLive(o)) o.parent.remove(o);
  };
  prune(root);
  for (const [material, pieces] of buckets) {
    const merged = mergeInPlace(pieces) || mergeByCopy(pieces);
    if (!merged) continue;

    let m = material;
    if (tint(material)) {
      // one material for all those colours: white, tinted by the vertices
      m = material.clone();
      m.color.set(0xffffff);
      m.vertexColors = true;
      // the clone keeps its shader hooks (sway, hull push) and cache key
      m.onBeforeCompile = material.onBeforeCompile;
      if (material.customProgramCacheKey) m.customProgramCacheKey = material.customProgramCacheKey;
    }
    const mesh = new THREE.Mesh(merged, m);
    mesh.matrixAutoUpdate = false; // baked in place: its own matrix is the identity, for good
    root.add(mesh);
  }
  return root;
}

// One bucket's pieces into one geometry, in the course's space: each piece's
// vertices are moved by its matrix straight into buffers sized once for the
// whole bucket (no copy of each piece, no second copy to merge them). A piece
// without an index gets one, so a bucket of both kinds keeps the shared
// vertices of the indexed ones. The attributes kept are those every piece has;
// a tinted piece's colour is written into its vertices. null for what this
// does not handle (interleaved or morphed buffers, mismatched attributes).
const _n = new THREE.Matrix3();
function mergeInPlace(pieces) {
  const g0 = pieces[0].geo, tinted = !!pieces[0].color;
  const names = Object.keys(g0.attributes).filter((n) => n !== "color" && pieces.every((p) => p.geo.attributes[n]));
  if (!tinted && pieces.every((p) => p.geo.attributes.color)) names.push("color");
  if (!names.includes("position") || names.includes("tangent")) return null;
  let verts = 0, idx = 0;
  const indexed = pieces.some((p) => p.geo.index);
  for (const { geo } of pieces) {
    if (Object.keys(geo.morphAttributes).length) return null;
    for (const n of names) {
      const a = geo.attributes[n], r = (n === "color" && tinted ? null : g0.attributes[n]);
      if (a.isInterleavedBufferAttribute || ((n === "position" || n === "normal") && (a.itemSize !== 3 || !(a.array instanceof Float32Array))) || (r && (a.itemSize !== r.itemSize || a.normalized !== r.normalized || a.array.constructor !== r.array.constructor))) return null;
    }
    verts += geo.attributes.position.count;
    idx += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const out = new THREE.BufferGeometry(), arrays = {};
  for (const n of names) {
    const r = n === "color" && tinted ? null : g0.attributes[n], size = r ? r.itemSize : 3;
    arrays[n] = new (r ? r.array.constructor : Float32Array)(verts * size);
    out.setAttribute(n, new THREE.BufferAttribute(arrays[n], size, r ? r.normalized : false));
  }
  if (tinted && !arrays.color) {
    arrays.color = new Float32Array(verts * 3);
    out.setAttribute("color", new THREE.BufferAttribute(arrays.color, 3));
  }
  const index = indexed ? new (verts > 65535 ? Uint32Array : Uint16Array)(idx) : null;
  let v0 = 0, i0 = 0;
  for (const { geo, at, color } of pieces) {
    const n = geo.attributes.position.count, e = at.elements;
    for (const name in arrays) {
      const dst = arrays[name];
      if (name === "color" && color) {
        for (let i = 0, o = v0 * 3; i < n; i++, o += 3) (dst[o] = color.r), (dst[o + 1] = color.g), (dst[o + 2] = color.b);
        continue;
      }
      const a = geo.attributes[name], src = a.array, size = a.itemSize;
      if (name === "position") {
        for (let i = 0, o = v0 * 3; i < n; i++, o += 3) {
          const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
          dst[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
          dst[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          dst[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
      } else if (name === "normal") {
        const m = _n.getNormalMatrix(at).elements;
        for (let i = 0, o = v0 * 3; i < n; i++, o += 3) {
          const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
          const nx = m[0] * x + m[3] * y + m[6] * z, ny = m[1] * x + m[4] * y + m[7] * z, nz = m[2] * x + m[5] * y + m[8] * z;
          const l = Math.hypot(nx, ny, nz) || 1;
          (dst[o] = nx / l), (dst[o + 1] = ny / l), (dst[o + 2] = nz / l);
        }
      } else if (src.length === n * size) dst.set(src, v0 * size);
      else for (let i = 0; i < n * size; i++) dst[v0 * size + i] = src[i];
    }
    if (index) {
      if (geo.index) {
        const s = geo.index.array;
        for (let k = 0; k < geo.index.count; k++) index[i0 + k] = s[k] + v0;
        i0 += geo.index.count;
      } else for (let k = 0; k < n; k++) index[i0++] = v0 + k;
    }
    v0 += n;
  }
  if (index) out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}
// the old way, for what mergeInPlace declines: copy, move, merge
function mergeByCopy(pieces) {
  const geos = pieces.map(({ geo, at, color }) => {
    const g = geo.clone().applyMatrix4(at);
    if (color) {
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) (col[i * 3] = color.r), (col[i * 3 + 1] = color.g), (col[i * 3 + 2] = color.b);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    }
    return g;
  });
  // mergeGeometries wants all indexed or none, and the same attributes
  const mixed = geos.some((g) => g.index) && geos.some((g) => !g.index);
  const list = mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
  const names = Object.keys(list[0].attributes).filter((n) => list.every((g) => g.attributes[n]));
  for (const g of list) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  const merged = mergeGeometries(list);
  geos.forEach((g) => g.dispose());
  if (mixed) list.forEach((g) => g.dispose());
  return merged;
}

/**
 * A world's decor dressed for the weather. Its builders tag the parts that
 * change with userData.look = [the looks they show in]; looks are one of
 * "clear", "wind", "wet" (or a world's own). Each look's parts are gathered
 * into one group, merged by material (a few draw calls) and kept out of the
 * hole's bake; root.userData.weather(w) then shows the look pick(w) names,
 * w being the engine's weather ({ wind, rain, fog, storm, snow } | null).
 * A part in two looks is copied, so only one group ever draws.
 */
/** Tags a decor part with the looks it shows in (see weatherLooks); returns it. */
export const look = (o, ...looks) => ((o.userData.look = looks), o);
export function weatherLooks(root, pick) {
  root.updateMatrixWorld(true);
  const tagged = [];
  root.traverse((o) => o.userData.look && tagged.push(o));
  const looks = {};
  for (const o of tagged)
    o.userData.look.forEach((k, i) => (looks[k] ||= new THREE.Group()).attach(i ? o.clone() : o));
  for (const [k, grp] of Object.entries(looks)) (root.add(grp), bake(grp), (grp.userData.live = true), (grp.name = "look:" + k));
  const show = (w) => { const on = pick(w || {}); for (const k in looks) looks[k].visible = k === on; };
  show(null);
  root.userData.weather = show;
}
