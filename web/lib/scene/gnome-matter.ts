// What a gnome is made of (Skin.material: an Epic's, a Legendary's), in the
// game's own drawing: still flat bands of light under an ink line, but each
// material its own bands and marks (docs/gnomes/design.md, "Materials").
// Polished things (metal, glaze, porcelain, crystal, frost) get a fourth,
// bright band and a glint; wood its grain, stone its speckle, wool its
// stitches, gingerbread its icing; neon trades the ink line for a lit one,
// lava glows through its cracks. Colours stay the skin's: a material is how
// the light takes them.
import * as THREE from "three";
import { flat, hullOf, share, texOf } from "./materials";
import { seeded } from "./common";
import { md } from "./data";
import type { Material } from "../gnomes/vocab";
import type { Skin } from "./gnome";

/** The parts of a gnome a material dresses: his body, his hat's, his beard's, and his prop's that take it. */
export interface Dressed {
  body: THREE.Mesh;
  hat: THREE.Mesh[];
  beard: THREE.Mesh[];
  prop: THREE.Mesh[];
}

/** Materials that dress the beard too: a statue's, a knitted toy's, frost. */
const WHOLE: ReadonlySet<Material> = new Set(["stone", "wool", "crystal", "frost"]);

// light in bands, as materials.ts does it; a polished thing has a fourth,
// narrow and bright: its shine
const bands = (levels: number[]) => {
  const t = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return share(t);
};
const SHINE = bands([92, 165, 225, 225, 255]), MATTE = bands([128, 196, 240]);

const css = (v: number) => "#" + new THREE.Color(v).getHexString();
/** A small canvas, painted: the texture of a material in two colours. */
function painted(key: string, paint: (x: CanvasRenderingContext2D, rand: () => number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  paint(c.getContext("2d")!, seeded(key));
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// each material's marks, on a 64-pixel square round the part (base, detail)
const MARKS: Partial<Record<Material, (x: CanvasRenderingContext2D, r: () => number, a: string, b: string) => void>> = {
  wood: (x, r, a, b) => {
    // fine grain running down, half seen: a carving, not a barrel
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1, x.globalAlpha = 0.4;
    for (let k = 0; k < 9; k++) {
      x.beginPath();
      const x0 = k * 7 + r() * 3;
      for (let i = 0; i <= 64; i += 8) x.lineTo(x0 + Math.sin(i / 9 + k) * 2.2, i);
      x.stroke();
    }
  },
  porcelain: (x, _, a, b) => {
    // a painted band of rings and dots round the middle, a line above and below
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.fillStyle = b, x.lineWidth = 1.5;
    for (const y of [24, 42]) x.beginPath(), x.moveTo(0, y), x.lineTo(64, y), x.stroke();
    for (let i = 0; i < 4; i++) x.beginPath(), x.arc(i * 16 + 8, 33, 4.5, 0, Math.PI * 2), x.stroke(), x.beginPath(), x.arc(i * 16 + 8, 33, 1.5, 0, Math.PI * 2), x.fill();
  },
  stone: (x, r, a, b) => {
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.fillStyle = b;
    for (let i = 0; i < 46; i++) x.beginPath(), x.arc(r() * 64, r() * 64, 0.6 + r() * 1.6, 0, Math.PI * 2), x.fill();
  },
  wool: (x, _, a, b) => {
    // rows of knitted Vs
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1.2;
    for (let y = 2; y < 64; y += 6) for (let i = 0; i < 64; i += 6) x.beginPath(), x.moveTo(i, y), x.lineTo(i + 3, y + 4), x.lineTo(i + 6, y), x.stroke();
  },
  gingerbread: (x, _, a, b) => {
    // icing: a wavy line round the middle and a row of dots
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.fillStyle = b, x.lineWidth = 2.4, x.beginPath();
    for (let i = 0; i <= 64; i += 4) x.lineTo(i, 30 + (i % 8 ? 3 : -3));
    x.stroke();
    for (let i = 0; i < 4; i++) x.beginPath(), x.arc(i * 16 + 8, 42, 2, 0, Math.PI * 2), x.fill();
  },
  lava: (x, r, a, b) => {
    // a crust split by glowing cracks (the same lines lit, as the emissive map)
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1.8;
    for (let k = 0; k < 7; k++) {
      x.beginPath();
      let px = r() * 64, py = r() * 64;
      x.moveTo(px, py);
      for (let i = 0; i < 4; i++) x.lineTo((px += (r() - 0.5) * 26), (py += (r() - 0.5) * 26));
      x.stroke();
    }
  },
  frost: (x, r, a, b) => {
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const cx = r() * 64, cy = r() * 64, s = 2 + r() * 3;
      for (let k = 0; k < 3; k++) x.beginPath(), x.moveTo(cx - s * Math.cos(k), cy - s * Math.sin(k)), x.lineTo(cx + s * Math.cos(k), cy + s * Math.sin(k)), x.stroke();
    }
  },
};

const made = new Map<string, THREE.Material>();
/** A material's surface in a colour, its detail in another (made once per kind and pair, kept). */
function surface(kind: Material, base: number, detail: number): THREE.Material {
  const key = `${kind}:${base}:${detail}`;
  let m = made.get(key);
  if (m) return m;
  const marks = MARKS[kind], map = marks ? share(painted(key, (x, r) => marks(x, r, css(base), css(detail)))) : null;
  const polished = kind === "metal" || kind === "glaze" || kind === "porcelain" || kind === "crystal" || kind === "frost";
  const opts: THREE.MeshToonMaterialParameters = { gradientMap: polished ? SHINE : kind === "stone" ? MATTE : undefined };
  if (map) opts.map = map;
  if (kind === "lava") Object.assign(opts, { emissive: detail, emissiveMap: map, emissiveIntensity: 0.8 });
  if (kind === "metal") opts.emissive = new THREE.Color(base).multiplyScalar(0.08);
  if (kind === "crystal") Object.assign(opts, { transparent: true, opacity: 0.86, emissive: new THREE.Color(detail).multiplyScalar(0.25) });
  m = share(flat(map ? 0xffffff : base, opts));
  if (kind === "crystal") md(m).base = 0.86; // see-through as ice is: a ghost fades it from there
  made.set(key, m);
  return m;
}

const GLINT = share(new THREE.MeshBasicMaterial({ color: 0xffffff }));
/** A polished thing's glint: two white dabs where the light hits the body. */
function glint(g: THREE.Group) {
  for (const [dir, r] of [[[-0.5, 0.42, 0.75], 0.07], [[-0.62, 0.22, 0.75], 0.035]] as const) {
    const n = new THREE.Vector3(...dir).normalize(), d = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), GLINT);
    d.position.copy(n).multiplyScalar(0.548);
    d.scale.set(1, 0.65, 0.25);
    d.lookAt(n.clone().multiplyScalar(2));
    g.add(d);
  }
}

