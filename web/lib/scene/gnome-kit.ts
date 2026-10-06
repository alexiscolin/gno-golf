// The collection's wardrobe (docs/gnomes/design.md): its hats, the small
// things its gnomes wear, a Rare's piece and patterned body. Built as the
// gnome is, flat colours under a thin ink line, and only for a Skin that asks:
// GNOMES' fourteen never reach here.
import * as THREE from "three";
import { C, flat, inked, texOf } from "./materials";
import type { Skin } from "./gnome";

/** The collection's hats (Skin.shape), each with its own brim. */
export const KIT_HATS = ["straw", "bucket", "sailor", "bandana", "beret", "beanie", "alpine", "slouch", "pith",
  "skullcap", "souwester", "mill", "mushroom"] as const;
export type KitHat = (typeof KIT_HATS)[number];
export const isKitHat = (s: Skin["shape"]): s is KitHat => !!s && (KIT_HATS as readonly string[]).includes(s);

const Q = Math.PI / 2;
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
/** A dome: the top half of a sphere, its rim at y 0. */
const dome = (r: number, w = 16, h = 8) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
/** A cone's frustum, closed or open (a brim turned up or down). */
const frustum = (top: number, bottom: number, h: number, open = false) => new THREE.CylinderGeometry(top, bottom, h, 18, 1, open);
const accentOf = (skin: Skin) => skin.accent ?? C.sun;

