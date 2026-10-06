// The mines' headlamp clips on any gnome (engine.ts: headlamp(ball) in the
// mines), so it must sit right on every one the collection can put on the
// ball: on his hat's front, above his eyes, against the hat (not floating,
// not buried), with nothing in front of its lens, whatever the hat's shape or
// the Legendary's moving piece. And whoever wears a collection gnome, the
// ball, the clip and a duel's ghost dress him alike (gnomeById, rivalSkin).
import "./canvas.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GNOMES, makeBall, headlamp, gnomeById, rivalSkin, knowGnome, wears } from "../lib/scene/gnome.ts";
import type { Gnome } from "../lib/scene/data.ts";
import { KIT_HATS } from "../lib/scene/gnome-kit.ts";
import { skinOfTraits } from "../lib/gnomes/skin.ts";
import type { Catalogue } from "../lib/gnomes/catalogue.ts";

const catalogue = JSON.parse(fs.readFileSync(new URL("../../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;

/** Where the lamp is and looks, in the gnome's body space, and what is around it. */
function lampCheck(ball: Gnome, t: number) {
  const body = ball.userData.body;
  ball.userData.tick?.(t);
  const glow = headlamp(ball, true)!;
  const lamp = glow.parent!;
  body.updateMatrixWorld(true);
  const inBody = (v: THREE.Vector3) => body.worldToLocal(v.clone());
  const centre = inBody(lamp.getWorldPosition(new THREE.Vector3()));
  const lens = inBody(glow.getWorldPosition(new THREE.Vector3()));
  const ahead = lens.clone().sub(centre).normalize(); // the way the lamp shines
  const solid = (o: THREE.Object3D) => o instanceof THREE.Mesh && !lamp.getObjectById(o.id) && (o.material as THREE.Material).visible !== false &&
    (o.material as THREE.Material & { side?: number }).side !== THREE.BackSide; // (an outline shell is the ink, not a surface)
  const meshes: THREE.Object3D[] = [];
  body.traverse((o) => solid(o) && meshes.push(o));
  const cast = (from: THREE.Vector3, dir: THREE.Vector3, far: number) => {
    const k = body.getWorldScale(new THREE.Vector3()).x; // (the body is scaled to the ball's radius)
    const hit = new THREE.Raycaster(body.localToWorld(from.clone()), dir.clone().transformDirection(body.matrixWorld), 0, far * k).intersectObjects(meshes, false)[0];
    return hit && { distance: hit.distance / k, what: hit.object.name || hit.object.type };
  };
  return {
    centre,
    // behind the housing (half its depth, 0.06): the hat, close
    back: cast(centre, ahead.clone().negate(), 0.2),
    // in front of the lens: nothing for a whole gnome's width
    front: cast(lens.clone().addScaledVector(ahead, 0.01), ahead, 1.2),
  };
}

const EYE_Y = 0.08; // makeBall's eyes, in the body's space

test("the headlamp sits right on every gnome of the collection: on the hat's front, against it, over the eyes, its lens clear", () => {
  const shapes = new Set<string>(), legends = new Set<number>(), tiers = new Set<string>();
  const skins = [
    ...catalogue.gnomes.map((e) => ({ name: `#${e.id} ${e.name}`, skin: e.skin, legend: e.tier === "legendary" ? e.id : 0, tier: e.tier })),
    ...catalogue.earned.map((e) => ({ name: e.name, skin: skinOfTraits(e.traits, { id: `earned:${e.kind}`, name: e.name, line: e.line }), legend: 0, tier: "earned" })),
  ];
  for (const { name, skin, legend, tier } of skins) {
    shapes.add(skin.shape || (skin.tall ? "tall" : skin.helmet ? "helmet" : "cone"));
    if (legend) legends.add(legend);
    tiers.add(tier);
    for (const t of legend ? [0, 0.7, 1.9, 3.3] : [0]) {
      const c = lampCheck(makeBall(skin), t);
      assert.ok(c.centre.z > 0.15, `${name}: the lamp is not on the front (z ${c.centre.z.toFixed(2)})`);
      assert.ok(c.centre.y > EYE_Y + 0.15, `${name}: the lamp is over the eyes, not on them (y ${c.centre.y.toFixed(2)})`);
      assert.ok(c.back && c.back.distance <= 0.12, `${name}: the lamp floats off the hat (${c.back ? c.back.distance.toFixed(2) : "nothing behind it"})`);
      assert.ok(!c.front, `${name} at ${t}s: something stands in front of the lamp (${c.front?.what}, ${c.front?.distance.toFixed(2)} off)`);
    }
  }
  for (const s of [...KIT_HATS, "cone", "tall"]) assert.ok(shapes.has(s), `no gnome of the collection wears the ${s}: the test missed a hat shape`);
  assert.equal(legends.size, 7, "every Legendary");
  assert.deepEqual([...tiers].sort(), ["common", "earned", "epic", "legendary", "rare"]);
});

test("the fourteen gnomes' lamps are where they always were", () => {
  for (const s of GNOMES) {
    const c = lampCheck(makeBall(s), 0);
    assert.ok(c.centre.z > 0.15 && c.centre.y > EYE_Y, s.id);
  }
});

test("a collection gnome worn: the ball, the clip and a duel's ghost all dress him alike", () => {
  const e = catalogue.gnomes.find((x) => x.tier === "epic")!;
  const skin = skinOfTraits(e.traits, { id: `t${e.id}`, name: e.name, line: e.line });
  assert.equal(gnomeById(skin.id).id, "classic", "unknown before it is met: the game's first gnome, never a crash");
  knowGnome(skin);
  // the engine's ball and the clip's both come from gnomeById(the player's gnome id)
  assert.equal(gnomeById(skin.id), skin);
  // a rival who wears him for everyone: their ghost, and their face on the boards
  const rival = "g1" + "r".repeat(38), unworn = rivalSkin(rival, "classic");
  assert.notEqual(unworn, skin);
  wears(rival, skin.id);
  assert.equal(rivalSkin(rival, "classic"), skin, "the ghost wears the rival's gnome");
  assert.equal(rivalSkin(rival, skin.id), skin, "even the very gnome the player wears: it is the rival's own");
  // an earned kind worn is the game's own gnome
  wears(rival, "king");
  assert.equal(rivalSkin(rival, "classic").id, "king");
  wears(rival, null);
  assert.equal(rivalSkin(rival, "classic"), unworn, "nothing worn: the gnome their address picks, as before");
});
