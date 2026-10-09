// The seven Legendaries' own pieces (lib/gnomes/props.ts, the "legend"
// entries): a mesh none of the others wears, and a motion of its own. Each
// moving piece is merged in its own frame (bake local) and left out of the
// gnome's bake (live): a draw or two each, whatever its parts.
import * as THREE from "three";
import { C, flat, inked } from "./materials";
import { bake } from "./bake";
import { ud } from "./data";
import { glowOf } from "./gnome-props";
import { hatTop } from "./gnome-kit";
import type { Skin } from "./gnome";

type Tick = (t: number) => void;
const Q = Math.PI / 2;
/** A small triangle of cloth on a pin. */
const pennant = () => {
  const g = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.2, -0.05, 0, 0, -0.1, 0], 3));
  g.computeVertexNormals();
  return g;
};
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
/** A group that moves as one: merged in its own frame, kept out of the gnome's bake. */
const moving = (parent: THREE.Object3D, ...parts: THREE.Object3D[]) => {
  const grp = new THREE.Group();
  grp.add(...parts);
  parent.add(grp);
  bake(grp, { local: true });
  ud(grp).live = true;
  return grp;
};
/** Small things that move each on their own (smoke, drops, spores): one instanced draw. */
const swarm = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ud(m).live = true;
  parent.add(m);
  const o = new THREE.Object3D();
  /** Sets one of them: where, how big (0: gone). */
  return (k: number, x: number, y: number, z: number, s: number) => {
    o.position.set(x, y, z);
    o.scale.setScalar(Math.max(s, 0.0001));
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
    m.instanceMatrix.needsUpdate = true;
  };
};

