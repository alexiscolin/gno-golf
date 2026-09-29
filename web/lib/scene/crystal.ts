// The Crystal Mines' decor: a crystal cluster on its rock, in the worlds'
// own toon (the shared bands and ink hulls). The cup card's still shows it
// (titlebake.ts); the mines world will scatter it.
import * as THREE from "three";
import { flat, drawn, glowTex, share } from "./materials";

const ROCK = 0xb0a6e2, ROCK_DARK = 0x8f82c6;
// the crystals: a cool glow of their own (emissive), their facets in the
// toon bands
const CYAN = share(flat(0x7fe0f7, { emissive: 0x3fc4ec, emissiveIntensity: 0.55 }));
const VIOLET = share(flat(0xc7a6ff, { emissive: 0x9a6ff0, emissiveIntensity: 0.5 }));
let glowMat: THREE.SpriteMaterial | null = null;
const glow = () => (glowMat ||= share(new THREE.SpriteMaterial({ map: glowTex(), color: 0x8fe8ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })));

/** A six-sided prism with a pointed tip, its foot at 0: r wide, h tall. */
const prism = (r: number, h: number) =>
  new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h), new THREE.Vector2(0, h + r * 1.6)], 6);

// [x, z, radius, height, lean (outwards, per unit off the middle), violet]
const SHARDS: readonly (readonly [number, number, number, number, number, boolean])[] = [
  [0, 0, 0.42, 2.5, 0, false],
  [0.55, 0.15, 0.32, 1.8, 0.55, false],
  [-0.55, 0.2, 0.34, 2, 0.45, true],
  [0.15, -0.55, 0.28, 1.5, 0.6, true],
  [-0.35, -0.45, 0.24, 1.2, 0.8, false],
  [0.4, 0.62, 0.22, 1.1, 0.8, true],
  [-0.2, 0.7, 0.18, 0.8, 0.9, false],
  [0.9, -0.3, 0.18, 0.8, 0.9, true],
];

/** A crystal cluster on its rock, its foot at 0, about 3 across and 3 tall. */
export function crystals() {
  const g = new THREE.Group();
  const rock = drawn(new THREE.DodecahedronGeometry(1.5, 0), flat(ROCK));
  rock.scale.set(1, 0.42, 0.9);
  rock.position.y = 0.3;
  const pebble = drawn(new THREE.DodecahedronGeometry(0.42, 0), flat(ROCK_DARK));
  pebble.position.set(-1.3, 0.15, 0.9);
  g.add(rock, pebble);
  for (const [x, z, r, h, lean, violet] of SHARDS) {
    const s = drawn(prism(r, h).rotateY(x * 1.7 + z), violet ? VIOLET : CYAN);
    s.position.set(x, 0.55, z);
    s.rotation.set(z * lean, 0, -x * lean);
    g.add(s);
  }
  // a soft halo behind them
  const light = new THREE.Sprite(glow());
  light.scale.set(5.5, 5.5, 1);
  light.position.set(-0.8, 1.6, -1);
  g.add(light);
  return g;
}
