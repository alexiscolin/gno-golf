import * as THREE from "three";
import { BALL_R } from "../terrain";
import { C, flat, inked, disposeCourse, releaseShared, texOf, motion, ownFade, setFade, THIN_HULL, lanternGlow, share } from "./materials";
import { makeRenderer, makeScene } from "./camera";
import { bake } from "./bake";
import { ud, type Gnome } from "./data";
import type { UnlockId } from "../card";
import type { Beard, Holing, Material, Pattern, Piece, Trail } from "../gnomes/vocab";
import { darkBody } from "../gnomes/colour";
import type { KitHat } from "./gnome-kit";

/** The collection's wardrobe (gnome-wardrobe.ts), what makeBall asks for a
 *  collection gnome: a hat of its own (false: not one of its), where a lamp
 *  clips on it and its top, a patterned body, and the rest of him dressed
 *  (returning what moves). Loaded with the first collection gnome shown
 *  (loadWardrobe): GNOMES' fourteen never need it, and the pages that draw only
 *  them never carry it. Until it has come, a collection gnome is drawn plain. */
export interface Wardrobe {
  hat(hat: THREE.Group, skin: Skin): boolean;
  lamp(skin: Skin): readonly [number, number] | null;
  top(skin: Skin): number | null;
  body(skin: Skin): THREE.Material | null;
  dress(g: THREE.Group, hat: THREE.Group, skin: Skin, body: THREE.Mesh, beard: THREE.Group): ((t: number) => void)[];
}
let wardrobe: Wardrobe | null = null;
/** Puts the wardrobe on (gnome-wardrobe.ts does, as it is loaded). */
export const wear = (w: Wardrobe) => void (wardrobe = w);
/** Loads the collection's wardrobe, once: before a collection gnome is first made (a token's, a dev hook's). */
export const loadWardrobe = () => import("./gnome-wardrobe").then(() => undefined);

/** A gnome's look: what makeBall dresses him in. */
export interface Skin {
  id: string;
  name: string;
  line: string;
  /** the unlock that earns him (lib/card.ts UNLOCKS); none: everyone's */
  unlock?: UnlockId;
  hat: number;
  /** a hat other than the cone: GNOMES' three, or one of the collection's (gnome-kit.ts) */
  shape?: "tricorn" | "toque" | "tophat" | KitHat;
  beard: Beard;
  hair?: number;
  body?: number;
  stripes?: readonly [number, number];
  glasses?: boolean; pompom?: boolean; flower?: boolean; cheeks?: boolean; stars?: boolean; tall?: boolean;
  horns?: boolean; helmet?: boolean; patch?: boolean; parrot?: boolean; mask?: boolean; flour?: boolean;
  sash?: boolean; monocle?: boolean; crown?: boolean; cape?: boolean;
  /** a lit headlamp on the hat's front (the Miner's, in every world) */
  lamp?: boolean;
  /** the brim's colour, when not the hat's (a helmet's: dark wood) */
  brim?: number;
  // The collection's traits (lib/gnomes, docs/gnomes/design.md): none of
  // GNOMES wears them, and a gnome without them is drawn as he always was.
  goggles?: boolean; earring?: boolean; neckerchief?: boolean; leaf?: boolean; soot?: boolean; freckles?: boolean; moon?: boolean;
  /** the small things' colour (a neckerchief, goggles' strap, an earring) */
  accent?: number;
  /** a Rare's patterned body, in body and patternColor */
  pattern?: Exclude<Pattern, "plain">;
  patternColor?: number;
  /** a Rare's piece, and its colour */
  piece?: Piece;
  pieceColor?: number;
  /** what he is made of (an Epic's, a Legendary's), tinted materialColor */
  material?: Exclude<Material, "toon">;
  materialColor?: number;
  /** what he leaves behind rolling, and what the cup does when he drops in (gnome-fx.ts) */
  trail?: Trail;
  trailColor?: number;
  holing?: Exclude<Holing, "confetti">;
  holingColor?: number;
  /** an Epic's or a Legendary's own thing (lib/gnomes/props.ts), and its colour */
  prop?: string;
  propColor?: number;
}