const PIECES: Record<string, (g: THREE.Group, hat: THREE.Group, skin: Skin) => Tick> = {
  // Crystal Gnome: shards grown out of his hat, a core in them that glints
  "crystal-cluster": (_, hat, skin) => {
    const m = flat(skin.propColor ?? 0xa184c9);
    // (none on the hat's front: a headlamp clips on there in the mines)
    const shards = [[0.24, -0.14, 0.24, -0.5, 0.2, 0.32], [-0.26, -0.12, 0.2, 0.6, 0.25, 0.26], [-0.12, -0.08, -0.3, 0.2, -0.5, 0.22], [0.32, -0.16, -0.08, -0.7, -0.3, 0.2]].map(([x, y, z, rz, rx, h]) => {
      const s = new THREE.Group();
      s.add(inked(new THREE.CylinderGeometry(0.05, 0.06, h, 6), m), at(inked(new THREE.ConeGeometry(0.05, 0.1, 6), m), 0, h / 2 + 0.05, 0));
      s.rotation.set(rx, 0, rz);
      return at(s, x, y, z);
    });
    hat.add(...shards);
    const core = moving(hat, new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), glowOf(0xffffff)));
    core.position.set(0.24, 0.02, 0.24); // (among the shards on his right: clear of a lamp)
    return (t) => (core.rotation.y = t / 500, core.scale.setScalar(0.8 + 0.3 * Math.abs(Math.sin(t / 900))));
  },
  // Lava Gnome: a little vent on his hat's tip, smoking
  "lava-vent": (_, hat, skin) => {
    const top = hatTop(skin);
    hat.add(at(inked(new THREE.CylinderGeometry(0.06, 0.12, 0.1, 10, 1, true), flat(0x2a2433, { side: THREE.DoubleSide })), 0, top + 0.02, 0));
    hat.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), glowOf(0xff6a2a)), 0, top + 0.06, 0).rotateX(-Q));
    const puff = swarm(hat, new THREE.IcosahedronGeometry(0.07, 1), flat(0x9aa5ab), 3);
    return (t) => {
      for (let k = 0; k < 3; k++) {
        const f = (t / 1600 + k / 3) % 1;
        puff(k, Math.sin(f * 6 + k) * 0.05, top + 0.08 + f * 0.32, 0, 0.5 + f * 1.1 - Math.max(0, f - 0.75) * 4);
      }
    };
  },
  // Storm Gnome: a small thundercloud over his hat, raining, now and then a flash
  thundercloud: (_, hat, skin) => {
    const top = hatTop(skin), grey = flat(0x9aa5ab), dark = flat(0x5c6670);
    const cloud = moving(hat,
      ...[[0, 0, 0, 0.16], [0.15, -0.03, 0.02, 0.12], [-0.15, -0.02, 0, 0.13], [0.06, 0.08, -0.02, 0.12], [-0.05, -0.06, 0.08, 0.1]].map(([x, y, z, r], k) =>
        at(inked(new THREE.SphereGeometry(r, 12, 8), k % 2 ? dark : grey), x, y, z)));
    cloud.position.set(0, top + 0.22, 0.02);
    const bolt = moving(hat, ...[[0, 0, 0.5], [0.03, -0.07, -0.6], [0, -0.14, 0.5]].map(([x, y, r]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.02), glowOf(0xf5e06b));
      b.rotation.z = r;
      return at(b, x, y, 0);
    }));
    bolt.position.set(0.06, top + 0.08, 0.1);
    const drop = swarm(hat, new THREE.CylinderGeometry(0.012, 0.012, 0.06, 4), flat(0x79c0e8), 3);
    return (t) => {
      cloud.position.y = top + 0.22 + Math.sin(t / 600) * 0.02;
      bolt.visible = t % 3200 < 140;
      [-0.1, 0.02, 0.12].forEach((x, k) => drop(k, x, top + 0.12 - ((t / 700 + k / 3) % 1) * 0.3, 0.05, 1));
    };
  },
  // The Miller: the four sails of the mill on his cap (gnome-kit.ts "mill"), turning
  "mill-sails": (_, hat) => {
    const wood = flat(C.woodDark), cloth = flat(0xefe4cf, { side: THREE.DoubleSide });
    const parts: THREE.Object3D[] = [inked(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10).rotateX(Q), wood)];
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.add(at(inked(new THREE.BoxGeometry(0.03, 0.36, 0.025), wood), 0, 0.2, 0), at(new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.24), cloth), 0.06, 0.22, 0.01));
      arm.rotation.z = (k * Math.PI) / 2;
      parts.push(arm);
    }
    const sails = moving(hat, ...parts);
    sails.position.set(0, 0.4, 0.2);
    sails.rotation.x = -0.25;
    return (t) => (sails.rotation.z = -t / 900);
  },
  // The Admiral: gold epaulettes, their fringe, and a pennant on his tricorn
  epaulettes: (g, hat) => {
    const gold = flat(C.sun);
    for (const side of [-1, 1]) {
      const pad = at(inked(new THREE.SphereGeometry(0.15, 12, 8), gold), side * 0.42, 0.18, -0.04);
      pad.scale.set(1, 0.35, 0.8);
      pad.rotation.z = side * -0.6;
      g.add(pad);
      for (let k = 0; k < 4; k++) {
        const f = at(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 4), gold), side * (0.5 + 0.015 * k), 0.06 - k * 0.012, -0.12 + k * 0.07);
        f.rotation.z = side * -0.6;
        g.add(f);
      }
    }
    hat.add(at(inked(new THREE.SphereGeometry(0.07, 10, 8), flat(0xffffff)), 0.2, 0.0, 0.36));
    hat.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 4), flat(C.ink)), -0.12, 0.3, -0.05));
    const flag = moving(hat, at(new THREE.Mesh(pennant(), flat(0xe0524b, { side: THREE.DoubleSide })), 0, 0, 0));
    flag.position.set(-0.12, 0.47, -0.05);
    return (t) => (flag.rotation.y = Math.sin(t / 300) * 0.4);
  },
  // Ancient Mushroom: glowing spots on his cap, slowly breathing, small mushrooms grown on it, spores rising
  "fairy-ring": (_, hat, skin) => {
    const glow = flat(skin.accent ?? 0xf7d977, { emissive: skin.accent ?? 0xf7d977, emissiveIntensity: 0.4 });
    const spots = moving(hat, ...[[0, 0.95], [0.6, 0.55], [1.7, 0.6], [2.8, 0.5], [3.9, 0.62], [5.0, 0.55], [2.2, 0.25], [4.6, 0.3]].map(([a, el]) => {
      const n = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.68, Math.sin(a) * Math.cos(el));
      const p = at(new THREE.Mesh(new THREE.CircleGeometry(0.075, 10), glow), Math.cos(a) * Math.cos(el) * 0.63, -0.1 + Math.sin(el) * 0.63 * 0.68, Math.sin(a) * Math.cos(el) * 0.63);
      p.lookAt(p.position.clone().add(n));
      return p;
    }));
    const stalk = flat(0xefe4cf), cap = flat(skin.propColor ?? 0xb83a5e);
    for (const [x, z, s] of [[0.22, 0.12, 1], [0.12, 0.26, 0.75], [-0.25, 0.08, 0.85]]) {
      const shroom = new THREE.Group();
      shroom.add(inked(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 6), stalk), at(inked(new THREE.SphereGeometry(0.05, 8, 4, 0, Math.PI * 2, 0, Q), cap), 0, 0.04, 0));
      shroom.scale.setScalar(s);
      hat.add(at(shroom, x, 0.25 - Math.hypot(x, z) * 0.45, z));
    }
    const spore = swarm(hat, new THREE.SphereGeometry(0.025, 6, 4), glowOf(0xf7d977), 5);
    // the glow the spots are drawn with: the merge's own material (bake clones a tinted one), not glow
    const drawn = spots.children.flatMap((o) => (o instanceof THREE.Mesh ? [o.material as THREE.MeshToonMaterial] : []));
    return (t) => {
      for (const m of drawn) m.emissiveIntensity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t / 800));
      spots.scale.setScalar(1 + 0.02 * Math.sin(t / 800));
      for (let k = 0; k < 5; k++) {
        const f = (t / 3000 + k / 5) % 1, a = k * 1.26 + f;
        spore(k, Math.cos(a) * (0.45 + f * 0.2), f * 0.6, Math.sin(a) * (0.45 + f * 0.2), f < 0.9 ? 1 : 0);
      }
    };
  },
  // Summit Gnome: a cap of snow on his hat's tip, icicles under its brim, a twinkle
  "frost-cap": (_, hat, skin) => {
    // the snow lies over the hat's top third, a drift lumped round its edge
    const top = hatTop(skin), snow = flat(0xffffff), ice = flat(0xdff1f7), foot = top - 0.34, r = 0.38 * (top - foot) / 0.875 + 0.02;
    hat.add(at(inked(new THREE.ConeGeometry(r, 0.36, 14), snow), 0, foot + 0.17, 0));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      hat.add(at(inked(new THREE.SphereGeometry(0.06, 8, 6), snow), Math.cos(a) * r, foot + 0.01, Math.sin(a) * r));
    }
    // icicles hung from the brim, in front where they are seen
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 1.4 + 0.15;
      const icicle = at(inked(new THREE.ConeGeometry(0.04, 0.2 - (k % 2) * 0.06, 6), ice), Math.cos(a) * 0.43, -0.32, Math.sin(a) * 0.43);
      icicle.rotation.x = Math.PI;
      hat.add(icicle);
    }
    const star = moving(hat, new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glowOf(0xffffff)));
    star.position.set(0.1, top - 0.02, 0.1);
    return (t) => (star.rotation.z = t / 400, star.scale.setScalar(0.6 + 0.5 * Math.abs(Math.sin(t / 650))));
  },
};

/** A Legendary's piece onto him (Skin.prop, a "legend" entry): returns its motion, or null. */
export function dressLegend(g: THREE.Group, hat: THREE.Group, skin: Skin): Tick | null {
  const piece = skin.prop && PIECES[skin.prop];
  return piece ? piece(g, hat, skin) : null;
}
