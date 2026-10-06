// A gnome's look, written down: what makeBall builds from a token's traits,
// read back as a record a golden file can hold (data/gnomes/looks.golden.json,
// docs/gnomes/design.md "Permanence"). Its parts: how many meshes and
// vertices, the body's box, every material (kind, colour, side, opacity, and
// what its texture's canvas was told to draw), the trail, holing and
// Legendary piece, and a hash of every vertex, index, placement and texture.
import "./canvas.mjs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeBall, type Skin } from "../lib/scene/gnome.ts";
import { makeHoling, makeTrail } from "../lib/scene/gnome-fx.ts";

const r3 = (x: number) => Math.round(x * 1e3) / 1e3;
/** What a texture's canvas was drawn with (test/canvas.mjs), hashed; "" for none. */
const drawnOf = (t: THREE.Texture | null | undefined) => {
  const log = (t?.image as { __log?: string[] } | undefined)?.__log;
  return log ? createHash("sha256").update(log.join("\n")).digest("hex").slice(0, 8) : "";
};
const materialOf = (m: THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; emissive?: THREE.Color; emissiveMap?: THREE.Texture | null }) =>
  [m.type, m.color ? m.color.getHexString() : "", m.emissive ? m.emissive.getHexString() : "", m.side, r3(m.opacity), m.transparent ? "t" : "", drawnOf(m.map), drawnOf(m.emissiveMap)].join(":");
/** An effect's meshes: their kind, vertex count and material, nothing of where its random throw put them. */
const effectOf = (o: THREE.Object3D | undefined) => {
  const out: string[] = [];
  o?.traverse((d) => d instanceof THREE.Mesh && out.push(`${d.type}:${(d.geometry as THREE.BufferGeometry).attributes.position.count}:${materialOf(d.material as THREE.Material)}`));
  return out;
};

/** A gnome's look record. */
export function lookRecord(skin: Skin) {
  const g = makeBall(skin);
  g.updateMatrixWorld(true);
  const h = createHash("sha256"), materials = new Set<string>();
  let meshes = 0, vertices = 0;
  g.traverse((d) => {
    if (!(d instanceof THREE.Mesh || d instanceof THREE.Sprite || d instanceof THREE.Line)) return;
    meshes++;
    const geo = d.geometry as THREE.BufferGeometry, m = d.material as THREE.Material;
    vertices += geo.attributes.position.count;
    materials.add(materialOf(m));
    h.update(`${d.type}|${d.visible}|${d.renderOrder}|${d.matrixWorld.elements.map(r3).join(",")}|${materialOf(m)}`);
    for (const k of Object.keys(geo.attributes).sort()) h.update(k + Array.from(geo.attributes[k].array as ArrayLike<number>, r3).join(","));
    if (geo.index) h.update("i" + Array.from(geo.index.array).join(","));
    if (d instanceof THREE.InstancedMesh) h.update("n" + Array.from(d.instanceMatrix.array, r3).join(","));
  });
  const box = new THREE.Box3().setFromObject(g.userData.body, true);
  const holing = makeHoling(skin, new THREE.Vector3());
  return {
    meshes, vertices,
    box: [...box.min.toArray(), ...box.max.toArray()].map(r3),
    materials: [...materials].sort(),
    trail: [skin.trail ?? "", ...effectOf(makeTrail(skin)?.group)],
    holing: [skin.holing ?? "confetti", ...effectOf(holing?.group)],
    piece: skin.prop ?? "",
    moves: !!g.userData.tick,
    hash: h.digest("hex").slice(0, 16),
  };
}
export type LookRecord = ReturnType<typeof lookRecord>;