/** The ball is a gnome. Which one is the player's choice — cosmetic only: the
 *  chain moves a point, it never hears about beards. */
export const GNOMES: readonly Skin[] = [
  { id: "classic", name: "The Classic", line: "Red hat, white beard. Why change a winning team?",
    hat: C.cap, beard: "full", hair: 0xffffff },
  { id: "sage", name: "The Sage", line: "He played every hole before it was built. The beard says so.",
    hat: 0x5b6fb5, beard: "long", hair: 0xf1eee6, glasses: true },
  { id: "ginger", name: "The Ginger", line: "A lumberjack's beard and a bobble that will not sit still.",
    hat: 0x2f8f6f, beard: "bushy", hair: 0xd9793a, pompom: true },
  { id: "moustache", name: "The Moustache", line: "No beard, just the moustache. He aims true, and he knows it.",
    hat: 0xf2b94a, beard: "moustache", hair: 0x6b4a2f },
  { id: "gardener", name: "The Gardener", line: "A flower on her hat. She knows every blade of grass out here.",
    hat: 0xe98fb0, beard: "none", flower: true, cheeks: true },
  // earned, not given: see lib/card.ts
  { id: "wizard", name: "The Wizard", line: "Finished the Garden Cup, and now the hat has stars on it.", unlock: "wizard",
    hat: 0x4b3a9a, beard: "long", hair: 0xffffff, stars: true, tall: true },
  { id: "viking", name: "The Viking", line: "The Garden Cup at par or under. The horns are earned.", unlock: "viking",
    hat: 0x9aa5ab, beard: "bushy", hair: 0xd9a441, horns: true, helmet: true },
  { id: "golden", name: "The Golden Gnome", line: "Five holes in one. He is not made of gold. Probably.", unlock: "golden",
    hat: 0xf2c14e, beard: "full", hair: 0xf7d977, body: 0xf2c14e, pompom: true },
  { id: "pirate", unlock: "pirate", name: "The Pirate", line: "Sailed the Island Cup end to end. The parrot came free.",
    hat: 0x1f2328, shape: "tricorn", beard: "bushy", hair: 0x3a2a1c, patch: true, parrot: true, stripes: [0xe0524b, 0xfdf6e9] },
  { id: "diver", unlock: "diver", name: "The Diver", line: "The Island Cup at par or under, without getting his beard wet.",
    hat: 0x2aa6a0, beard: "full", hair: 0xf1eee6, body: 0x7fd3cc, mask: true },
  { id: "baker", unlock: "baker", name: "The Baker", line: "Every street of Mushroom Town, and still warm from the oven.",
    hat: 0xffffff, shape: "toque", beard: "moustache", hair: 0x6b4a2f, body: 0xffffff, flour: true },
  { id: "mayor", unlock: "mayor", name: "The Mayor", line: "Mushroom Town at par or under. The sash says so.",
    hat: 0x1f2328, shape: "tophat", beard: "full", hair: 0xd9d4c8, sash: true, monocle: true },
  { id: "king", unlock: "king", name: "The Gnome King", line: "The grand slam: the four cups at par or under. Bow.",
    hat: C.cap, crown: true, beard: "long", hair: 0xffffff, body: 0xf2c14e, cape: true },
  { id: "miner", unlock: "miner", name: "The Miner", line: "Down the Crystal Mines and back up. The lamp stays lit.",
    hat: 0xf2c14e, brim: 0xf2c14e, helmet: true, lamp: true, beard: "bushy", hair: 0x9a8b7a },
];

// the headlamp: an iron housing on the hat's front, its lens lit (unlit
// white-gold) and a small glow (a sprite, as the town's lanterns): real 3D,
// inked like the rest of him
const LENS = share(new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
function lampOn(body: THREE.Object3D, at: THREE.Vector3) {
  const lamp = new THREE.Group();
  const housing = inked(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 14).rotateX(Math.PI / 2), flat(0x4b4f5c));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16), LENS);
  lens.position.z = 0.062;
  const glow = new THREE.Sprite(lanternGlow());
  glow.position.z = 0.12;
  glow.scale.setScalar(0.9);
  lamp.add(housing, lens, glow);
  lamp.position.copy(at);
  lamp.rotation.x = -0.2; // as the hat leans back
  body.add(lamp);
  return glow;
}