// Each hat stands in the hat's space, as makeBall's cone does: the head's top
// is about y -0.3 there, a 0.38-wide circle; top is its highest point (where
// a pompom or an Epic's prop sits).
// lamp: where a headlamp clips on (the mines: gnome.ts headlamp), [y, z] on the hat's front just over its brim
const HATS: Record<KitHat, { top: number; lamp: readonly [number, number]; build: (skin: Skin, m: THREE.Material) => THREE.Object3D[] }> = {
  // a wide straw sun hat, a ribbon round its crown
  straw: { top: 0.06, lamp: [-0.05, 0.35], build: (s, m) => [
    at(inked(frustum(0.3, 0.36, 0.32), m), 0, -0.1, 0),
    at(inked(frustum(0.6, 0.62, 0.04), m), 0, -0.25, 0),
    at(new THREE.Mesh(frustum(0.365, 0.37, 0.08, true), flat(accentOf(s), { side: THREE.DoubleSide })), 0, -0.2, 0),
  ] },
  // a fisherman's bucket hat, its brim sloping down
  bucket: { top: 0.12, lamp: [-0.05, 0.37], build: (s, m) => [
    at(inked(frustum(0.3, 0.38, 0.34), m), 0, -0.05, 0),
    at(inked(new THREE.SphereGeometry(0.3, 14, 6, 0, Math.PI * 2, 0, 0.5), m), 0, -0.11, 0),
    at(inked(frustum(0.4, 0.56, 0.13, true), flat(s.hat, { side: THREE.DoubleSide })), 0, -0.26, 0),
  ] },
  // a sailor's white cap, its brim turned up all round
  sailor: { top: 0.14, lamp: [-0.05, 0.4], build: (s, m) => [
    at(inked(frustum(0.36, 0.4, 0.36), m), 0, -0.08, 0),
    // its top a shallow dome, rim on the crown's
    at(inked(new THREE.SphereGeometry(0.36, 16, 4, 0, Math.PI * 2, 0, 0.45), m), 0, -0.224, 0),
    at(inked(frustum(0.47, 0.4, 0.15, true), flat(s.hat, { side: THREE.DoubleSide })), 0, -0.2, 0),
    at(new THREE.Mesh(frustum(0.365, 0.37, 0.04, true), flat(s.accent ?? 0x24406e, { side: THREE.DoubleSide })), 0, 0.04, 0),
  ] },
  // a bandana tied over the head, its knot and ends at the back, spotted
  bandana: { top: 0.1, lamp: [-0.1, 0.42], build: (s, m) => {
    const cloth = at(inked(dome(0.46), m), 0, -0.3, 0);
    cloth.scale.y = 0.92;
    const knot = at(inked(new THREE.SphereGeometry(0.09, 10, 8), m), 0, -0.22, -0.44);
    const ends = [-1, 1].map((side) => {
      const e = at(inked(new THREE.ConeGeometry(0.07, 0.24, 8), m), side * 0.08, -0.34, -0.48);
      e.rotation.set(-0.5, 0, side * 0.5);
      return e;
    });
    // spots on its surface: [round the head, down from the top]
    const dots = [[1.0, 0.9], [2.1, 1.0], [1.6, 0.35], [0.2, 1.1], [2.9, 1.1], [1.3, 1.35], [0.6, 0.6], [2.5, 0.6]].map(([az, pol]) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 4), flat(s.accent ?? 0xffffff));
      d.scale.set(1, 1, 0.4);
      d.position.set(Math.sin(pol) * Math.cos(az) * 0.47, -0.3 + Math.cos(pol) * 0.47 * 0.92, Math.sin(pol) * Math.sin(az) * 0.47);
      d.lookAt(d.position.clone().add(new THREE.Vector3(d.position.x, d.position.y + 0.3, d.position.z)));
      return d;
    });
    return [cloth, knot, ...ends, ...dots];
  } },
  // a painter's beret, tipped to one side, its stalk on top
  beret: { top: 0.06, lamp: [-0.12, 0.47], build: (_, m) => {
    const b = at(inked(new THREE.SphereGeometry(0.47, 16, 10), m), 0.06, -0.14, 0);
    b.scale.set(1, 0.32, 1);
    b.rotation.z = -0.22;
    const stalk = at(inked(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 6), m), 0.05, 0.03, 0);
    return [b, stalk];
  } },
  // a knitted beanie with a turned-up cuff
  beanie: { top: 0.2, lamp: [-0.08, 0.43], build: (s, m) => {
    const b = at(inked(dome(0.43), m), 0, -0.27, 0);
    b.scale.y = 1.08;
    const cuff = at(inked(frustum(0.45, 0.45, 0.16), flat(s.accent ?? s.hat)), 0, -0.24, 0);
    return [b, cuff];
  } },
  // an alpine felt hat: a creased crown, a narrow brim up at the back, a band and a small feather
  alpine: { top: 0.18, lamp: [-0.1, 0.34], build: (s, m) => {
    const crown = at(inked(frustum(0.22, 0.36, 0.42), m), 0, -0.03, 0);
    const brim = at(inked(frustum(0.5, 0.5, 0.035), m), 0, -0.24, 0);
    brim.rotation.x = 0.18;
    const band = at(new THREE.Mesh(frustum(0.345, 0.365, 0.07, true), flat(accentOf(s), { side: THREE.DoubleSide })), 0, -0.19, 0);
    const feather = at(inked(new THREE.SphereGeometry(0.06, 8, 6), flat(0x4f7f4a)), 0.3, -0.02, -0.1);
    feather.scale.set(0.5, 2.6, 0.5);
    feather.rotation.z = -0.45;
    return [crown, brim, band, feather];
  } },
  // a prospector's slouch hat: a dented crown, a wide brim that droops
  slouch: { top: 0.1, lamp: [-0.08, 0.35], build: (s, m) => {
    const crown = at(inked(frustum(0.28, 0.36, 0.32), m), 0, -0.08, 0);
    const top = at(inked(new THREE.SphereGeometry(0.28, 14, 6), m), 0, 0.07, 0);
    top.scale.y = 0.18;
    const brim = at(inked(frustum(0.42, 0.6, 0.1, true), flat(s.hat, { side: THREE.DoubleSide })), 0, -0.26, 0.02);
    brim.rotation.x = -0.12;
    return [crown, top, brim];
  } },
  // an explorer's pith helmet, its band, a brim all round
  pith: { top: 0.12, lamp: [-0.1, 0.43], build: (s, m) => {
    const d = at(inked(dome(0.46), m), 0, -0.27, 0);
    d.scale.y = 0.85;
    const brim = at(inked(frustum(0.46, 0.58, 0.07), m), 0, -0.28, 0.02);
    const band = at(new THREE.Mesh(frustum(0.455, 0.46, 0.07, true), flat(accentOf(s), { side: THREE.DoubleSide })), 0, -0.21, 0);
    const knob = at(inked(new THREE.SphereGeometry(0.05, 8, 6), m), 0, 0.13, 0);
    return [d, brim, band, knob];
  } },
  // a smith's leather skullcap with a short peak
  skullcap: { top: -0.02, lamp: [-0.2, 0.42], build: (_, m) => {
    const d = at(inked(dome(0.44), m), 0, -0.3, 0);
    d.scale.y = 0.62;
    const peak = at(inked(new THREE.SphereGeometry(0.22, 12, 4, 0, Math.PI, 0, Q), m), 0, -0.28, 0.32);
    peak.scale.set(1.4, 0.15, 1);
    peak.rotation.y = -Q;
    return [d, peak];
  } },
  // a sou'wester: a rain hat whose brim runs long down the back
  souwester: { top: 0.06, lamp: [-0.15, 0.4], build: (s, m) => {
    const d = at(inked(dome(0.42), m), 0, -0.3, 0);
    d.scale.y = 0.85;
    // (its top edge tucked inside the dome: no gap shows as it tips back)
    const brim = at(inked(frustum(0.38, 0.62, 0.16, true), flat(s.hat, { side: THREE.DoubleSide })), 0, -0.29, -0.07);
    brim.rotation.x = 0.22;
    return [d, brim];
  } },
  // the Miller's: a soft miller's cap, a small mill standing on it, whitewashed, its roof
  // in the accent (its sails: gnome-legend.ts "mill-sails", on the tower's front)
  mill: { top: 0.6, lamp: [-0.15, 0.37], build: (s, m) => {
    const cap = at(inked(frustum(0.3, 0.4, 0.26), m), 0, -0.17, 0);
    const puff = at(inked(new THREE.SphereGeometry(0.32, 16, 8), m), 0, -0.04, 0);
    puff.scale.y = 0.32;
    const wall = flat(0xfdf6e9);
    const tower = at(inked(frustum(0.12, 0.19, 0.4), wall), 0, 0.22, 0);
    const roof = at(inked(new THREE.ConeGeometry(0.16, 0.18, 12), flat(s.accent ?? C.cap)), 0, 0.51, 0);
    const door = at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.01), flat(C.woodDark)), 0, 0.08, 0.18);
    return [cap, puff, tower, roof, door];
  } },
  // the Ancient Mushroom's: a wide cap, its gills under it (its glowing spots: gnome-legend.ts)
  mushroom: { top: 0.32, lamp: [-0.04, 0.61], build: (_, m) => {
    const cap = at(inked(dome(0.62, 18, 9), m), 0, -0.1, 0);
    cap.scale.y = 0.68;
    const gills = at(new THREE.Mesh(new THREE.CircleGeometry(0.6, 18), flat(0xefe4cf, { side: THREE.DoubleSide })), 0, -0.1, 0);
    gills.rotation.x = Q;
    return [cap, gills];
  } },
};