/**
 * Dresses a gnome in his material: the parts' surfaces swapped (each keeping
 * its own colour), a crystal body cut into facets, a neon one's ink lit, a
 * metal one's band and glint. Returns what moves with time (lava's glow), or
 * null. Nothing for a toon gnome.
 */
export function dressMatter(g: THREE.Group, skin: Skin, parts: Dressed): ((t: number) => void) | null {
  const kind = skin.material;
  if (!kind) return null;
  const detail = skin.materialColor ?? 0xffffff;
  const dress = (o: THREE.Mesh) => {
    const v = (o.material as THREE.MeshToonMaterial).color?.getHex() ?? 0xffffff;
    o.material = surface(kind, v, detail);
  };
  [parts.body, ...parts.hat, ...parts.prop, ...(WHOLE.has(kind) ? parts.beard : [])].forEach(dress);
  if (kind === "crystal") {
    // the body cut into facets: the same ball, flat faces
    const facets = new THREE.IcosahedronGeometry(0.55, 1);
    facets.computeVertexNormals(); // (not indexed: each face its own normal, a facet)
    for (const o of parts.body.parent!.children) if (o instanceof THREE.Mesh) o.geometry = facets;
  }
  if (kind === "neon") {
    // its ink line lit, a little heavier: a sign at night
    const line = hullOf(0.04, detail);
    g.traverse((o) => o instanceof THREE.Mesh && md(o.material as THREE.Material).hull && (o.material = line));
  }
  if (kind === "metal") {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.548, 0.035, 6, 32), surface("metal", detail, detail));
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.1;
    g.add(band);
  }
  if (kind === "metal" || kind === "glaze" || kind === "porcelain" || kind === "frost") glint(g);
  if (kind === "lava") {
    const m = parts.body.material as THREE.MeshToonMaterial;
    return (t) => (m.emissiveIntensity = 0.65 + 0.35 * Math.sin(t / 700));
  }
  return null;
}