const FOUND = new WeakMap<THREE.Object3D, THREE.Object3D>();
/** The player's gnome in a scene (the engine's ball; a duel's ghost is not
 *  him): a world that lights his way finds him here (the mines' headlamp). */
export function gnomeIn(scene: THREE.Object3D): Gnome | undefined {
  // (found once and kept while he is still in it: the lamps ask every frame, and a search walks the whole course)
  let o: THREE.Object3D | null = FOUND.get(scene) ?? null;
  const gn = o;
  while (o && o !== scene) o = o.parent;
  if (gn && o && gn.name === "gnome") return gn as Gnome;
  const found = scene.getObjectByName("gnome") as Gnome | undefined;
  if (found) FOUND.set(scene, found);
  return found;
}

/**
 * A gnome's headlamp, lit: the Miner's own (in every world), or a clip-on one
 * any gnome wears while a world asks for it (the mines: on while he is
 * there, off when he leaves; the Miner's own never goes out). Returns the
 * lamp's glow, at its lens: its world position is where the light comes
 * from (a world's cone decal on the ground hangs from it, the gnome its
 * root); null once off.
 */
export function headlamp(gnome: Gnome, on = true): THREE.Object3D | null {
  const d = gnome.userData;
  if (on && !d.lamp) (d.lamp = lampOn(d.body, d.lampAt)), (d.clip = true);
  if (d.lamp && d.clip) d.lamp.parent!.visible = on;
  return d.lamp && d.lamp.parent!.visible ? d.lamp : null;
}

/** Horizontal stripes on the body (the pirate's shirt). */
function stripedBody([a, b]: readonly [number, number]) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d")!;
  for (let k = 0; k < 8; k++) {
    x.fillStyle = "#" + new THREE.Color(k % 2 ? b : a).getHexString();
    x.fillRect(0, k * 4, 32, 4);
  }
  const t = texOf(c);
  return flat(0xffffff, { map: t });
}

// Gnomes the game is given that are not GNOMES': a collection token's look
// (lib/gnomes/skin.ts), by its own id; and the one every rival's ghost wears
// in a test (the test hooks' ?rivaltraits, never a player's choice).
const MORE = new Map<string, Skin>();
let rivalWears: Skin | null = null;
/** A gnome the game can then be given by id (gnomeById); returns the id. */
export const addGnome = (skin: Skin) => (MORE.set(skin.id, skin), skin.id);
/** (test hooks only) The gnome every rival's ghost wears, or null for rivalSkin's own pick. */
export const setRivalGnome = (skin: Skin | null) => void (rivalWears = skin);

export const gnomeById = (id: string | null | undefined) => (id && MORE.get(id)) || GNOMES.find((g) => g.id === id) || GNOMES[0];

