// The gnome as makeBall builds it, checked without a GPU: the fourteen of
// GNOMES look as they always did (a fingerprint of every vertex, colour and
// material they are drawn with), whatever traits the collection adds; every
// gnome of the collection holds to its tier's budget, fades as a ghost, and
// his trail and holing run their course.
import "./canvas.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as THREE from "three";
import { GNOMES, makeBall, makeGhost, type Skin } from "../lib/scene/gnome.ts";
import { makeHoling, makeTrail } from "../lib/scene/gnome-fx.ts";
import "../lib/scene/gnome-wardrobe.ts";
import { BUDGET, MAX_REACH } from "../lib/gnomes/validate.ts";
import type { Catalogue } from "../lib/gnomes/catalogue.ts";
import { costOf } from "../lib/scene/gnome-cost.ts";
import { kitPiece } from "../lib/scene/gnome-kit.ts";

/** Every drawn thing under a gnome, in order: its kind, geometry and material, rounded. */
export function fingerprint(o: THREE.Object3D) {
  const h = createHash("sha256");
  const r = (x: number) => Math.round(x * 1e4);
  o.updateMatrixWorld(true);
  o.traverse((d) => {
    if (!(d instanceof THREE.Mesh || d instanceof THREE.Sprite || d instanceof THREE.Line)) return;
    h.update(d.type + "|" + d.matrixWorld.elements.map(r).join(","));
    const g = d.geometry as THREE.BufferGeometry;
    for (const k of Object.keys(g.attributes).sort()) h.update(k + Array.from(g.attributes[k].array as ArrayLike<number>, r).join(","));
    if (g.index) h.update("i" + Array.from(g.index.array).join(","));
    const m = d.material as THREE.Material & { color?: THREE.Color; side?: number };
    h.update(`${m.type}|${m.color ? m.color.getHex() : ""}|${m.side}|${m.transparent}|${m.opacity}`);
  });
  return h.digest("hex").slice(0, 16);
}

// taken before the collection's traits were added (2026-10-06): a change here is a change of look
const LOOKS: Record<string, string> = {
  classic: "5107453041f812eb", sage: "f52a0284a44f588e", ginger: "30ba6c5d8de50607", moustache: "60e27e2f4f2e8f07",
  gardener: "c3fa3c546fbe0016", wizard: "bd0ce8886352c26b", viking: "7be544b80b021759", golden: "361d69a04833ff8a",
  pirate: "31351a6e42bacd95", diver: "e1e61ca11033da81", baker: "f548b1020bd4fa7c", mayor: "66997a595461c0cd",
  king: "f59bee17a46d5dd8", miner: "e827916f1475be2a",
};

test("the fourteen gnomes of GNOMES are drawn exactly as before", () => {
  assert.deepEqual(Object.fromEntries(GNOMES.map((s) => [s.id, fingerprint(makeBall(s))])), LOOKS);
});


const catalogue = JSON.parse(fs.readFileSync(new URL("../../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;

test("every gnome of the collection builds, within his tier's budget, no taller nor wider than the game allows", () => {
  const most = GNOMES.map((s) => costOf(makeBall(s)));
  const top = Math.max(...most.map((c) => c.top)), reach = Math.max(...most.map((c) => c.reach));
  const worst: Record<string, { tris: number; draws: number; id: number }> = {};
  for (const e of catalogue.gnomes) {
    const c = costOf(makeBall(e.skin)), b = BUDGET[e.tier];
    assert.ok(c.tris <= b.tris, `#${e.id} ${e.name}: ${c.tris} triangles, over ${b.tris}`);
    assert.ok(c.draws <= b.draws, `#${e.id} ${e.name}: ${c.draws} draws, over ${b.draws}`);
    assert.ok(c.top <= top + 1e-6, `#${e.id} ${e.name}: ${c.top.toFixed(3)} high, over the tall hat's ${top.toFixed(3)}`);
    assert.ok(c.reach <= reach * MAX_REACH, `#${e.id} ${e.name}: reaches ${c.reach.toFixed(3)}, over ${(reach * MAX_REACH).toFixed(3)}`);
    if (!worst[e.tier] || c.tris > worst[e.tier].tris) worst[e.tier] = { tris: c.tris, draws: c.draws, id: e.id };
  }
  console.log("the heaviest of each tier:", JSON.stringify(worst));
});

test("a gnome of the collection as a ghost: his own materials, fadeable, no trail or glow of his", () => {
  for (const e of catalogue.gnomes.filter((g) => g.tier === "epic" || g.tier === "legendary")) {
    const { ball, fade } = makeGhost(0.55, e.skin);
    fade(0.3);
    ball.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      const m = o.material as THREE.Material;
      assert.ok(m.transparent || m.side === THREE.BackSide || m.type === "MeshBasicMaterial", `#${e.id}: ${m.type} not faded`);
    });
  }
});

/** What is drawn, as it is now: every drawn mesh's place and instances, and its material's glow. */
const drawnNow = (g: THREE.Object3D) => {
  const out: string[] = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const m = o.material as THREE.MeshToonMaterial;
    out.push(o.matrixWorld.elements.map((v) => v.toFixed(3)).join(",") + "|" + (m.emissiveIntensity ?? "") + (o instanceof THREE.InstancedMesh ? "|" + Array.from(o.instanceMatrix.array, (v) => v.toFixed(3)).join(",") : ""));
  });
  return out;
};