/** The highest point of a gnome's hat, in the hat's space: where a pompom or a prop on top sits. */
export function hatTop(skin: Skin) {
  if (isKitHat(skin.shape)) return HATS[skin.shape].top;
  if (skin.helmet) return 0.2;
  if (skin.shape === "tricorn") return 0.19;
  if (skin.shape === "toque") return 0.84;
  if (skin.shape === "tophat") return 0.6;
  return skin.tall ? 1.02 : 0.575;
}

/** Where a headlamp clips on one of the collection's hats: [y, z] in the hat's space. */
export const kitLamp = (shape: KitHat) => HATS[shape].lamp;

/** One of the collection's hats, into the hat's group. */
export function kitHat(hat: THREE.Group, skin: Skin & { shape: KitHat }) {
  hat.add(...HATS[skin.shape].build(skin, flat(skin.hat)));
}

/** A dab on the face: a disc lying on the head's surface at (x, y). */
function onFace(x: number, y: number, r: number, color: number) {
  const z = Math.sqrt(Math.max(0, 0.552 * 0.552 - x * x - y * y));
  const d = at(new THREE.Mesh(new THREE.CircleGeometry(r, 10), flat(color)), x, y, z);
  d.lookAt(new THREE.Vector3(x, y, z).multiplyScalar(3));
  return d;
}

/** The collection's small things (goggles, an earring, a neckerchief, a
 *  leaf, soot, freckles, a moon), into the body g and the hat's group. */