function beardOf(k: Skin["beard"], hair: number | undefined) {
  const m = flat(hair ?? 0xffffff); // (a beardless gnome has no hair colour: nothing is drawn with it)
  const g = new THREE.Group();
  if (k === "full") {
    const b = inked(new THREE.SphereGeometry(0.3, 14, 10), m);
    b.position.set(0, -0.24, 0.42);
    b.scale.set(1.1, 0.85, 0.7);
    g.add(b);
  } else if (k === "long") {
    const b = inked(new THREE.ConeGeometry(0.3, 0.85, 14), m);
    b.rotation.x = Math.PI;
    b.position.set(0, -0.42, 0.38);
    g.add(b);
  } else if (k === "bushy") {
    for (const [x, y, r] of [[0, -0.28, 0.24], [-0.22, -0.16, 0.18], [0.22, -0.16, 0.18], [-0.12, -0.38, 0.17], [0.12, -0.38, 0.17]]) {
      const b = inked(new THREE.SphereGeometry(r, 12, 9), m);
      b.position.set(x, y, 0.4 - Math.abs(x) * 0.4);
      g.add(b);
    }
  } else if (k === "moustache") {
    for (const side of [-1, 1]) {
      const b = inked(new THREE.SphereGeometry(0.13, 12, 8), m);
      b.position.set(side * 0.13, -0.08, 0.53);
      b.scale.set(1.5, 0.6, 0.6);
      b.rotation.z = side * -0.35;
      g.add(b);
    }
  } else if (k === "goatee") {
    // a small point under the chin, a thin moustache over it
    const b = inked(new THREE.ConeGeometry(0.12, 0.3, 10), m);
    b.rotation.x = Math.PI + 0.35;
    b.position.set(0, -0.36, 0.45);
    g.add(b);
    for (const side of [-1, 1]) {
      const s = inked(new THREE.SphereGeometry(0.09, 10, 6), m);
      s.position.set(side * 0.11, -0.1, 0.53);
      s.scale.set(1.4, 0.45, 0.5);
      s.rotation.z = side * -0.25;
      g.add(s);
    }
  } else if (k === "braids") {
    // a short beard parted into two braids, each a few knots down
    const b = inked(new THREE.SphereGeometry(0.24, 12, 9), m);
    b.position.set(0, -0.22, 0.42);
    b.scale.set(1.05, 0.7, 0.6);
    g.add(b);
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const knot = inked(new THREE.SphereGeometry(0.075 - i * 0.008, 8, 6), m);
      knot.position.set(side * (0.13 + i * 0.01), -0.38 - i * 0.12, 0.42 - i * 0.03);
      g.add(knot);
    }
  } else if (k === "chops") {
    // mutton chops: a bush on each cheek, joined by the moustache
    for (const side of [-1, 1]) {
      const c = inked(new THREE.SphereGeometry(0.17, 12, 8), m);
      c.position.set(side * 0.33, -0.16, 0.36);
      c.scale.set(0.8, 1.15, 0.7);
      const s = inked(new THREE.SphereGeometry(0.11, 10, 6), m);
      s.position.set(side * 0.16, -0.1, 0.52);
      s.scale.set(1.5, 0.55, 0.55);
      s.rotation.z = side * -0.3;
      g.add(c, s);
    }
  }
  return g;
}

