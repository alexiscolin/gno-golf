// The bake: every static mesh under a root merged into one mesh per
// material kind (a few dozen draw calls for a whole course), and the weather
// looks of the decor. Its own module, on materials.ts alone, so the course,
// the worlds and the gnome picker share it without importing each other.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { plantFeet } from "./materials";
import { ud, md, type Dress } from "./data";
import type { Board } from "../types";
import type { WeatherNow } from "./weather";

/**
 * Merges everything that does not move into one mesh per material — the look
 * is the same, the draw calls go from a thousand or so to a few dozen. Lines
 * are batched the same way, as line segments. What moves (marked live), what
 * carries a texture, dashed lines and sprites are left as they are. Geometry
 * is baked in the course's own space, so the merged meshes need no transform,
 * and the wind shader reads the same world heights.
 */
// a stable id per shader hook function, for the bake signature (two hooks
// with the same source text are not the same shader if they close over
// different uniforms)
const hookIds = new WeakMap<object, number>();
let nextHook = 1;
const hookId = (f: object | null | undefined) => {
  if (!f) return 0;
  if (!hookIds.has(f)) hookIds.set(f, nextHook++);
  return hookIds.get(f)!;
};

/** Merges every static mesh under root into one mesh per material kind (see
 *  the signature below). The one merge helper: worlds use it too. With a
 *  board (the Low tier), the outlines of what stands over INK_OFF units off
 *  it are left out. local: merged in root's own frame, so a group that moves
 *  as one (a boat, a chair lift, the tram) can go on moving; returns root. */
const INK_OFF = 4, _c = new THREE.Vector3();
/** A material as the bake reads it: any of three's, with the fields some kinds have. */
type Mat = THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null; color?: THREE.Color; gradientMap?: THREE.Texture | null };
/** One mesh to merge: its geometry, where it stands, and its colour when tinted in. */
interface Piece { geo: THREE.BufferGeometry; at: THREE.Matrix4; color: THREE.Color | null }
export function bake<T extends THREE.Object3D>(root: T, { board = null, local = false }: { board?: Board | null; local?: boolean } = {}): T {
  if (local) {
    // what sways is weighed from its foot in the world, where it stands now
    root.updateWorldMatrix(true, false);
    plantFeet(root);
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
  const buckets = new Map<THREE.Material, Piece[]>();
  const taken: THREE.Object3D[] = [];
  const isLive = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (ud(p).live || ud(p).isFlag) return true;
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
  const tint = (m: Mat) => !m.map && !m.alphaMap && !m.vertexColors && !!m.color && !m.transparent;
  // (a hook is keyed by the function itself: never called from here)
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const sig = (m: Mat) => [md(m).hook || hookId(m.onBeforeCompile), md(m).maskId || "", m.type, tint(m) ? "tint" : m.color && m.color.getHex(), m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.vertexColors, m.map && m.map.uuid, m.alphaMap && m.alphaMap.uuid, m.gradientMap && m.gradientMap.uuid, m.customProgramCacheKey()].join("|");
  const firstOf = new Map<string, Mat>();
  const lineMats = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Line) {
      const line = o as THREE.Line<THREE.BufferGeometry, Mat | Mat[]>, m = line.material, d = line.geometry.drawRange;
      if (Array.isArray(m) || m instanceof THREE.LineDashedMaterial || d.start || d.count !== Infinity || isLive(o)) return;
      const k = "line|" + sig(m);
      if (!firstOf.has(k)) (firstOf.set(k, m), lineMats.add(m));
      const mat = firstOf.get(k)!;
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat)!.push({ geo: segmentsOf(line), at: line.matrixWorld, color: tint(m) ? m.color! : null });
      return void taken.push(o);
    }
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material) || isLive(o)) return;
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, Mat>;
    // a textured piece merges only with others using that same texture, and
    // only if it has the uvs for it
    if ((mesh.material.map || mesh.material.alphaMap) && !mesh.geometry.attributes.uv) return;
    if (board && md(mesh.material).hull) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      _c.copy(mesh.geometry.boundingSphere!.center).applyMatrix4(mesh.matrixWorld);
      const dx = Math.max(-_c.x, 0, _c.x - board.w), dz = Math.max(-_c.z, 0, _c.z - board.h);
      if (Math.hypot(dx, dz) > INK_OFF) return void taken.push(o); // dropped, not merged
    }
    const k = sig(mesh.material);
    if (!firstOf.has(k)) firstOf.set(k, mesh.material);
    const mat = firstOf.get(k)!;
    // the piece as it stands: merged below straight from its own buffers
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat)!.push({ geo: mesh.geometry, at: mesh.matrixWorld, color: tint(mesh.material) ? mesh.material.color! : null });
    taken.push(o);
  });
  for (const o of taken) o.parent!.remove(o);
  // what the merge emptied: the groups that held those meshes, walked every
  // frame for nothing (town18 kept 1777 of them) — gone, bottom up
  const prune = (o: THREE.Object3D) => {
    for (let i = o.children.length - 1; i >= 0; i--) prune(o.children[i]);
    if (o !== root && !o.children.length && (o.type === "Group" || o.type === "Object3D") && !isLive(o)) o.parent!.remove(o);
  };
  prune(root);
  for (const [material, pieces] of buckets) {
    const merged = mergeInPlace(pieces) || mergeByCopy(pieces);
    if (!merged) continue;

    let m = material;
    if (tint(material)) {
      // one material for all those colours: white, tinted by the vertices
      const c = (m = (material as Mat).clone());
      c.color!.set(0xffffff);
      m.vertexColors = true;
      // the clone keeps its shader hooks (sway, hull push) and cache key
      // (three declares the hooks as methods; they are closures, copied as they are)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      m.onBeforeCompile = material.onBeforeCompile;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      m.customProgramCacheKey = material.customProgramCacheKey;
    }
    const mesh = lineMats.has(material) ? new THREE.LineSegments(merged, m) : new THREE.Mesh(merged, m);
    mesh.matrixAutoUpdate = false; // baked in place: its own matrix is the identity, for good
    root.add(mesh);
  }
  return root;
}