export function kitWear(g: THREE.Group, hat: THREE.Group, skin: Skin) {
  const accent = accentOf(skin);
  if (skin.goggles) {
    // pushed up on the brow, under the brim, the strap round the head
    for (const side of [-1, 1]) {
      const rim = at(inked(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 12, 1, true), flat(skin.accent ?? 0x5c6670, { side: THREE.DoubleSide })), side * 0.15, 0.32, 0.42);
      rim.rotation.x = Q - 0.6;
      const glass = at(new THREE.Mesh(new THREE.CircleGeometry(0.08, 14), flat(0xa9d8ea)), side * 0.15, 0.345, 0.455);
      glass.rotation.x = -0.6;
      g.add(rim, glass);
    }
    const strap = at(new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 4, 28), flat(0x3b3f45)), 0, 0.3, -0.02);
    strap.rotation.x = Q + 0.35;
    g.add(strap);
  }
  if (skin.earring) {
    const ring = at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 14), flat(skin.accent ?? C.sun)), 0.53, -0.08, 0.1);
    ring.rotation.y = Q;
    g.add(ring);
  }
  if (skin.neckerchief) {
    // a cloth knotted round the neck: its band, the knot at the side, two ends
    const band = at(inked(new THREE.TorusGeometry(0.47, 0.06, 5, 20), flat(accent)), 0, -0.24, 0.02);
    band.rotation.x = Q - 0.25;
    const knot = at(inked(new THREE.SphereGeometry(0.075, 8, 6), flat(accent)), 0.36, -0.28, 0.33);
    g.add(band, knot);
    for (const side of [-1, 1]) {
      const end = at(inked(new THREE.ConeGeometry(0.06, 0.18, 6), flat(accent)), 0.4 + side * 0.05, -0.4, 0.33);
      end.rotation.set(0, 0, Math.PI + side * 0.35);
      g.add(end);
    }
  }
  if (skin.leaf) {
    // a sprig on the hat, where a flower would be
    for (const [x, y, r] of [[0.3, -0.16, 0.5], [0.4, -0.22, -0.4], [0.33, -0.27, 1.6]]) {
      const l = at(inked(new THREE.SphereGeometry(0.08, 8, 6), flat(skin.accent ?? 0x3fa34d)), x, y, 0.24);
      l.scale.set(0.55, 1.4, 0.4);
      l.rotation.z = r;
      hat.add(l);
    }
  }
  if (skin.soot) for (const [x, y, r] of [[0.3, -0.05, 0.07], [0.22, 0.24, 0.05], [-0.32, -0.1, 0.06]]) g.add(onFace(x, y, r, 0x3b3f45));
  if (skin.freckles) for (const side of [-1, 1]) for (const [x, y] of [[0.28, -0.04], [0.33, 0.0], [0.24, 0.02]]) g.add(onFace(side * x, y, 0.022, 0xa4492b));
  if (skin.moon) {
    // a crescent on the hat's front
    const moon = at(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14, Math.PI * 1.2), flat(skin.accent ?? C.sun)), 0, 0.12, 0.27);
    moon.rotation.set(-0.35, 0, 0.9);
    hat.add(moon);
  }
}