export function makeBall(skin: Skin = GNOMES[0]): Gnome {
  const g = new THREE.Group();
  const body = inked(new THREE.SphereGeometry(0.55, 22, 16), skin.stripes ? stripedBody(skin.stripes) : (wardrobe && wardrobe.body(skin)) || flat(skin.body || C.cream));
  g.add(body);

  const hat = new THREE.Group();
  // one of the collection's hats, built by the wardrobe (its own brim, top and lamp), else GNOMES' own
  const kit = !!wardrobe && wardrobe.hat(hat, skin);
  if (kit) void 0;
  else if (skin.shape === "tricorn") {
    // a black three-cornered hat: a low crown and three turned-up corners
    const crown = inked(new THREE.CylinderGeometry(0.34, 0.42, 0.42, 14), flat(skin.hat));
    crown.position.y = -0.02;
    hat.add(crown);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      const flap = inked(new THREE.BoxGeometry(0.62, 0.3, 0.07), flat(skin.hat));
      flap.position.set(Math.cos(a) * 0.4, -0.08, Math.sin(a) * 0.4);
      flap.rotation.y = -a + Math.PI / 2;
      flap.rotation.x = -0.35;
      hat.add(flap);
    }
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 20), flat(C.sun));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = -0.12;
    hat.add(trim);
  } else if (skin.shape === "toque") {
    // a tall chef's toque: a band and a puffed top
    const band = inked(new THREE.CylinderGeometry(0.42, 0.42, 0.45, 18), flat(skin.hat));
    band.position.y = 0.0;
    const puff = inked(new THREE.SphereGeometry(0.52, 16, 12), flat(skin.hat));
    puff.position.y = 0.45;
    puff.scale.y = 0.75;
    hat.add(band, puff);
  } else if (skin.shape === "tophat") {
    const tube = inked(new THREE.CylinderGeometry(0.34, 0.36, 0.8, 18), flat(skin.hat));
    tube.position.y = 0.2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.37, 0.14, 18), flat(C.sun));
    band.position.y = -0.1;
    hat.add(tube, band);
  } else if (skin.helmet) {
    const dome = inked(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), flat(skin.hat));
    dome.position.y = -0.3;
    hat.add(dome);
  } else {
    // cut just under the brim: a foot any wider poked out of his brow, a red fleck over the eyes
    const top = skin.tall ? 1.02 : 0.575, h = top + 0.3;
    const cone = inked(new THREE.ConeGeometry(h * 0.5 / (skin.tall ? 1.6 : 1.15), h, 16), flat(skin.hat));
    cone.position.y = top - h / 2;
    hat.add(cone);
  }
  if (skin.crown) {
    // a gold crown round the foot of the red hat
    const ring = inked(new THREE.CylinderGeometry(0.44, 0.44, 0.22, 18, 1, true), flat(C.sun, { side: THREE.DoubleSide }));
    ring.position.y = -0.1;
    hat.add(ring);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const tip = inked(new THREE.ConeGeometry(0.07, 0.2, 6), flat(C.sun));
      tip.position.set(Math.cos(a) * 0.44, 0.1, Math.sin(a) * 0.44);
      hat.add(tip);
    }
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), flat(C.cap));
    jewel.position.set(0, -0.08, 0.45);
    hat.add(jewel);
  }
  if (skin.parrot) {
    // a little parrot on the brim
    const bird = new THREE.Group();
    const body = inked(new THREE.SphereGeometry(0.13, 10, 8), flat(0x3fa34d));
    body.scale.y = 1.3;
    const head = inked(new THREE.SphereGeometry(0.09, 10, 8), flat(0xe0524b));
    head.position.y = 0.17;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 6), flat(C.sun));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.16, 0.09);
    bird.add(body, head, beak);
    bird.position.set(0.42, 0.12, 0.12);
    hat.add(bird);
  }
  if (skin.horns) {
    for (const side of [-1, 1]) {
      const horn = inked(new THREE.ConeGeometry(0.11, 0.55, 10), flat(C.cream));
      horn.position.set(side * 0.5, -0.05, 0);
      horn.rotation.z = -side * 0.9;
      hat.add(horn);
    }
  }
  if (skin.stars) {
    for (const [x, y, z] of [[0.2, -0.05, 0.34], [-0.15, 0.3, 0.26], [0.07, 0.62, 0.16]]) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), flat(C.sun));
      star.position.set(x, y, z);
      star.scale.z = 0.4;
      hat.add(star);
    }
  }
  // the brim sits where the cone leaves the head, above the eyes
  const brim = inked(new THREE.TorusGeometry(skin.helmet ? 0.5 : skin.shape === "tophat" ? 0.5 : 0.37, 0.075, 8, 22), flat(skin.brim ?? (skin.helmet ? C.woodDark : skin.hat)));
  if (skin.shape === "tricorn" || skin.shape === "toque") brim.visible = false;
  brim.rotation.x = Math.PI / 2;
  brim.position.y = -0.2;
  if (!kit) hat.add(brim); // (the collection's hats have their own)
  if (skin.pompom) {
    const pom = inked(new THREE.SphereGeometry(0.17, 10, 8), flat(0xffffff));
    pom.position.y = kit ? wardrobe!.top(skin)! + 0.03 : 0.6;
    hat.add(pom);
  }
  if (skin.flower) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = inked(new THREE.SphereGeometry(0.09, 8, 6), flat(0xffffff));
      petal.position.set(0.32 + Math.cos(a) * 0.1, -0.2 + Math.sin(a) * 0.1, 0.22);
      hat.add(petal);
    }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), flat(C.sun));
    heart.position.set(0.32, -0.2, 0.28);
    hat.add(heart);
  }
  hat.position.set(0, 0.62, -0.08);
  hat.rotation.x = -0.2;
  g.add(hat);
  // where a headlamp clips on: the hat's front, just over the brim (on the
  // helmet's dome, a hat's band, the cone where it is that wide; over a
  // diver's mask, in front of a crown), in the body's own space
  const [ly, lz] = kit ? wardrobe!.lamp(skin)! : skin.helmet ? [-0.05, 0.45] : skin.shape === "tophat" ? [0, 0.4] : skin.shape ? [0.05, 0.47] : skin.mask ? [0.12, 0.27] : [-0.1, skin.crown ? 0.5 : skin.tall ? 0.37 : 0.32];
  hat.updateMatrix();
  const lampAt = new THREE.Vector3(0, ly, lz).applyMatrix4(hat.matrix);

  const eyes: THREE.Object3D[] = [];
  const dark = skin.body !== undefined && darkBody(skin.body);
  for (const side of [-1, 1]) {
    // (on a body too dark for ink, where he looks must still read: a white
    // round each eye, or lit eyes on lava)
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), dark && skin.material === "lava" ? LENS : flat(C.ink));
    eye.position.set(side * 0.18, 0.08, 0.5);
    g.add(eye);
    eyes.push(eye);
    if (dark && skin.material !== "lava") {
      const white = new THREE.Mesh(new THREE.CircleGeometry(0.125, 14), flat(0xffffff));
      white.position.set(side * 0.18, 0.08, 0.517);
      white.lookAt(white.position.clone().multiplyScalar(2));
      g.add(white);
    }
    if (skin.cheeks) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), flat(C.petal));
      cheek.position.set(side * 0.3, -0.06, 0.44);
      cheek.scale.z = 0.4;
      g.add(cheek);
    }
    if (skin.glasses) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 18), flat(C.ink));
      lens.position.set(side * 0.18, 0.08, 0.54);
      g.add(lens);
    }
  }
  if (skin.glasses) {
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), flat(C.ink));
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.1, 0.56);
    g.add(bridge);
  }
  if (skin.patch) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), flat(C.ink));
    patch.position.set(0.18, 0.09, 0.535);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.018, 4, 30), flat(C.ink));
    strap.rotation.set(0.1, 0, 0.45);
    strap.position.y = 0.08;
    g.add(patch, strap);
  }
  if (skin.monocle) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 6, 18), flat(C.sun));
    lens.position.set(-0.18, 0.08, 0.545);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), flat(C.sun));
    chain.position.set(-0.28, -0.06, 0.5);
    chain.rotation.z = 0.5;
    g.add(lens, chain);
  }
  if (skin.mask) {
    // a diving mask pushed up on the hat's brim, and a snorkel beside it
    const glass = inked(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 16), flat(0xbfe6f0));
    glass.rotation.x = Math.PI / 2 - 0.4;
    glass.scale.x = 1.7;
    glass.position.set(0, 0.52, 0.36);
    // the strap hugs the hat just above its brim (the cone is ~0.4 wide there)
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.03, 4, 28), flat(0x1f2328));
    strap.rotation.x = Math.PI / 2 + 0.2;
    strap.position.set(0, 0.46, -0.06);
    const tube = inked(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), flat(C.sun));
    tube.position.set(0.52, 0.25, 0.1);
    g.add(glass, strap, tube);
  }
  if (skin.flour) {
    const dust = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), flat(0xf4eee2));
    dust.position.set(-0.3, 0.2, 0.47);
    dust.rotation.y = -0.5;
    g.add(dust);
  }
  if (skin.sash) {
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 5, 32), flat(C.cap));
    sash.rotation.set(Math.PI / 2 - 0.2, 0.6, 0);
    sash.position.y = -0.2;
    g.add(sash);
  }
  if (skin.cape) {
    // a purple cape with an ermine collar (white, dotted black)
    const cape = inked(new THREE.SphereGeometry(0.6, 18, 12, Math.PI * 0.15, Math.PI * 1.7, Math.PI * 0.45, Math.PI * 0.5), flat(0x6b3fa0, { side: THREE.DoubleSide }));
    cape.rotation.y = Math.PI;
    const collar = inked(new THREE.TorusGeometry(0.45, 0.09, 8, 24), flat(0xffffff));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.3;
    g.add(cape, collar);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), flat(C.ink));
      dot.position.set(Math.cos(a) * 0.45, 0.36, Math.sin(a) * 0.45);
      g.add(dot);
    }
  }
  const nose = inked(new THREE.SphereGeometry(0.1, 10, 8), flat(C.petal));
  nose.position.set(0, -0.02, 0.56);
  const beard = beardOf(skin.beard, skin.hair);
  g.add(nose, beard);
  const ticks = wardrobe ? wardrobe.dress(g, hat, skin, body.children[0] as THREE.Mesh, beard) : [];

  const shade = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_R * 1.1, 20),
    new THREE.MeshBasicMaterial({ color: C.ink, transparent: true, opacity: 0.18, depthWrite: false })
  );
  shade.rotation.x = -Math.PI / 2;

  // one draw for the whole gnome (per shader), the eyes apart: they blink
  for (const e of eyes) ud(e).live = true;
  bake(g);
  // the body is exactly the ball the chain rolls (Field.Radius), so a gnome
  // against a wall touches it instead of sinking into it
  g.scale.setScalar(BALL_R / 0.55);
  // ...but his nose, beard and hat stick out past it: how far, standing (the
  // replay keeps that much off a wall, engine/replay.ts offWalls)
  const box = new THREE.Box3().setFromObject(g, true);
  const reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);

  const root = new THREE.Group() as Gnome;
  root.name = "gnome"; // (gnomeIn; a ghost is renamed)
  root.add(g, shade);
  root.userData = { body: g, eyes, shade, reach, mid: (box.min.y + box.max.y) / 2, lampAt };
  if (ticks.length) (root.userData.tick = (t) => ticks.forEach((f) => f(t)))(0);
  if (skin.lamp) root.userData.lamp = lampOn(g, lampAt); // (after the bake: his glow stays a sprite of its own)
  return root;
}

