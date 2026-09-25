import * as THREE from "three";
import { BALL_R } from "../terrain.js";
import { C, flat, inked, disposeCourse, texOf } from "./materials.js";
import { makeRenderer, makeScene } from "./camera.js";
import { bake } from "./bake.js";

/** The ball is a gnome. Which one is the player's choice — cosmetic only: the
 *  chain moves a point, it never hears about beards. */
export const GNOMES = [
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
  // earned, not given: see lib/card.js
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
  { id: "king", unlock: "king", name: "The Gnome King", line: "The grand slam: every cup at par or under. Bow.",
    hat: C.cap, crown: true, beard: "long", hair: 0xffffff, body: 0xf2c14e, cape: true },
];

/** Horizontal stripes on the body (the pirate's shirt). */
function stripedBody([a, b]) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d");
  for (let k = 0; k < 8; k++) {
    x.fillStyle = "#" + new THREE.Color(k % 2 ? b : a).getHexString();
    x.fillRect(0, k * 4, 32, 4);
  }
  const t = texOf(c);
  return flat(0xffffff, { map: t });
}

export const gnomeById = (id) => GNOMES.find((g) => g.id === id) || GNOMES[0];

function beardOf(k, hair) {
  const m = flat(hair);
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
  }
  return g;
}

export function makeBall(skin = GNOMES[0]) {
  const g = new THREE.Group();
  g.add(inked(new THREE.SphereGeometry(0.55, 22, 16), skin.stripes ? stripedBody(skin.stripes) : flat(skin.body || C.cream)));

  const hat = new THREE.Group();
  if (skin.shape === "tricorn") {
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
    const cone = inked(new THREE.ConeGeometry(0.5, skin.tall ? 1.6 : 1.15, 16), flat(skin.hat));
    if (skin.tall) cone.position.y = 0.22;
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
  const brim = inked(new THREE.TorusGeometry(skin.helmet ? 0.5 : skin.shape === "tophat" ? 0.5 : 0.37, 0.075, 8, 22), flat(skin.helmet ? C.woodDark : skin.hat));
  if (skin.shape === "tricorn" || skin.shape === "toque") brim.visible = false;
  brim.rotation.x = Math.PI / 2;
  brim.position.y = -0.2;
  hat.add(brim);
  if (skin.pompom) {
    const pom = inked(new THREE.SphereGeometry(0.17, 10, 8), flat(0xffffff));
    pom.position.y = 0.6;
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

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), flat(C.ink));
    eye.position.set(side * 0.18, 0.08, 0.5);
    g.add(eye);
    eyes.push(eye);
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
  g.add(nose, beardOf(skin.beard, skin.hair));

  const shade = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_R * 1.1, 20),
    new THREE.MeshBasicMaterial({ color: C.ink, transparent: true, opacity: 0.18, depthWrite: false })
  );
  shade.rotation.x = -Math.PI / 2;

  // one draw for the whole gnome (per shader), the eyes apart: they blink
  for (const e of eyes) e.userData.live = true;
  bake(g);
  // the body is exactly the ball the chain rolls (Field.Radius), so a gnome
  // against a wall touches it instead of sinking into it
  g.scale.setScalar(BALL_R / 0.55);

  const root = new THREE.Group();
  root.add(g, shade);
  root.userData.body = g;
  root.userData.eyes = eyes;
  root.userData.shade = shade;
  return root;
}

/** A turntable for the gnome picker: its own small renderer, nothing else. */
export function makePreview(canvas) {
  const renderer = makeRenderer(canvas);
  const scene = makeScene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.95, 4.2);
  camera.lookAt(0, 0.38, 0); // pompom at the top of a hop to the shadow, in frame
  let gnome = null, alive = true;
  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const tick = (now) => {
    if (!alive) return;
    requestAnimationFrame(tick);
    if (gnome) {
      // the gnome hops; his shadow stays on the ground and shrinks as he rises
      const hop = Math.abs(Math.sin(now / 380)) * 0.22;
      const { body, shade } = gnome.userData;
      body.rotation.y = Math.sin(now / 1400) * 0.7;
      body.position.y = hop;
      shade.scale.setScalar(1 - hop * 1.6);
      shade.material.opacity = 0.18 * (1 - hop * 1.4);
    }
    renderer.render(scene, camera);
  };
  size();
  requestAnimationFrame(tick);
  return {
    show(skin) {
      if (gnome) {
        scene.remove(gnome);
        disposeCourse(gnome);
      }
      gnome = makeBall(skin);
      gnome.scale.setScalar(0.82); // room above the hat for the hop
      gnome.userData.shade.position.y = -BALL_R + 0.02; // right under him, in frame
      scene.add(gnome);
    },
    resize: size,
    destroy() {
      alive = false;
      if (gnome) disposeCourse(gnome);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