// A line of any kind as the pairs of vertices of its segments (an index over
// its own attributes): a strip, a loop and segments then merge as one set
function segmentsOf(o: THREE.Line) {
  const geo = o.geometry, n = geo.index ? geo.index.count : geo.attributes.position.count;
  const at = (i: number) => (geo.index ? geo.index.getX(i) : i);
  if (o instanceof THREE.LineSegments) return geo;
  const idx: number[] = [];
  for (let i = 0; i + 1 < n; i++) idx.push(at(i), at(i + 1));
  if (o instanceof THREE.LineLoop && n > 2) idx.push(at(n - 1), at(0));
  const out = new THREE.BufferGeometry();
  for (const k in geo.attributes) out.setAttribute(k, geo.attributes[k]);
  out.setIndex(idx);
  return out;
}

// One bucket's pieces into one geometry, in the course's space: each piece's
// vertices are moved by its matrix straight into buffers sized once for the
// whole bucket (no copy of each piece, no second copy to merge them). A piece
// without an index gets one, so a bucket of both kinds keeps the shared
// vertices of the indexed ones. The attributes kept are those every piece has;
// a tinted piece's colour is written into its vertices. null for what this
// does not handle (interleaved or morphed buffers, mismatched attributes).
const _n = new THREE.Matrix3();
function mergeInPlace(pieces: readonly Piece[]) {
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
      if (a instanceof THREE.InterleavedBufferAttribute || ((n === "position" || n === "normal") && (a.itemSize !== 3 || !(a.array instanceof Float32Array))) || (r && (a.itemSize !== r.itemSize || a.normalized !== r.normalized || a.array.constructor !== r.array.constructor))) return null;
    }
    verts += geo.attributes.position.count;
    idx += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const out = new THREE.BufferGeometry(), arrays: Record<string, THREE.TypedArray> = {};
  for (const n of names) {
    const r = n === "color" && tinted ? null : (g0.attributes[n] as THREE.BufferAttribute), size = r ? r.itemSize : 3;
    arrays[n] = new ((r ? r.array.constructor : Float32Array) as new (n: number) => THREE.TypedArray)(verts * size);
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
      const a = geo.attributes[name] as THREE.BufferAttribute, src = a.array, size = a.itemSize;
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
function mergeByCopy(pieces: readonly Piece[]) {
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

/** A moving piece's meshes merged in its own frame (one draw per material): it moves as one. */
export const bakeLocal = <T extends THREE.Object3D>(o: T) => bake(o, { local: true });

/** Tags a decor part with the looks it shows in (see weatherLooks); returns it. */
export const look = <T extends THREE.Object3D>(o: T, ...looks: string[]) => ((ud(o).look = looks), o);
/**
 * A world's decor dressed for the weather. Its builders tag the parts that
 * change with userData.look = [the looks they show in]; looks are one of
 * "clear", "wind", "wet" (or a world's own). Each look's parts are gathered
 * into one group, merged by material (a few draw calls) and kept out of the
 * hole's bake; root.userData.weather(w) then shows the look pick(w) names,
 * w being the engine's weather ({ wind, rain, fog, storm, snow } | null).
 * A part in two looks is copied, so only one group ever draws.
 */
export function weatherLooks(root: THREE.Object3D, pick: (w: Partial<WeatherNow>) => string) {
  root.updateMatrixWorld(true);
  const tagged: THREE.Object3D[] = [];
  root.traverse((o) => { if (ud(o).look) tagged.push(o); });
  const looks: Record<string, THREE.Group> = {};
  for (const o of tagged)
    ud(o).look!.forEach((k, i) => (looks[k] ||= new THREE.Group()).attach(i ? o.clone() : o));
  for (const [k, grp] of Object.entries(looks)) (root.add(grp), bake(grp), (ud(grp).live = true), (grp.name = "look:" + k));
  const show: Dress = (w) => { const on = pick(w || {}); for (const k in looks) looks[k].visible = k === on; };
  show(null);
  ud(root).weather = show;
}