// a duel's ghost: paper white, inked thin as a gnome is (and nobody's skin)
const GHOST: Skin = { id: "ghost", name: "Ghost", line: "", hat: C.cream, body: C.cream, hair: C.cream, beard: "full" };
/** A duel's rival's gnome: one of the others than the player's, the same for
 *  the same rival (their address picks it), so two gnomes never look alike. */
export function rivalSkin(player: string, mine: string) {
  if (rivalWears) return rivalWears;
  const others = GNOMES.filter((k) => k.id !== mine);
  let h = 0;
  for (const c of player) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return others[h % others.length];
}

/** A see-through gnome (a duel's ghost, ADR-004), in its skin (a plain cream
 *  one by default): its own materials, no shadow; fade(o) sets how
 *  see-through, each part hiding what is behind it. */
export function makeGhost(o: number, skin: Skin = GHOST) {
  const ball = makeBall(skin);
  ball.name = "ghost";
  const mats = ownFade(ball, THIN_HULL);
  ball.userData.shade.visible = false; // no shadow: a ghost
  if (ball.userData.lamp) ball.userData.lamp.visible = false; // nor a glow: a Miner's lamp is his lens alone
  // its outline drawn after its body, against the body's depth: an ink rim, not an x-ray
  ball.traverse((o) => { if ("material" in o && (o.material as THREE.Material).side === THREE.BackSide) o.renderOrder = 1; });
  const fade = (x: number) => mats.forEach((m) => (setFade(m, x), (m.depthWrite = true)));
  fade(o);
  return { ball, fade };
}