test("a gnome's tick changes what is drawn (a Legendary's piece, a glow), and is there only when something moves", () => {
  for (const e of catalogue.gnomes.filter((g) => g.tier === "legendary" || g.skin.material === "lava")) {
    const g = makeBall(e.skin);
    assert.ok(g.userData.tick, `#${e.id} has a motion`);
    const before = drawnNow(g);
    g.userData.tick?.(1234);
    assert.notDeepEqual(drawnNow(g), before, `#${e.id} ${e.name}: his tick moves nothing drawn`);
  }
  assert.equal(makeBall(catalogue.gnomes[0].skin).userData.tick, undefined);
});

test("the Ancient Mushroom's spots breathe: the glow drawn is the glow the tick changes", () => {
  const e = catalogue.gnomes.find((g) => g.skin.prop === "fairy-ring")!, g = makeBall(e.skin);
  const glows = () => {
    const out: number[] = [];
    g.traverse((o) => o instanceof THREE.Mesh && (o.material as THREE.MeshToonMaterial).emissiveIntensity > 0 && out.push((o.material as THREE.MeshToonMaterial).emissiveIntensity));
    return out;
  };
  g.userData.tick?.(0);
  const at0 = glows();
  g.userData.tick?.(1250); // (a quarter of the breath's 800 ms × 2π later)
  assert.ok(at0.length > 0);
  assert.notDeepEqual(glows(), at0);
});

test("a metal gnome's parts merge into one draw, so none may glow in another's colour: the glow drawn is the same whatever part comes first", () => {
  const glows = (skin: Skin) => {
    const out = new Set<number>();
    makeBall(skin).traverse((o) => {
      const m = o instanceof THREE.Mesh ? (o.material as THREE.MeshToonMaterial) : null;
      if (m && m.type === "MeshToonMaterial" && m.emissive) out.add(m.emissive.getHex());
    });
    return [...out].sort();
  };
  for (const e of catalogue.gnomes.filter((g) => g.skin.material === "metal" && g.skin.body !== undefined && g.skin.body !== g.skin.hat))
    assert.deepEqual(glows({ ...e.skin, hat: e.skin.body!, body: e.skin.hat }), glows(e.skin), `#${e.id} ${e.name}`);
});

test("earmuffs: a muff on each ear, the band over the head from one to the other (not front to back)", () => {
  const g = new THREE.Group(), hat = new THREE.Group();
  kitPiece(g, hat, { ...GNOMES[0], piece: "earmuffs" });
  g.updateMatrixWorld(true);
  const band = g.children.find((o): o is THREE.Mesh => o instanceof THREE.Mesh && (o.geometry as THREE.BufferGeometry).type === "TorusGeometry")!;
  const box = new THREE.Box3().setFromObject(band);
  assert.ok(box.max.x - box.min.x > 1, `the band spans ${(box.max.x - box.min.x).toFixed(2)} across, ear to ear`);
  assert.ok(box.max.z - box.min.z < 0.2, `and ${(box.max.z - box.min.z).toFixed(2)} front to back`);
  assert.ok(box.max.y > 0.6, "over the top of the head");
});

test("trails and holings: every kind the collection uses is made and runs to its end", () => {
  const kinds = new Map<string, Skin>();
  for (const e of catalogue.gnomes) {
    if (e.skin.trail) kinds.set("t" + e.skin.trail, e.skin);
    if (e.skin.holing) kinds.set("h" + e.skin.holing, e.skin);
  }
  for (const [k, skin] of kinds) {
    if (k.startsWith("t")) {
      const t = makeTrail(skin)!;
      assert.ok(t, k);
      for (let i = 0; i < 20; i++) t.push(new THREE.Vector3(i * 0.1, 0, 0), i * 0.03), t.step(i * 0.03);
      t.step(10);
      t.clear();
    } else {
      const h = makeHoling(skin, new THREE.Vector3())!;
      assert.ok(h, k);
      let n = 0;
      while (h.step(0.05)) assert.ok(++n < 40, `${k} ends within 2 s`);
    }
  }
  assert.equal(makeTrail(GNOMES[0]), null);
  assert.equal(makeHoling(GNOMES[0], new THREE.Vector3()), null);
});