/** A Rare's piece (Skin.piece): a scarf, a bow tie, a plume, earmuffs, a satchel or a medal. */
export function kitPiece(g: THREE.Group, hat: THREE.Group, skin: Skin) {
  const m = flat(skin.pieceColor ?? C.cap);
  switch (skin.piece) {
    case "scarf": {
      const wrap = at(inked(new THREE.TorusGeometry(0.46, 0.1, 6, 18), m), 0, -0.2, 0);
      wrap.rotation.x = Q - 0.15;
      const tail = at(inked(new THREE.BoxGeometry(0.16, 0.42, 0.07), m), -0.38, -0.36, 0.3);
      tail.rotation.set(0.2, -0.6, 0.25);
      g.add(wrap, tail);
      break;
    }
    case "bowtie": {
      for (const side of [-1, 1]) {
        const wing = at(inked(new THREE.ConeGeometry(0.09, 0.16, 8), m), side * 0.09, -0.36, 0.48);
        wing.rotation.z = side * Q;
        g.add(wing);
      }
      g.add(at(inked(new THREE.SphereGeometry(0.045, 8, 6), m), 0, -0.36, 0.5));
      break;
    }
    case "plume": {
      // a long feather from the hat's band, curling back
      const p = at(inked(new THREE.SphereGeometry(0.09, 10, 8), m), 0.32, 0.12, -0.12);
      p.scale.set(0.45, 3.4, 0.6);
      p.rotation.set(-0.5, 0, -0.5);
      const quill = at(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), flat(C.cream)), 0.25, -0.1, -0.05);
      quill.rotation.set(-0.5, 0, -0.5);
      hat.add(p, quill);
      break;
    }
    case "earmuffs": {
      for (const side of [-1, 1]) {
        const muff = at(inked(new THREE.SphereGeometry(0.15, 12, 8), m), side * 0.52, 0.12, 0);
        muff.scale.x = 0.55;
        g.add(muff);
      }
      // the band over the head from one muff to the other (a half torus stands across, in x and y, as it is made)
      g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.025, 4, 24, Math.PI), flat(0x5c6670)), 0, 0.12, 0));
      break;
    }
    case "satchel": {
      const strap = at(new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.03, 4, 30), flat(0x7c4a2a)), 0, 0, 0);
      strap.rotation.set(0.15, 0, -0.75);
      const bag = at(inked(new THREE.BoxGeometry(0.2, 0.22, 0.12), m), 0.44, -0.36, 0.2);
      bag.rotation.y = 0.9;
      const flap = at(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.09, 0.13), flat(0x7c4a2a)), 0.44, -0.28, 0.205);
      flap.rotation.y = 0.9;
      g.add(strap, bag, flap);
      break;
    }
    case "medal": {
      const ribbon = at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), m), 0.3, -0.06, 0.45);
      ribbon.rotation.y = 0.55;
      const disc = at(inked(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14), flat(C.sun)), 0.31, -0.18, 0.44);
      disc.rotation.set(Q, 0, 0.55);
      g.add(ribbon, disc);
      break;
    }
  }
}

/** A Rare's patterned body: the pattern drawn on a canvas round the body
 *  (u its way round, v from the head to the feet), in body and patternColor. */
export function patternedBody(skin: Skin) {
  const N = 64, c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d")!;
  const css = (v: number) => "#" + new THREE.Color(v).getHexString();
  const [a, b] = [css(skin.body ?? C.cream), css(skin.patternColor ?? C.cap)];
  x.fillStyle = a;
  x.fillRect(0, 0, N, N);
  x.fillStyle = b;
  x.strokeStyle = b;
  switch (skin.pattern) {
    case "stripes":
      for (let k = 0; k < 8; k += 2) x.fillRect(0, k * 8 + 4, N, 4);
      break;
    case "spots":
      for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) x.beginPath(), x.arc(((k + (r % 2) / 2) * N) / 6, r * 16 + 8, 3.2, 0, Math.PI * 2), x.fill();
      break;
    case "checks":
      for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) if ((r + k) % 2) x.fillRect(k * 8, r * 8, 8, 8);
      break;
    case "zigzag":
      x.lineWidth = 3;
      for (let r = 1; r < 8; r += 2) {
        x.beginPath();
        for (let k = 0; k <= 8; k++) x.lineTo(k * 8, r * 8 + (k % 2 ? -3 : 3));
        x.stroke();
      }
      break;
    case "argyle":
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
        const cx = k * 16 + (r % 2 ? 8 : 0) + 8, cy = r * 16 + 8;
        x.beginPath(), x.moveTo(cx, cy - 8), x.lineTo(cx + 5, cy), x.lineTo(cx, cy + 8), x.lineTo(cx - 5, cy), x.closePath(), x.fill();
      }
      break;
    case "patchwork":
      for (const [px, py, w, h] of [[4, 6, 18, 14], [36, 2, 16, 18], [20, 30, 20, 16], [46, 36, 14, 18], [2, 46, 16, 14]]) {
        x.fillRect(px, py, w, h);
        x.strokeStyle = css(C.ink);
        x.lineWidth = 1;
        x.setLineDash([2, 2]);
        x.strokeRect(px + 1.5, py + 1.5, w - 3, h - 3);
      }
      break;
  }
  return flat(0xffffff, { map: texOf(c) });
}