/** A little act a preview plays: "hop" (the picker: he hops, turning), "solo"
 *  (he rolls on the spot, rights himself, blinks, hops) or "duel" (he and a
 *  duel's ghost hop in turn, as a duel's strokes go). */
export type Act = "hop" | "solo" | "duel";

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
/** One gnome at time k (ms) of the solo act's 3.6 s: a roll of two turns
 *  about his middle (a tall hat stays in frame, never under the ground), a
 *  wobble as he rights himself, a blink, then a hop. */
function soloAt(g: Gnome, k: number) {
  const { body, eyes, mid } = g.userData;
  const roll = Math.min(k / 1300, 1), wob = k > 1300 && k < 1800 ? (1800 - k) / 500 : 0, a = ease(roll) * Math.PI * 4;
  body.rotation.set(a, 0.35, Math.sin(k / 45) * 0.18 * wob);
  const hop = k > 2900 && k < 3300 ? Math.sin(((k - 2900) / 400) * Math.PI) * 0.34 : 0;
  // (turned about his middle: his body's centre goes round it)
  body.position.set(0, mid * (1 - Math.cos(a)) + hop, -mid * Math.sin(a));
  for (const e of eyes || []) e.scale.y = k > 2300 && k < 2430 ? 0.12 : 1;
  return hop;
}

/** A turntable for the gnome picker, and the game's choice's panels (act; a
 *  duel's ghost hops beside him in "duel"): its own small renderer, nothing
 *  else. Still, it holds the pose it stopped in and draws nothing more until
 *  it plays again (a panel plays under the pointer only). */
export function makePreview(canvas: HTMLCanvasElement, { act = "hop", still = false }: { act?: Act; still?: boolean } = {}) {
  const renderer = makeRenderer(canvas);
  const scene = makeScene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.95, 4.2);
  camera.lookAt(0, 0.38, 0); // pompom at the top of a hop to the shadow, in frame
  let gnome: Gnome | null = null, alive = true;
  // the ghost, a step to his right
  const rival = act === "duel" ? makeGhost(0.55).ball : null;
  if (rival) (rival.scale.setScalar(0.82), rival.position.set(0.46, 0, -0.25), scene.add(rival), camera.position.setZ(5.2)); // (the pair, a step back: room at both sides)
  // the act's own clock: it runs only while playing (and never under reduced motion)
  let t = 0, last = 0, playing = !still, drawn = false;
  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    drawn = false;
  };
  const tick = (now: number) => {
    if (!alive) return;
    requestAnimationFrame(tick);
    const dt = last ? Math.min(now - last, 50) : 0;
    last = now;
    if (playing && motion) t += dt;
    else if (drawn) return;
    if (gnome) {
      const { body, shade } = gnome.userData;
      let hop: number;
      if (act === "solo") hop = soloAt(gnome, t % 3600);
      else {
        // he hops, turning; his shadow stays on the ground and shrinks as he rises
        hop = Math.abs(Math.sin((t + 900) / 380)) * 0.22;
        body.rotation.y = Math.sin((t + 900) / 1400) * 0.7;
        body.position.y = hop;
      }
      shade.scale.setScalar(1 - hop * 1.6);
      shade.material.opacity = 0.18 * (1 - hop * 1.4);
      gnome.userData.tick?.(t); // (a Legendary's piece moves with the act)
    }
    // the ghost hops when he lands: their turns
    if (rival) {
      rival.userData.body.position.y = Math.abs(Math.cos((t + 900) / 380)) * 0.22;
      rival.userData.body.rotation.y = -Math.sin((t + 900) / 1400) * 0.7;
    }
    renderer.render(scene, camera);
    drawn = true;
  };
  size();
  requestAnimationFrame(tick);
  return {
    show(skin: Skin) {
      if (gnome) {
        scene.remove(gnome);
        disposeCourse(gnome);
      }
      gnome = makeBall(skin);
      gnome.scale.setScalar(0.82); // room above the hat for the hop
      gnome.userData.shade.position.y = -BALL_R + 0.02; // right under him, in frame
      if (rival) gnome.position.x = -0.42;
      scene.add(gnome);
      drawn = false;
    },
    /** Plays the act, or holds it where it is. */
    play(on: boolean) {
      playing = on;
    },
    resize: size,
    destroy() {
      alive = false;
      for (const g of [gnome, rival]) if (g) disposeCourse(g);
      renderer.dispose();
      releaseShared();
      renderer.forceContextLoss();
    },
  };
}
