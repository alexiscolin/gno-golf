// The Crystal Mines' signs (the owner: "affordance to know what to do, a
// clearly visible sign", "the same for the non-obvious things"): old mine
// signage at the approach of every piece a player could not guess — enamel
// plates on iron (yellow for a danger, cream for a clock), painted planks for
// a way to take — a big pictogram and a word or three in the site's font,
// bolted across two pit props or hung on chains over the void (4 off the lane), a lantern on
// top lighting it. Read from the hole's data: a skin names its sign (SIGN_OF),
// the lane's distance from the tee (a flood through the rails and tunnels)
// says where its approach is, and the sign stands off the lane there, never
// in front of it from the camera, clear of every piece, ride and hazard.
// Decor only: nothing here is in the physics. The hole's own pieces are
// signed with the decor (signs); a stroke's pulse pieces (the tide, the
// dynamite, a rockfall...) with the stroke's extras, from what the chain has
// shown of them so far (pulseSigns). Every face is one shared texture: the
// decor's bake merges the signs with the rest (a draw for the faces).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { relief, share, texOf } from "./materials";
import { seeded, type Rand } from "./common";
import { inZone, inSea, segDist, boxOf, type Terrain } from "../terrain";
import { MINES, darkGallery, chamferField } from "./mines-kit";
import { INK, INK_THIN, chamfer, paint, log, boulder, vnoise, TIMBER, TIMBER_DARK, IRON, IRON_DARK, RUST } from "./mines-toon";
import { FONT } from "../brand";
import type { Hole, Height } from "./data";
import type { Extras, Vec2, Wall, Zone } from "../types";

// ------------------------------------------------------------ the signs

type Look = "warn" | "time" | "go";
interface Spec { words: string; look: Look; icon: (x: CanvasRenderingContext2D, c: Paint) => void }
interface Paint { fg: string; acc: string; bg: string }

/** What a skin's piece is signed as (and the timed ones only, for the few that are also plain decor). */
const SIGN_OF: Record<string, string> = {
  cage: "cage", lift: "lift", geyser: "geyser", "cable car": "cablecar", "cart ride": "ride",
  "cage door": "doors", "swing door": "doors", "safe door": "doors", tripwire: "doors", "vault door": "vault", "crystal gate": "gates",
  cart: "carts", turntable: "turntable", pickaxe: "pick", stamp: "stamps", paddle: "wheel", piston: "pistons", drill: "drill",
  "lava fall": "falls", stalactite: "stalactites", "lava tide": "tide", dynamite: "blast", rockfall: "rockfall", crumble: "crumbles",
  boulder: "boulder", bat: "bats", corkscrew: "power", kicker: "power", magnet: "magnet", vent: "steam", booster: "steam",
  conveyor: "belt", hopper: "chute", "ore chute": "chute", adit: "adit", ladder: "ladder", "rope bridge": "sway",
  "crystal bumper": "kick", "jewel bumper": "jewels", "ledge bank": "banked", ice: "slippery", gold: "slippery",
  lava: "hot", "hot spring": "hot",
};
/** Skins signed only when timed (their untimed pieces are plain: the drill's hub, a steady rope bridge). */
const TIMED_ONLY = new Set(["drill", "rope bridge"]);

const INKC = "#1a1320", RED = "#c8392b", CREAM = "#f4ead2", AMBER = "#ffb23b";
const PAINTS: Record<Look, Paint> = {
  warn: { fg: INKC, acc: RED, bg: "#f2c02e" },
  time: { fg: INKC, acc: RED, bg: "#efe4c8" },
  go: { fg: CREAM, acc: AMBER, bg: "#8a5a31" },
};

// the pictograms, drawn in a 100 × 100 box (y down)
type X = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
function line(x: X, c: string, w: number, ...p: number[]) {
  x.strokeStyle = c;
  x.lineWidth = w;
  x.beginPath();
  x.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
  x.stroke();
}
function poly(x: X, c: string, ...p: number[]) {
  x.fillStyle = c;
  x.beginPath();
  x.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
  x.closePath();
  x.fill();
}
function disc(x: X, c: string, cx: number, cy: number, r: number, ring = 0, ringC = c) {
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  if (c) (x.fillStyle = c), x.fill();
  if (ring) (x.strokeStyle = ringC), (x.lineWidth = ring), x.stroke();
}
function box(x: X, c: string, x0: number, y0: number, w: number, h: number, r = 4, ring = 0, ringC = c) {
  x.beginPath();
  x.roundRect(x0, y0, w, h, r);
  if (c) (x.fillStyle = c), x.fill();
  if (ring) (x.strokeStyle = ringC), (x.lineWidth = ring), x.stroke();
}
function arrow(x: X, c: string, w: number, x0: number, y0: number, x1: number, y1: number, head = 12) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  line(x, c, w, x0, y0, x1 - Math.cos(a) * head * 0.5, y1 - Math.sin(a) * head * 0.5);
  poly(x, c, x1, y1, x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head, x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head);
}
/** A clock face: the "on a clock" of every timed piece. */
function clock(x: X, c: Paint, cx: number, cy: number, r: number) {
  disc(x, c.bg, cx, cy, r, 5, c.acc);
  line(x, c.fg, 4, cx, cy - r * 0.62, cx, cy, cx + r * 0.5, cy + r * 0.2);
}
function cart(x: X, c: Paint, dx: number, dy: number) {
  poly(x, c.fg, 16 + dx, 38 + dy, 84 + dx, 38 + dy, 76 + dx, 70 + dy, 24 + dx, 70 + dy);
  line(x, c.bg, 3, 22 + dx, 48 + dy, 78 + dx, 48 + dy);
  disc(x, c.fg, 33 + dx, 76 + dy, 8, 3, c.bg);
  disc(x, c.fg, 67 + dx, 76 + dy, 8, 3, c.bg);
}
function cageBars(x: X, c: Paint, x0: number, y0: number, w: number, h: number) {
  box(x, "", x0, y0, w, h, 3, 6, c.fg);
  for (let k = 1; k < 3; k++) line(x, c.fg, 4, x0 + (w * k) / 3, y0, x0 + (w * k) / 3, y0 + h);
  line(x, c.fg, 4, x0 + w / 2, y0, x0 + w / 2, y0 - 16);
}
function bounce(x: X, c: Paint) {
  line(x, c.acc, 6, 94, 18, 62, 46);
  arrow(x, c.acc, 6, 62, 46, 92, 76);
  disc(x, c.acc, 94, 18, 7);
}

const SIGNS: Record<string, Spec> = {
  cage: { words: "CATCH THE CAGE", look: "time", icon: (x, c) => {
    line(x, c.fg, 3, 14, 4, 14, 96), line(x, c.fg, 3, 70, 4, 70, 96);
    cageBars(x, c, 22, 22, 40, 50);
    clock(x, c, 78, 76, 18);
  } },
  soft: { words: "COME IN SOFT", look: "warn", icon: (x, c) => {
    cageBars(x, c, 50, 26, 44, 56);
    line(x, c.acc, 5, 2, 50, 14, 50), line(x, c.acc, 5, 6, 62, 16, 62);
    disc(x, c.fg, 28, 56, 10);
    arrow(x, c.fg, 5, 40, 56, 60, 56, 12);
    x.strokeStyle = c.acc;
    x.lineWidth = 5;
    x.beginPath();
    for (let k = 0; k <= 8; k++) x.lineTo(46 + k * 6, 92 + 3 * Math.sin(k * 1.6));
    x.stroke();
  } },
  lift: { words: "GREEN LAMP GO", look: "time", icon: (x, c) => {
    cageBars(x, c, 14, 24, 46, 56);
    disc(x, "#3fbf5f", 80, 30, 11, 4, c.fg);
    disc(x, RED, 80, 66, 11, 4, c.fg);
  } },
  geyser: { words: "GEYSER", look: "go", icon: (x, c) => {
    poly(x, c.fg, 36, 92, 42, 44, 58, 44, 64, 92);
    disc(x, c.fg, 38, 40, 11), disc(x, c.fg, 50, 32, 13), disc(x, c.fg, 62, 40, 11);
    disc(x, c.acc, 50, 12, 8);
    arrow(x, c.acc, 6, 14, 88, 14, 30, 14), arrow(x, c.acc, 6, 86, 88, 86, 30, 14);
  } },
  cablecar: { words: "CABLE CAR", look: "go", icon: (x, c) => {
    line(x, c.fg, 5, 0, 24, 100, 8);
    line(x, c.fg, 4, 50, 16, 50, 36);
    box(x, c.fg, 26, 36, 48, 38, 8);
    box(x, c.bg, 32, 42, 16, 14, 2), box(x, c.bg, 52, 42, 16, 14, 2);
    disc(x, c.acc, 50, 84, 8);
  } },
  ride: { words: "RIDE THE CART", look: "go", icon: (x, c) => {
    disc(x, c.acc, 50, 32, 9);
    cart(x, c, 0, 0);
    line(x, c.fg, 5, 4, 90, 96, 90);
    line(x, c.acc, 4, 2, 48, 12, 48), line(x, c.acc, 4, 0, 60, 12, 60);
  } },
  drill: { words: "TIME THE DRILL", look: "time", icon: (x, c) => {
    disc(x, "", 44, 50, 34, 7, c.fg);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      line(x, c.fg, 6, 44, 50, 44 + Math.cos(a) * 34, 50 + Math.sin(a) * 34);
      poly(x, c.fg, 44 + Math.cos(a - 0.14) * 38, 50 + Math.sin(a - 0.14) * 38, 44 + Math.cos(a) * 48, 50 + Math.sin(a) * 48, 44 + Math.cos(a + 0.14) * 38, 50 + Math.sin(a + 0.14) * 38);
    }
    disc(x, c.fg, 44, 50, 9);
    clock(x, c, 82, 82, 16);
  } },
  doors: { words: "TIME THE DOORS", look: "time", icon: (x, c) => {
    box(x, c.fg, 8, 14, 30, 72, 3), box(x, c.fg, 46, 14, 30, 72, 3);
    line(x, c.bg, 3, 14, 22, 32, 22), line(x, c.bg, 3, 52, 22, 70, 22);
    disc(x, c.bg, 32, 52, 3), disc(x, c.bg, 52, 52, 3);
    clock(x, c, 82, 80, 17);
  } },
  vault: { words: "WATCH THE DIAL", look: "time", icon: (x, c) => {
    disc(x, c.fg, 50, 54, 40);
    disc(x, "", 50, 54, 29, 4, c.bg);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.5;
      line(x, c.bg, 6, 50 - Math.cos(a) * 18, 54 - Math.sin(a) * 18, 50 + Math.cos(a) * 18, 54 + Math.sin(a) * 18);
    }
    disc(x, c.bg, 50, 54, 6);
    poly(x, c.acc, 42, 2, 58, 2, 50, 14);
  } },
  gates: { words: "TIME THE GATES", look: "time", icon: (x, c) => {
    for (const [cx, up] of [[16, 0], [40, -16], [64, 0]] as const) poly(x, up ? c.acc : c.fg, cx - 8, 26 + up, cx, 16 + up, cx + 8, 26 + up, cx + 8, 80 + up, cx - 8, 80 + up);
    line(x, c.fg, 4, 2, 86, 76, 86);
    clock(x, c, 84, 76, 15);
  } },
  carts: { words: "MIND THE CARTS", look: "warn", icon: (x, c) => {
    cart(x, c, 0, 4);
    line(x, c.fg, 5, 2, 94, 98, 94);
    arrow(x, c.acc, 6, 30, 18, 4, 18), arrow(x, c.acc, 6, 70, 18, 96, 18);
  } },
  turntable: { words: "TURNS EACH STROKE", look: "time", icon: (x, c) => {
    disc(x, "", 50, 54, 32, 6, c.fg);
    line(x, c.fg, 5, 26, 44, 74, 64), line(x, c.fg, 5, 22, 56, 70, 76);
    x.strokeStyle = c.acc;
    x.lineWidth = 7;
    x.beginPath();
    x.arc(50, 54, 44, -2.6, -0.6);
    x.stroke();
    poly(x, c.acc, 50 + Math.cos(-0.6) * 44 + 8, 54 + Math.sin(-0.6) * 44 - 6, 50 + Math.cos(-0.6) * 44 + 6, 54 + Math.sin(-0.6) * 44 + 12, 50 + Math.cos(-0.6) * 44 - 10, 54 + Math.sin(-0.6) * 44 + 2);
  } },
  pick: { words: "MIND THE PICK", look: "warn", icon: (x, c) => {
    x.strokeStyle = c.acc;
    x.lineWidth = 5;
    x.beginPath();
    x.arc(50, 0, 84, 1.05, 2.09);
    x.stroke();
    for (const a of [1.05, 2.09]) {
      const px = 50 + Math.cos(a) * 84, py = Math.sin(a) * 84, d = a < 1.5 ? -1 : 1;
      poly(x, c.acc, px + d * 2, py + 12, px - d * 12, py - 2, px + d * 12, py - 6);
    }
    disc(x, c.fg, 50, 6, 6);
    line(x, c.fg, 7, 50, 6, 50, 64);
    x.fillStyle = c.fg;
    x.beginPath();
    x.moveTo(8, 80);
    x.quadraticCurveTo(50, 46, 92, 80);
    x.quadraticCurveTo(50, 62, 8, 80);
    x.fill();
  } },
  stamps: { words: "MIND THE STAMPS", look: "warn", icon: (x, c) => {
    line(x, c.fg, 6, 8, 8, 92, 8);
    line(x, c.fg, 8, 50, 8, 50, 40);
    box(x, c.fg, 28, 40, 44, 24, 3);
    arrow(x, c.acc, 6, 14, 30, 14, 80), arrow(x, c.acc, 6, 86, 30, 86, 80);
    line(x, c.fg, 5, 6, 90, 94, 90);
    disc(x, c.fg, 40, 82, 4), disc(x, c.fg, 58, 83, 5);
  } },
  wheel: { words: "TIME THE WHEEL", look: "time", icon: (x, c) => {
    disc(x, "", 44, 46, 28, 6, c.fg);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      line(x, c.fg, 7, 44 + Math.cos(a) * 14, 46 + Math.sin(a) * 14, 44 + Math.cos(a) * 42, 46 + Math.sin(a) * 42);
    }
    disc(x, c.fg, 44, 46, 8);
    clock(x, c, 82, 82, 16);
  } },
  pistons: { words: "MIND THE PISTONS", look: "warn", icon: (x, c) => {
    box(x, c.fg, 4, 30, 40, 36, 4);
    line(x, c.fg, 9, 44, 48, 74, 48);
    box(x, c.fg, 74, 24, 12, 48, 2);
    arrow(x, c.acc, 6, 50, 86, 94, 86);
    disc(x, "", 26, 16, 7, 4, c.fg), disc(x, "", 38, 8, 5, 4, c.fg);
  } },
  between: { words: "BETWEEN THE FALLS", look: "time", icon: (x, c) => {
    // the two curtains on their clock, the pool at their foot, the way past it along the far side
    for (const cx of [14, 66]) {
      x.strokeStyle = c.acc;
      x.lineWidth = 9;
      x.beginPath();
      x.moveTo(cx, 2);
      for (let y = 2; y <= 96; y += 12) x.lineTo(cx + (y % 24 ? 4 : -4), y);
      x.stroke();
    }
    x.fillStyle = c.acc;
    x.beginPath();
    x.ellipse(40, 80, 18, 11, 0, 0, TAU);
    x.fill();
    arrow(x, c.fg, 7, 0, 30, 86, 30, 16);
    clock(x, c, 86, 78, 13);
  } },
  falls: { words: "TIME THE FALLS", look: "time", icon: (x, c) => {
    line(x, c.fg, 6, 4, 8, 76, 8);
    for (const cx of [20, 38, 56]) {
      x.strokeStyle = c.acc;
      x.lineWidth = 8;
      x.beginPath();
      x.moveTo(cx, 8);
      for (let y = 8; y <= 88; y += 10) x.lineTo(cx + (y % 20 ? 4 : -4), y);
      x.stroke();
    }
    clock(x, c, 82, 76, 16);
  } },
  stalactites: { words: "FALLING ROCK", look: "warn", icon: (x, c) => {
    line(x, c.fg, 6, 4, 8, 96, 8);
    poly(x, c.fg, 8, 8, 28, 8, 18, 44), poly(x, c.fg, 70, 8, 92, 8, 81, 40);
    poly(x, c.fg, 38, 44, 62, 44, 50, 88);
    line(x, c.acc, 4, 36, 20, 36, 36), line(x, c.acc, 4, 64, 20, 64, 36);
  } },
  tide: { words: "TIDE RISES", look: "warn", icon: (x, c) => {
    for (const [y, col] of [[84, c.fg], [64, c.fg], [44, c.acc]] as const) {
      x.strokeStyle = col;
      x.lineWidth = 7;
      x.beginPath();
      for (let k = 0; k <= 12; k++) x.lineTo(4 + k * 6, y + 5 * Math.sin(k * 1.4));
      x.stroke();
    }
    arrow(x, c.acc, 7, 90, 92, 90, 12, 16);
  } },
  blast: { words: "BLASTS OPEN", look: "warn", icon: (x, c) => {
    for (const x0 of [14, 32, 50]) box(x, c.acc, x0, 40, 16, 52, 3, 3, c.fg);
    line(x, c.fg, 7, 12, 64, 68, 64);
    x.strokeStyle = c.fg;
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(40, 40);
    x.quadraticCurveTo(48, 12, 74, 18);
    x.stroke();
    const star: number[] = [];
    for (let k = 0; k < 16; k++) star.push(80 + Math.cos((k / 16) * TAU) * (k % 2 ? 7 : 16), 16 + Math.sin((k / 16) * TAU) * (k % 2 ? 7 : 16));
    poly(x, c.fg, ...star);
  } },
  rockfall: { words: "NO WAY BACK", look: "warn", icon: (x, c) => {
    line(x, c.fg, 6, 4, 6, 96, 6);
    poly(x, c.fg, 20, 20, 36, 16, 42, 30, 30, 40, 16, 34);
    poly(x, c.fg, 56, 30, 74, 28, 78, 44, 62, 52);
    poly(x, c.fg, 8, 94, 30, 66, 50, 74, 64, 64, 92, 94);
    arrow(x, c.acc, 5, 28, 46, 28, 62, 10), arrow(x, c.acc, 5, 68, 56, 68, 70, 10);
  } },
  crumbles: { words: "CRUMBLES", look: "warn", icon: (x, c) => {
    poly(x, c.fg, 6, 26, 36, 26, 44, 36, 36, 46, 6, 46);
    poly(x, c.fg, 94, 26, 58, 26, 52, 34, 60, 46, 94, 46);
    poly(x, c.acc, 40, 62, 54, 58, 58, 72, 44, 76);
    poly(x, c.acc, 30, 82, 40, 80, 42, 92, 32, 94);
    line(x, c.fg, 3, 48, 50, 48, 56), line(x, c.fg, 3, 60, 62, 64, 68);
  } },
  boulder: { words: "ROLLING BOULDER", look: "warn", icon: (x, c) => {
    line(x, c.fg, 6, 4, 92, 96, 92);
    disc(x, c.fg, 54, 56, 32);
    line(x, c.bg, 4, 40, 40, 54, 54, 50, 72), line(x, c.bg, 4, 62, 34, 70, 50);
    line(x, c.acc, 5, 2, 40, 16, 40), line(x, c.acc, 5, 0, 56, 16, 56), line(x, c.acc, 5, 2, 72, 16, 72);
  } },
  bats: { words: "BATS MOVE", look: "warn", icon: (x, c) => {
    x.fillStyle = c.fg;
    x.beginPath();
    x.moveTo(50, 40);
    x.quadraticCurveTo(30, 20, 4, 30);
    x.quadraticCurveTo(14, 44, 10, 60);
    x.quadraticCurveTo(22, 52, 30, 62);
    x.quadraticCurveTo(38, 54, 50, 70);
    x.quadraticCurveTo(62, 54, 70, 62);
    x.quadraticCurveTo(78, 52, 90, 60);
    x.quadraticCurveTo(86, 44, 96, 30);
    x.quadraticCurveTo(70, 20, 50, 40);
    x.fill();
    poly(x, c.fg, 44, 36, 46, 26, 50, 32, 54, 26, 56, 36);
    arrow(x, c.acc, 5, 30, 88, 70, 88);
  } },
  power: { words: "FULL POWER", look: "go", icon: (x, c) => {
    x.lineCap = "butt";
    x.lineWidth = 12;
    x.strokeStyle = c.fg;
    x.beginPath();
    x.arc(50, 70, 40, Math.PI, Math.PI * 1.72);
    x.stroke();
    x.strokeStyle = c.acc;
    x.beginPath();
    x.arc(50, 70, 40, Math.PI * 1.74, Math.PI * 2);
    x.stroke();
    x.lineCap = "round";
    line(x, c.acc, 7, 50, 70, 50 + Math.cos(-0.3) * 34, 70 + Math.sin(-0.3) * 34);
    disc(x, c.fg, 50, 70, 8);
  } },
  magnet: { words: "MAGNETIC PULL", look: "warn", icon: (x, c) => {
    x.lineCap = "butt";
    x.strokeStyle = c.fg;
    x.lineWidth = 16;
    x.beginPath();
    x.moveTo(20, 14);
    x.lineTo(20, 44);
    x.arc(42, 44, 22, Math.PI, 0, true);
    x.lineTo(64, 14);
    x.stroke();
    x.lineCap = "round";
    box(x, c.acc, 12, 4, 16, 12, 1), box(x, c.acc, 56, 4, 16, 12, 1);
    disc(x, c.fg, 88, 80, 8);
    x.setLineDash([4, 6]);
    line(x, c.acc, 4, 78, 70, 62, 54), line(x, c.acc, 4, 86, 66, 78, 34);
    x.setLineDash([]);
  } },
  steam: { words: "STEAM JETS", look: "warn", icon: (x, c) => {
    box(x, c.fg, 16, 80, 68, 14, 2);
    for (const x0 of [26, 42, 58, 74]) line(x, c.bg, 3, x0, 83, x0, 91);
    for (const [cx, cy, r] of [[40, 64, 11], [58, 52, 13], [44, 34, 12], [62, 18, 11]] as const) disc(x, "", cx, cy, r, 5, c.fg);
    arrow(x, c.acc, 6, 12, 70, 12, 14);
  } },
  sway: { words: "BRIDGE SWAYS", look: "warn", icon: (x, c) => {
    line(x, c.fg, 7, 10, 34, 10, 84), line(x, c.fg, 7, 90, 34, 90, 84);
    for (const [y0, w] of [[40, 3], [58, 8]] as const) {
      x.strokeStyle = c.fg;
      x.lineWidth = w;
      x.beginPath();
      x.moveTo(10, y0);
      x.quadraticCurveTo(50, y0 + 26, 90, y0);
      x.stroke();
    }
    arrow(x, c.acc, 6, 44, 14, 16, 14, 12), arrow(x, c.acc, 6, 56, 14, 84, 14, 12);
  } },
  belt: { words: "BELT MOVES", look: "warn", icon: (x, c) => {
    box(x, "", 6, 44, 88, 30, 15, 6, c.fg);
    for (const cx of [21, 50, 79]) disc(x, c.fg, cx, 59, 7);
    box(x, c.fg, 30, 26, 16, 16, 2);
    arrow(x, c.acc, 7, 14, 90, 88, 90, 14);
  } },
  chute: { words: "CHUTE", look: "go", icon: (x, c) => {
    poly(x, c.fg, 12, 24, 88, 24, 60, 56, 60, 68, 40, 68, 40, 56);
    disc(x, c.acc, 50, 12, 8);
    arrow(x, c.acc, 7, 50, 72, 50, 98, 14);
  } },
  adit: { words: "SIDE PASSAGE", look: "go", icon: (x, c) => {
    x.fillStyle = c.fg;
    x.beginPath();
    x.moveTo(14, 92);
    x.lineTo(14, 50);
    x.arc(50, 50, 36, Math.PI, 0);
    x.lineTo(86, 92);
    x.closePath();
    x.fill();
    x.fillStyle = INKC;
    x.beginPath();
    x.moveTo(26, 92);
    x.lineTo(26, 52);
    x.arc(50, 52, 24, Math.PI, 0);
    x.lineTo(74, 92);
    x.closePath();
    x.fill();
    arrow(x, c.acc, 7, 50, 96, 50, 58, 14);
  } },
  ladder: { words: "LADDER DOWN", look: "go", icon: (x, c) => {
    line(x, c.fg, 7, 26, 4, 26, 96), line(x, c.fg, 7, 58, 4, 58, 96);
    for (let y = 16; y < 96; y += 16) line(x, c.fg, 6, 26, y, 58, y);
    arrow(x, c.acc, 7, 84, 24, 84, 86, 14);
  } },
  kick: { words: "CRYSTALS KICK", look: "warn", icon: (x, c) => {
    poly(x, c.fg, 38, 6, 56, 18, 56, 76, 38, 90, 20, 76, 20, 18);
    line(x, c.bg, 3, 38, 6, 38, 90);
    bounce(x, c);
  } },
  jewels: { words: "JEWELS KICK", look: "warn", icon: (x, c) => {
    poly(x, c.fg, 16, 30, 50, 30, 62, 44, 33, 86, 4, 44);
    line(x, c.bg, 3, 4, 44, 62, 44), line(x, c.bg, 3, 22, 30, 33, 86, 44, 30);
    bounce(x, c);
  } },
  banked: { words: "BANKED EDGE", look: "warn", icon: (x, c) => {
    line(x, c.fg, 8, 4, 36, 78, 72, 78, 96);
    disc(x, c.acc, 34, 38, 9);
    arrow(x, c.acc, 6, 44, 56, 74, 70, 12);
    line(x, c.fg, 3, 86, 70, 86, 96), line(x, c.fg, 3, 94, 76, 94, 96);
  } },
  slippery: { words: "SLIPPERY", look: "warn", icon: (x, c) => {
    disc(x, c.fg, 32, 26, 13);
    for (const dx of [0, 26]) {
      x.strokeStyle = c.fg;
      x.lineWidth = 6;
      x.beginPath();
      x.moveTo(34 + dx, 44);
      x.bezierCurveTo(14 + dx, 60, 54 + dx, 70, 30 + dx, 92);
      x.stroke();
    }
    line(x, c.acc, 5, 4, 94, 96, 94);
  } },
  dark: { words: "DARK GALLERY", look: "go", icon: (x, c) => {
    x.fillStyle = c.acc;
    x.globalAlpha = 0.55;
    poly(x, c.acc, 44, 44, 100, 18, 100, 72);
    x.globalAlpha = 1;
    x.fillStyle = c.fg;
    x.beginPath();
    x.arc(36, 62, 30, Math.PI, 0);
    x.closePath();
    x.fill();
    line(x, c.fg, 7, 0, 64, 72, 64);
    disc(x, c.acc, 40, 46, 9, 3, INKC);
  } },
  hot: { words: "HOT!", look: "warn", icon: (x, c) => {
    x.fillStyle = c.acc;
    x.beginPath();
    x.moveTo(50, 4);
    x.bezierCurveTo(74, 30, 88, 50, 76, 76);
    x.bezierCurveTo(68, 92, 32, 92, 24, 76);
    x.bezierCurveTo(14, 56, 30, 40, 36, 30);
    x.bezierCurveTo(40, 44, 46, 46, 48, 50);
    x.bezierCurveTo(54, 36, 54, 20, 50, 4);
    x.fill();
    x.fillStyle = c.bg;
    x.beginPath();
    x.moveTo(50, 50);
    x.bezierCurveTo(64, 62, 64, 80, 50, 84);
    x.bezierCurveTo(36, 80, 38, 66, 50, 50);
    x.fill();
    line(x, c.fg, 5, 4, 94, 96, 94);
  } },
  points: { words: "TIME THE POINTS", look: "time", icon: (x, c) => {
    line(x, c.fg, 5, 20, 96, 20, 4), line(x, c.fg, 5, 40, 96, 40, 4);
    for (const [w, bend] of [[5, 20], [5, 40]] as const) {
      x.strokeStyle = c.fg;
      x.lineWidth = w;
      x.beginPath();
      x.moveTo(bend, 70);
      x.quadraticCurveTo(bend, 40, bend + 40, 20);
      x.stroke();
    }
    line(x, c.acc, 6, 70, 80, 56, 60);
    clock(x, c, 82, 80, 16);
  } },
};

// ------------------------------------------------------------ the faces

/** One cell of the face atlas, 2:1: every sign's face in one texture (one draw). */
const CELL_W = 256, CELL_H = 128, COLS = 4;
const ORDER = Object.keys(SIGNS);
const ROWS = Math.ceil(ORDER.length / COLS);

/** The words over their room, in the fewest lines at the biggest size (1 to 3 lines). */
function words(x: X, text: string, x0: number, y0: number, w: number, h: number) {
  const ws = text.split(" ");
  const splits: string[][] = [[text]];
  for (let i = 1; i < ws.length; i++) {
    splits.push([ws.slice(0, i).join(" "), ws.slice(i).join(" ")]);
    for (let j = i + 1; j < ws.length; j++) splits.push([ws.slice(0, i).join(" "), ws.slice(i, j).join(" "), ws.slice(j).join(" ")]);
  }
  x.font = `700 100px ${FONT}`;
  let best = { size: 0, lines: [text] };
  for (const lines of splits) {
    const size = Math.min(32, h / (lines.length * 0.98), ...lines.map((l) => (w * 100) / x.measureText(l).width));
    if (size > best.size * 1.08) best = { size, lines };
  }
  x.font = `700 ${best.size.toFixed(1)}px ${FONT}`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  const lh = best.size * 0.98, top = y0 + h / 2 - (lh * (best.lines.length - 1)) / 2;
  best.lines.forEach((l, i) => x.fillText(l, x0 + w / 2, top + i * lh + best.size * 0.04));
}

/** A face: its enamel (or its paint on a plank), chipped and rusting at its edge, the pictogram and the words. */
function face(x: X, name: string, ox: number, oy: number) {
  const spec = SIGNS[name], c = PAINTS[spec.look], rand = seeded("sign-" + name);
  x.save();
  x.translate(ox, oy);
  x.beginPath();
  x.rect(0, 0, CELL_W, CELL_H);
  x.clip();
  x.lineCap = x.lineJoin = "round";
  if (spec.look === "go") {
    // a plank painted: the wood's grain under the paint, a painted border
    x.fillStyle = c.bg;
    x.fillRect(0, 0, CELL_W, CELL_H);
    for (let k = 0; k < 14; k++) {
      const y = 4 + k * 9 + rand() * 4;
      x.strokeStyle = k % 3 ? "rgba(60,34,16,0.35)" : "rgba(190,130,80,0.3)";
      x.lineWidth = 1.5 + rand() * 2;
      x.beginPath();
      x.moveTo(0, y);
      x.bezierCurveTo(80, y + (rand() - 0.5) * 8, 170, y + (rand() - 0.5) * 8, CELL_W, y + (rand() - 0.5) * 6);
      x.stroke();
    }
    box(x, "", 9, 9, CELL_W - 18, CELL_H - 18, 10, 4, c.fg);
  } else {
    // enamel: its colour, an ink border line, rust bleeding in at the edge
    x.fillStyle = c.bg;
    x.fillRect(0, 0, CELL_W, CELL_H);
    const rust = x.createLinearGradient(0, 0, 0, CELL_H);
    rust.addColorStop(0, "rgba(140,70,30,0.25)");
    rust.addColorStop(0.15, "rgba(140,70,30,0)");
    rust.addColorStop(0.8, "rgba(140,70,30,0)");
    rust.addColorStop(1, "rgba(140,70,30,0.45)");
    x.fillStyle = rust;
    x.fillRect(0, 0, CELL_W, CELL_H);
    box(x, "", 8, 8, CELL_W - 16, CELL_H - 16, 12, 6, INKC);
  }
  // the pictogram, big, on the left; the words on the right
  x.save();
  x.translate(14, 10);
  x.scale(1.08, 1.08);
  spec.icon(x, c);
  x.restore();
  x.lineCap = x.lineJoin = "round";
  x.fillStyle = c.fg;
  words(x, spec.words, 130, 18, CELL_W - 146, CELL_H - 36);
  // chips knocked out of the enamel (the dark iron under it, a rust ring) and scratches
  for (let k = 0; k < 6; k++) {
    const side = Math.floor(rand() * 4), u = rand();
    const px = side < 2 ? u * CELL_W : side === 2 ? 3 + rand() * 6 : CELL_W - 3 - rand() * 6;
    const py = side === 0 ? 3 + rand() * 6 : side === 1 ? CELL_H - 3 - rand() * 6 : u * CELL_H;
    const r = 3 + rand() * 6, pts: number[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, rr = r * (0.6 + rand() * 0.6);
      pts.push(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
    }
    poly(x, spec.look === "go" ? "rgba(60,34,16,0.8)" : "#7a3e20", ...pts);
    disc(x, spec.look === "go" ? "rgba(40,22,10,0.9)" : "#2e2a36", px, py, r * 0.45);
  }
  x.globalAlpha = 0.35;
  for (let k = 0; k < 3; k++) {
    const sx = 20 + rand() * (CELL_W - 40), sy = 20 + rand() * (CELL_H - 40), a = rand() * TAU, l = 10 + rand() * 16;
    line(x, spec.look === "go" ? "#2a1a0c" : "#ffffff", 1.2, sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l);
  }
  x.globalAlpha = 1;
  x.restore();
}

let atlas: THREE.CanvasTexture | null = null;
/** The faces' texture, drawn once (again once the site's font has come). */
function faces() {
  if (atlas) return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * ROWS;
  const x = canvas.getContext("2d")!;
  const draw = () => ORDER.forEach((n, i) => face(x, n, (i % COLS) * CELL_W, Math.floor(i / COLS) * CELL_H));
  draw();
  const t = (atlas = share(texOf(canvas)));
  t.anisotropy = 4;
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (fonts && !fonts.check(`700 40px ${FONT}`)) void fonts.load(`700 40px ${FONT}`).then(() => (draw(), (t.needsUpdate = true)), () => {});
  return t;
}
let faceMat: THREE.MeshBasicMaterial | null = null;
/** The faces' material: unlit (enamel catching the lamp: it reads in the dark), a hair under white. */
const faceMaterial = () => (faceMat ||= share(new THREE.MeshBasicMaterial({ map: faces(), color: 0xe8e2da })));

/** A face's quad (w × h, facing +z at z) on its cell of the atlas. */
function faceGeo(name: string, w: number, h: number, z: number, back = false) {
  const i = ORDER.indexOf(name), col = i % COLS, row = Math.floor(i / COLS);
  const g = new THREE.PlaneGeometry(w, h);
  const W = CELL_W * COLS, H = CELL_H * ROWS, e = 1.5;
  const u0 = (col * CELL_W + e) / W, u1 = ((col + 1) * CELL_W - e) / W, v1 = 1 - (row * CELL_H + e) / H, v0 = 1 - ((row + 1) * CELL_H - e) / H;
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
  if (back) g.rotateY(Math.PI);
  return g.translate(0, 0, back ? -z : z);
}

// ------------------------------------------------------------ the builds

const PW = 4.2, PH = 2.2, FW = 3.92, FH = 1.96; // the plate, its face
const CHAIN_UP = 11; // the chains of a hung sign, up into the vault's dark
// a hung sign a size down and high over the lane's level (its foot over a gnome's head): read from a rest
// beside it without filling the view
const HUNG_SCALE = 0.82, HUNG_Y = 3.7;
const unindexed = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
/** Pieces of iron and timber in one relief geometry (vertex colours): one mesh, merged. */
const merged = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => {
  const q = unindexed(g);
  for (const k of Object.keys(q.attributes)) if (!["position", "normal", "color"].includes(k)) q.deleteAttribute(k);
  return q;
}));
const tinted = (g: THREE.BufferGeometry, color: number, k = 1) => paint(g, (_x, _y, _z, c) => c.set(color).multiplyScalar(k));

/** The plate: iron rusting at its edges and riveted (enamel), or a plank with its nails (paint); its faces both sides. */
function plate(name: string) {
  const g = new THREE.Group(), go = SIGNS[name].look === "go", d = go ? 0.16 : 0.09;
  const body = chamfer(PW, PH, d, go ? 0.05 : 0.035);
  const base = new THREE.Color(go ? TIMBER : IRON), rust = new THREE.Color(go ? TIMBER_DARK : RUST);
  paint(body, (x, y, z, c) => {
    const edge = Math.min(PW / 2 - Math.abs(x), PH / 2 - Math.abs(y));
    c.copy(base).lerp(rust, Math.max(0, 1 - edge / 0.12) * 0.7 + 0.3 * Math.max(0, vnoise(x * 3 + z * 5, y * 3) - 0.6));
  });
  const heads: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const head = new THREE.SphereGeometry(go ? 0.045 : 0.06, 6, 3, 0, TAU, 0, Math.PI / 2).rotateX(sz * Math.PI / 2);
    heads.push(tinted(head.translate(sx * (FW / 2 - 0.12), sy * (FH / 2 - 0.12), sz * (d / 2 + 0.012)), IRON_DARK));
  }
  g.add(new THREE.Group().add(new THREE.Mesh(merged([body, ...heads]), relief()), new THREE.Mesh(body, INK_THIN)));
  const m = faceMaterial();
  g.add(new THREE.Mesh(faceGeo(name, FW, FH, d / 2 + 0.006), m), new THREE.Mesh(faceGeo(name, FW, FH, d / 2 + 0.006, true), m));
  return g;
}

/** A length of chain: iron links, alternate ones turned, n of them down from the top at 0. */
function links(n: number, x: number, z: number, top: number) {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const l = new THREE.TorusGeometry(0.075, 0.022, 4, 8).scale(0.7, 1.2, 1);
    if (k % 2) l.rotateY(Math.PI / 2);
    out.push(tinted(l.translate(x, top - 0.13 - k * 0.15, z), IRON, 0.9));
  }
  return out;
}

/**
 * A sign on its feet: two pit props planted in the floor, a stone at each
 * foot, the plate nailed across them, a cap beam over them with the lantern
 * standing on it; its origin on the floor, the plate facing +z.
 */
function standing(name: string, rand: Rand, lamp: () => THREE.Object3D) {
  const g = new THREE.Group(), cy = 2.5, top = cy + PH / 2 + 0.3;
  for (const sx of [-1, 1]) {
    const post = log(0.15, top + 0.3, TIMBER);
    post.position.set(sx * (PW / 2 - 0.4), -0.3, -0.2);
    post.rotation.y = rand() * 3;
    const stone = boulder(rand, 0.34, 0.2, 0.3, 0);
    stone.position.set(sx * (PW / 2 - 0.4) + sx * 0.12, 0.02, -0.1);
    g.add(post, stone);
  }
  const cap = new THREE.BoxGeometry(PW + 0.3, 0.2, 0.32);
  paint(cap, (x, y, _z, c) => c.set(TIMBER).multiplyScalar(0.8 + 0.2 * (y / 0.2 + 0.5) - 0.08 * Math.abs(x / PW)));
  const capMesh = new THREE.Group().add(new THREE.Mesh(cap, relief()), new THREE.Mesh(cap, INK_THIN));
  capMesh.position.set(0, top + 0.1, -0.12);
  const p = plate(name);
  p.position.set(0, cy, 0);
  p.rotation.z = (rand() - 0.5) * 0.03;
  const l = lamp();
  l.position.set(0, top + 0.2, 0.02);
  g.add(capMesh, p, l);
  return { g, lampAt: new THREE.Vector3(0, top + 0.45, 0.2) };
}

/**
 * A sign hung over the void: the plate on two short chains from a timber
 * bar, the bar on two chains going up into the vault's dark, the lantern
 * standing on the bar; its origin at the plate's centre, facing +z.
 */
function hanging(name: string, rand: Rand, lamp: () => THREE.Object3D) {
  const g = new THREE.Group(), barY = PH / 2 + 0.55;
  const p = plate(name);
  p.rotation.z = (rand() - 0.5) * 0.06;
  const bar = new THREE.BoxGeometry(PW + 0.4, 0.2, 0.26);
  paint(bar, (x, y, _z, c) => c.set(TIMBER).multiplyScalar(0.8 + 0.2 * (y / 0.2 + 0.5) - 0.08 * Math.abs(x / PW)));
  const barMesh = new THREE.Group().add(new THREE.Mesh(bar, relief()), new THREE.Mesh(bar, INK_THIN));
  barMesh.position.y = barY;
  // the short chains (links) and the long ones up into the dark: iron, fading to the vault's colour
  const iron: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) iron.push(...links(3, sx * (FW / 2 - 0.15), 0, barY - 0.1));
  const ups: THREE.BufferGeometry[] = [];
  const a = new THREE.Color(IRON), b = new THREE.Color(MINES.vault);
  for (const sx of [-1, 1]) {
    const up = new THREE.CylinderGeometry(0.03, 0.03, CHAIN_UP, 4, 6, true).translate(sx * (PW / 2 - 0.05), barY + CHAIN_UP / 2, 0);
    paint(up, (_x, y, _z, c) => c.copy(a).lerp(b, Math.min(1, Math.max(0, (y - barY - 1) / (CHAIN_UP * 0.55)))));
    ups.push(up);
  }
  iron.push(...ups);
  const chain = new THREE.Mesh(merged(iron), relief());
  const l = lamp();
  l.position.set(0, barY + 0.1, 0.02);
  g.add(p, barMesh, chain, l);
  return { g, lampAt: new THREE.Vector3(0, barY + 0.35, 0.2) };
}

/**
 * A sign on a bracket of its own, where there is no floor beside the lane
 * (a rock rib between two lanes, a shaft's collar): one pit prop up from its
 * foot (down on the rib, or down the shaft's wall), a cross-arm on top, the
 * plate (a size down) on short chains under the arm, in front of the prop
 * (side 0) or out to one side of it, and the lantern on the arm; its origin
 * at the prop's head on the ground, facing +z.
 */
const BRACKET = 0.72, ARM_Y = 4.9;
function bracketed(name: string, rand: Rand, lamp: () => THREE.Object3D, foot: number, side: number) {
  const g = new THREE.Group(), pw = PW * BRACKET, ph = PH * BRACKET, cx = side * (pw / 2 + 0.35);
  const post = log(0.14, ARM_Y + 0.15 - foot, TIMBER);
  post.position.set(0, foot, side ? 0 : -0.22);
  post.rotation.y = rand() * 3;
  const armW = side ? pw + 0.7 : pw + 0.3, arm = new THREE.BoxGeometry(armW, 0.2, 0.26);
  paint(arm, (x, y, _z, c) => c.set(TIMBER).multiplyScalar(0.8 + 0.2 * (y / 0.2 + 0.5) - 0.08 * Math.abs(x / armW)));
  const armMesh = new THREE.Group().add(new THREE.Mesh(arm, relief()), new THREE.Mesh(arm, INK));
  armMesh.position.set(side * (armW / 2 - 0.2), ARM_Y, side ? 0 : -0.22);
  const p = plate(name);
  p.scale.setScalar(BRACKET);
  const py = ARM_Y - 0.55 - ph / 2;
  p.position.set(cx, py, side ? 0 : 0.02);
  p.rotation.z = (rand() - 0.5) * 0.04;
  const iron = [...links(3, cx - pw / 2 + 0.25, side ? 0 : -0.1, ARM_Y - 0.1), ...links(3, cx + pw / 2 - 0.25, side ? 0 : -0.1, ARM_Y - 0.1)];
  const l = lamp();
  l.position.set(cx, ARM_Y + 0.1, side ? 0 : -0.22);
  g.add(post, armMesh, p, new THREE.Mesh(merged(iron), relief()), l);
  return { g, lampAt: new THREE.Vector3(cx, ARM_Y + 0.35, 0.2) };
}

// ------------------------------------------------------------ where they go

/** What the world's decor lends the signs: the floor and its room (mines.ts decor). */
export interface Ground {
  t: Terrain;
  /** a spot on the floor off the lane, clear of the rest (r: its radius, clear: its room from the lane) */
  ok: (x: number, z: number, r: number, clear?: number) => boolean;
  reserve: (x: number, z: number, r: number) => void;
  /** the floor's height */
  bank: Height;
  /** the world's lantern, and its light (a pool and a glow; the decor's only: the bake has run by a stroke's) */
  lamp: () => THREE.Object3D;
  light?: (p: THREE.Vector3) => void;
}

/** A hole's lane as the signs read it: the distance along it from the tee and from the lane, on a grid. */
interface Field {
  /** from the tee, along the lane, through its tunnels (Infinity where unreached or off it) */
  geo: Float32Array;
  /** from the lane (0 on it) */
  off: Float32Array;
  at: (x: number, z: number) => number;
}
const STEP = 0.5, MARGIN = 10;
const fields = new WeakMap<Hole, Field>();

const voidsOf = (s: Hole) => (s.zones || []).filter((q) => q.skin === "void" && q.kind === "hazard");
const centreOf = (q: Zone): [number, number] => q.poly && q.poly.length > 2 && !q.outside
  ? [q.poly.reduce((a, p) => a + p[0], 0) / q.poly.length, q.poly.reduce((a, p) => a + p[1], 0) / q.poly.length]
  : [boxOf(q).cx, boxOf(q).cz];

function fieldOf(s: Hole, t: Terrain): Field {
  const had = fields.get(s);
  if (had) return had;
  const W = s.board.w, H = s.board.h, M = MARGIN;
  const nx = Math.ceil((W + 2 * M) / STEP), nz = Math.ceil((H + 2 * M) / STEP), n = nx * nz;
  const pits = (s.zones || []).filter((q) => q.kind === "hazard");
  const lane = new Uint8Array(n), wall = new Uint8Array(n);
  const cell = (x: number, z: number) => {
    const i = Math.floor((x + M) / STEP), j = Math.floor((z + M) / STEP);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = -M + (i + 0.5) * STEP, z = -M + (j + 0.5) * STEP;
      if (t.onGreen(x, z) && !pits.some((q) => inZone(q, x, z))) lane[j * nx + i] = 1;
    }
  // the rails (untimed walls) cut the lane: the flood goes round them
  for (const w of s.walls || []) {
    if (w.every) continue;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), k = Math.max(1, Math.ceil(L / 0.1));
    for (let u = 0; u <= k; u++) {
      const c = cell(w.a[0] + ((w.b[0] - w.a[0]) * u) / k, w.a[1] + ((w.b[1] - w.a[1]) * u) / k);
      if (c >= 0) wall[c] = 1;
    }
  }
  // along the lane from the tee (a flood in steps of a cell), then out of
  // every tunnel whose mouth it reached, on from its exit
  const geo = new Float32Array(n).fill(Infinity);
  const flood = (seeds: number[]) => {
    let front = seeds;
    while (front.length) {
      const next: number[] = [];
      for (const c of front) {
        const i = c % nx, j = (c - i) / nx, d = geo[c] + STEP;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const k = jj * nx + ii;
          if (!lane[k] || wall[k] || geo[k] <= d) continue;
          geo[k] = d;
          next.push(k);
        }
      }
      front = next;
    }
  };
  const tee = cell(s.start[0], s.start[1]);
  if (tee >= 0) (geo[tee] = 0), flood([tee]);
  const tunnels = (s.zones || []).filter((q) => q.kind === "tunnel");
  for (let pass = 0; pass < tunnels.length; pass++) {
    let more = false;
    for (const q of tunnels) {
      let best = Infinity;
      for (let z = q.min[1]; z <= q.max[1]; z += STEP / 2)
        for (let x = q.min[0]; x <= q.max[0]; x += STEP / 2) {
          const c = cell(x, z);
          if (c >= 0 && inZone(q, x, z)) best = Math.min(best, geo[c]);
        }
      const out = cell(q.vec[0], q.vec[1]);
      if (best < Infinity && out >= 0 && geo[out] > best + 4) (geo[out] = best + 4), flood([out]), (more = true);
    }
    if (!more) break;
  }
  // the distance off the lane (a two-pass chamfer)
  const off = new Float32Array(n);
  for (let k = 0; k < n; k++) off[k] = lane[k] ? 0 : 1e4;
  chamferField(off, nx, nz, STEP);
  const f: Field = { geo, off, at: cell };
  fields.set(s, f);
  return f;
}

/** A piece to sign: its sign, and the points it covers. */
interface Mark { name: string; pts: [number, number][] }
interface Lists { walls: readonly Wall[]; posts: readonly { c: Vec2; skin: string }[]; zones: readonly Zone[] }

/** The pieces of a hole (or of its strokes) that have a sign, each with a few points of it. */
function marks({ walls, posts, zones }: Lists, pits: readonly Zone[]): Mark[] {
  const out: Mark[] = [];
  const name = (skin: string, timed: boolean) => (TIMED_ONLY.has(skin) && !timed ? null : SIGN_OF[skin] || null);
  for (const w of walls) {
    const n = name(w.skin, !!w.every);
    if (n) out.push({ name: n, pts: [[(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], [w.a[0], w.a[1]], [w.b[0], w.b[1]]] });
  }
  for (const p of posts) {
    const n = name(p.skin, false);
    if (n) out.push({ name: n, pts: [[p.c[0], p.c[1]]] });
  }
  // a still pool of a hazard lying between two timed curtains (the lava falls): the curtains' sign says the way
  // is between them, past the pool
  const curtains = zones.filter((q) => q.kind === "hazard" && q.every && q.skin === "lava fall");
  const pooled = zones.some((q) => {
    if (q.kind !== "hazard" || q.every || q.skin === "void") return false;
    const [cx, cz] = centreOf(q);
    return curtains.some((a) => curtains.some((b) => a !== b && a.max[0] <= cx && b.min[0] >= cx && cz >= Math.min(a.min[1], b.min[1]) && cz <= Math.max(a.max[1], b.max[1])));
  });
  for (const q of zones) {
    // a corkscrew on a clock is the points' (the chute loops when they are set)
    const n = q.kind === "loop" && q.every ? "points" : pooled && q.skin === "lava fall" ? "between" : name(q.skin, !!q.every);
    if (!n) continue;
    const pts: [number, number][] = [centreOf(q)];
    const sx = q.max[0] - q.min[0], sz = q.max[1] - q.min[1], st = Math.max(1, Math.max(sx, sz) / 10);
    for (let z = q.min[1] + st / 2; z < q.max[1]; z += st) for (let x = q.min[0] + st / 2; x < q.max[0]; x += st) if (inZone(q, x, z)) pts.push([x, z]);
    out.push({ name: n, pts });
    // a cage or a lift lets the ball out keeping its speed: one whose way out runs on into a
    // hazard (the flooded foot of a shaft) is taken softly
    if ((q.skin === "lift" || q.skin === "cage") && q.kind === "tunnel") {
      const [cx, cz] = centreOf(q), L = Math.hypot(q.vec[0] - cx, q.vec[1] - cz) || 1, ux = (q.vec[0] - cx) / L, uz = (q.vec[1] - cz) / L;
      let wet = false;
      for (let d = 0; d <= 6 && !wet; d += 0.5) wet = pits.some((h) => h.kind === "hazard" && h.skin !== "void" && inZone(h, q.vec[0] + ux * d, q.vec[1] + uz * d));
      if (wet) out.push({ name: "soft", pts });
    }
  }
  return out;
}

/** A sign's place and the way it faces, and whether it hangs over the void. */
interface Spot {
  name: string; x: number; z: number; y: number; yaw: number; hung: boolean;
  /** on a bracket of its own (a post on a rock rib between lanes, or up from a shaft's wall): its post's foot under y, and which side of the post the plate hangs (0: in front of it) */
  bracket?: { foot: number; side: number };
}

/** Timed bars that travel along a line out past the lane (a cart into its portal, a piston into its cylinder, a door into its housing). */
const RUNS = new Set(["cart", "boulder", "piston", "safe door", "swing door"]);
/** Timed bars of a hero machine that stands on a frame round them (kept clear by 3). */
const FRAMED = ["stamp", "paddle", "pickaxe", "drill"];
/** Signs to read from the tee as the player aims (the Classic camera looks round the ball): stood by the tee. */
const TEE = new Set(["soft"]);
/** Tunnels whose way runs over the board (the rest go under it). */
const OVERHEAD = new Set(["cable car", "cart ride", "geyser"]);
/** How far a plate stands from the nearest point of its piece at most. */
const NEAR = 6.5;
/** The machines a hole may have two of, far apart (two tracks of carts, two geysers...): one sign each. */
const TWICE = new Set(["geyser", "pistons", "doors", "power", "steam", "stamps"]);
const RANK = ["cage", "lift", "soft", "geyser", "cablecar", "ride", "drill", "doors", "vault", "gates", "points", "turntable", "carts", "pick", "stamps", "wheel", "pistons", "falls", "between", "stalactites", "tide", "blast", "rockfall", "crumbles", "boulder", "bats", "power", "magnet", "steam", "sway", "belt", "chute", "adit", "ladder", "kick", "jewels", "banked", "slippery", "dark", "hot"];

/**
 * Where a hole's signs go: its pieces gathered by sign (near ones as one),
 * each group signed where the lane comes to it (a few units before its
 * first point along the lane from the tee), off the lane on the floor or
 * over the void, not in front of the lane, clear of the pieces, the rides'
 * way, the hazards, the tee, the cup and the other signs; facing the way the
 * ball comes and the camera. At most `cap` signs, the machines first.
 */
function plan(s: Hole, at: Ground, list: Mark[], cap: number, taken: { x: number; z: number }[], extra: Lists | null): Spot[] {
  const f = fieldOf(s, at.t), W = s.board.w, H = s.board.h, voids = voidsOf(s);
  const idx = (x: number, z: number) => f.at(x, z);
  const geoAt = (x: number, z: number) => (idx(x, z) < 0 ? Infinity : f.geo[idx(x, z)]);
  const offAt = (x: number, z: number) => (idx(x, z) < 0 ? 1e4 : f.off[idx(x, z)]);
  // a point's place along the lane: its own, or the nearest reached within 4
  const snap = (x: number, z: number) => {
    let best = { g: geoAt(x, z), x, z, d: 0 };
    if (best.g < Infinity) return best;
    for (let r = STEP; r <= 4; r += STEP)
      for (let a = 0; a < TAU; a += STEP / r) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, g = geoAt(px, pz);
        if (g < Infinity && (best.g === Infinity || r < best.d || (r === best.d && g < best.g))) best = { g, x: px, z: pz, d: r };
      }
    return best;
  };
  // the groups: a sign's pieces within 10 of each other are one
  const groups: { name: string; pts: [number, number][] }[] = [];
  for (const m of list) {
    const near = groups.filter((q) => q.name === m.name && q.pts.some(([x, z]) => m.pts.some(([a, b]) => Math.hypot(a - x, b - z) < 10)));
    if (!near.length) groups.push({ name: m.name, pts: [...m.pts] });
    else {
      near[0].pts.push(...m.pts);
      for (const o of near.slice(1)) (near[0].pts.push(...o.pts), groups.splice(groups.indexOf(o), 1));
    }
  }
  const firsts = groups.map((q) => {
    let best = { g: Infinity, x: q.pts[0][0], z: q.pts[0][1], d: 0 }, top = -Infinity;
    for (const [x, z] of q.pts) {
      const p = snap(x, z);
      if (p.g < best.g) best = p;
      if (p.g < Infinity) top = Math.max(top, p.g);
    }
    return { name: q.name, ...best, top, pts: q.pts };
  });
  firsts.sort((a, b) => RANK.indexOf(a.name) - RANK.indexOf(b.name) || a.g - b.g);
  // what a sign keeps clear of: every piece (and its track run on past the lane), the tunnels' ways, the hazards
  const all: Lists = { walls: [...(s.walls || []), ...(extra?.walls || [])], posts: [...(s.posts || []), ...(extra?.posts || [])], zones: [...(s.zones || []), ...(extra?.zones || [])] };
  // (a plain wall out in the void is the board's frame, not drawn: nothing to keep clear of)
  const segs: [Vec2, Vec2, number][] = all.walls.filter((w) => !inSea(w, all.zones)).map((w) => [w.a, w.b, w.every ? 1.6 : 1.2]);
  // (a track: the bars of one clock, near each other, in a line; run on 6 past its ends into its portals,
  // or a piston's or a door's travel on past the lane into its cylinder or its housing)
  const runs = new Map<string, [number, number][][]>();
  for (const w of all.walls) {
    if (!w.every || !RUNS.has(w.skin)) continue;
    const c: [number, number] = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], k = `${w.skin}|${w.every}|${w.on}`;
    const lines = runs.get(k) || [];
    runs.set(k, lines);
    const line = lines.find((l) => l.some(([x, z]) => Math.hypot(x - c[0], z - c[1]) < 4));
    if (line) line.push(c);
    else lines.push([c]);
  }
  for (const [key, lines] of runs)
    for (const cs of lines) {
      let far = [cs[0], cs[0]], L = 0;
      for (const p of cs) for (const q of cs) if (Math.hypot(p[0] - q[0], p[1] - q[1]) > L) (L = Math.hypot(p[0] - q[0], p[1] - q[1])), (far = [p, q]);
      if (L < 0.5) continue;
      // (a piston draws back its own length off the lane, its cylinder behind it as long again)
      const ux = (far[1][0] - far[0][0]) / L, uz = (far[1][1] - far[0][1]) / L, e = key.startsWith("piston|") ? 2 * L + 2 : 6;
      segs.push([[far[0][0] - ux * e, far[0][1] - uz * e], [far[1][0] + ux * e, far[1][1] + uz * e], 2.2]);
    }
  // (a hero machine stands on its frame round its bars: the stamp battery, the water wheel, the pickaxe's gantry, the drill)
  const frames: [number, number, number, number][] = [];
  for (const skin of FRAMED) {
    const bars = all.walls.filter((w) => w.every && w.skin === skin);
    if (!bars.length) continue;
    const xs = bars.flatMap((w) => [w.a[0], w.b[0]]), zs = bars.flatMap((w) => [w.a[1], w.b[1]]);
    frames.push([Math.min(...xs) - 3, Math.min(...zs) - 3, Math.max(...xs) + 3, Math.max(...zs) + 3]);
  }
  // (a tunnel's way: through the air for a cable car, a cart ride or a geyser's throw; underground for the rest, its mouth and its exit only)
  for (const q of all.zones)
    if (q.kind === "tunnel") {
      if (OVERHEAD.has(q.skin)) segs.push([centreOf(q), q.vec, q.skin === "geyser" ? 2.5 : 3.5]);
      else segs.push([centreOf(q), centreOf(q), 2.5], [q.vec, q.vec, 2.5]);
    }
  // (a hazard: never stood in; hung over a lava lake, not a pool on the lane nor down a shaft; a tunnel's mouth or a loop: never)
  const pits = all.zones.filter((q) => q.kind === "hazard" && q.skin !== "void"), lakes = pits.filter((q) => q.skin.startsWith("lava") && (q.max[0] - q.min[0]) * (q.max[1] - q.min[1]) >= 200), zones = all.zones.filter((q) => q.kind === "tunnel" || q.kind === "loop"), shafts = pits.filter((q) => q.skin === "shaft");
  // the way the first shot goes: the camera stands 7 behind the tee, keep out of its way
  const teeWay = (() => {
    let best: [number, number] = [0, -1], k = Infinity;
    for (let r = 3; r <= 9; r += STEP)
      for (let t = 0; t < TAU; t += STEP / r) {
        const x = s.start[0] + Math.cos(t) * r, z = s.start[1] + Math.sin(t) * r, g = geoAt(x, z);
        if (g < Infinity && Math.abs(g - 7) < k) (k = Math.abs(g - 7)), (best = [Math.cos(t), Math.sin(t)]);
      }
    return best;
  })();
  const by = (q: Zone, x: number, z: number, r: number) => inZone(q, x, z) || inZone(q, x + r, z) || inZone(q, x - r, z) || inZone(q, x, z + r) || inZone(q, x, z - r);
  const clear = (x: number, z: number, cone = true) =>
    segs.every(([a, b, r]) => segDist(x, z, a, b) > r) &&
    all.posts.every((p) => Math.hypot(p.c[0] - x, p.c[1] - z) > 2) &&
    !zones.some((q) => by(q, x, z, 1.2)) &&
    !frames.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1) &&
    // (9 clear of the tee, where the camera starts close: a plate there looms over it; one meant for the tee 3.5)
    Math.hypot(x - s.start[0], z - s.start[1]) > (cone ? 9 : 3.5) && Math.hypot(x - s.cup[0], z - s.cup[1]) > 4 &&
    !(cone && Math.hypot(x - s.start[0], z - s.start[1]) < 9.5 && (x - s.start[0]) * teeWay[0] + (z - s.start[1]) * teeWay[1] < 0.3 * Math.hypot(x - s.start[0], z - s.start[1]));
  // in front of the lane from the camera (it looks from +z: never there; an upright phone from −x: rather not)
  const hides = (x: number, z: number, deep: number) => {
    let phone = 0;
    for (let d = 0.5; d <= 7; d += 0.5)
      for (let u = -2; u <= 2; u += 0.5) {
        // (a sign's height hides 4 behind it from Far, more from Classic: the lane there, or a hazard on it)
        if (d <= deep && (offAt(x + u * 0.6, z - d) === 0 || pits.some((q) => inZone(q, x + u * 0.6, z - d)))) return Infinity;
        if (offAt(x + d, z + u) === 0) phone = 2;
      }
    return phone;
  };
  const overVoid = (x: number, z: number) => (voids.length > 0 && (x < 0 || z < 0 || x > W || z > H || voids.some((q) => inZone(q, x, z)))) || lakes.some((q) => inZone(q, x, z));
  // where nothing else fits, a bracket of its own: on a rock rib between lanes (off the lane, not on
  // its rails) or up from a shaft's or the void's wall at the lane's edge, the plate out over the
  // drop; by the stretch of lane that leads to the piece (30 before it) or runs along it, nearest the
  // approach; facing both cameras alike (a wide screen's from +z, an upright phone's from −x)
  const walls0 = all.walls.filter((w) => !w.every);
  const bracketSpot = (a: { name: string; g: number; top: number; pts: [number, number][] }, to: { x: number; z: number }): (Spot & { k: number }) | null => {
    let best: (Spot & { k: number }) | null = null;
    for (let cz = 0.5; cz < H; cz += 1)
      for (let cx = 0.5; cx < W; cx += 1) {
        const g0 = geoAt(cx, cz);
        if (!(g0 >= a.g - 30 && g0 <= Math.max(a.g, a.top))) continue;
        for (let r = 0.5; r <= 2.5; r += 0.5)
        for (let t = 0; t < TAU; t += 0.5 / r) {
          const x = cx + Math.cos(t) * r, z = cz + Math.sin(t) * r, off = offAt(x, z);
          if (off < 0.35 || off > 1.5 || taken.some((q) => Math.hypot(q.x - x, q.z - z) < 4) || walls0.some((w) => segDist(x, z, w.a, w.b) < 0.3)) continue;
          if (!segs.every(([p0, p1, rr]) => rr < 1.5 || segDist(x, z, p0, p1) > rr) || zones.some((q) => by(q, x, z, 1.2)) || pits.some((q) => inZone(q, x, z) && !shafts.includes(q))) continue;
          if (Math.hypot(x - s.start[0], z - s.start[1]) < 9 || Math.hypot(x - s.cup[0], z - s.cup[1]) < 4 || far(a, x, z)) continue;
          const yaw = Math.atan2(-1, 1), ux = Math.cos(yaw), uz = -Math.sin(yaw), hw = (PW * BRACKET) / 2 + 0.35;
          const down = overVoid(x, z) || shafts.some((q) => inZone(q, x, z));
          let side = 0;
          if (down) {
            // (the plate out to the side of the post that is over the drop, clear of the lane)
            const fit = (sd: number) => [0.5, 1, 1.5, 2].every((u) => { const px = x + ux * sd * hw * u, pz = z + uz * sd * hw * u; return offAt(px, pz) >= 1 && (overVoid(px, pz) || shafts.some((q) => inZone(q, px, pz))); });
            side = fit(1) ? 1 : fit(-1) ? -1 : 0;
            if (!side) continue;
          }
          const k = Math.hypot(x - to.x, z - to.z) + 0.5 * Math.abs(off - 0.8);
          if (best && k >= best.k) continue;
          const near = snap(x, z), y = at.t.height(near.x, near.z);
          best = { name: a.name, x, z, y, yaw, hung: false, bracket: { foot: down ? -7 : 0, side }, k };
        }
      }
    return best;
  };
  // (a plate names its piece: within about 6 of it, or it reads as another's; the dark gallery's is the hole's own)
  const far = (a: { name: string; pts: [number, number][] }, x: number, z: number) => a.name !== "dark" && !TEE.has(a.name) && !a.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) <= NEAR);
  const out: Spot[] = [], perSign = new Map<string, number>();
  for (const a of firsts) {
    if (out.length >= cap || (perSign.get(a.name) || 0) >= (TWICE.has(a.name) ? 2 : 1)) continue;
    // where the lane comes to it: back along the lane from its first point, 5 before;
    // and the way the ball comes (12 before), for the plate to face
    const before = (d: number, R: number) => {
      if (a.g === Infinity) return { x: a.x, z: a.z };
      let best = { x: a.x, z: a.z, k: Infinity };
      for (let r = 0; r <= R; r += STEP)
        for (let t = 0; t < TAU; t += STEP / Math.max(r, STEP)) {
          const x = a.x + Math.cos(t) * r, z = a.z + Math.sin(t) * r, g = geoAt(x, z);
          if (g === Infinity || g > a.g - 1) continue;
          const k = Math.abs(g - (a.g - d)) + 0.15 * r;
          if (k < best.k) best = { x, z, k };
        }
      return best;
    };
    // (one to read from the tee as the player aims: by the tee, where the Classic camera looks over it, the
    // wide screen's along −z and the upright phone's along +x: near its line across (z) first)
    const tee = TEE.has(a.name), P = tee ? { x: s.start[0], z: s.start[1] } : before(5, 9), Q = before(12, 16);
    let best: (Spot & { k: number }) | null = null;
    // (and if there is no room, a little closer to the others and to the lane behind; or further off, behind
    // it all: a round cavern's back wall)
    for (const [cx, cz, R, room, deep] of [[P.x, P.z, 11, 5.5, 6.5], [a.x, a.z, 11, 5.5, 6.5], [a.x, a.z, 22, 5.5, 6.5], [P.x, P.z, 11, 5, 3.5], [a.x, a.z, 16, 5, 3.5], [a.x, a.z, 36, 5.5, 6.5]] as const) {
      for (let r = 1.8; r <= R; r += 0.6)
        for (let t = 0; t < TAU; t += 0.6 / r) {
          const x = cx + Math.cos(t) * r, z = cz + Math.sin(t) * r, off = offAt(x, z);
          if (off < 1.7 || off > 5.5 || far(a, x, z) || !clear(x, z, !tee) || taken.some((q) => Math.hypot(q.x - x, q.z - z) < room)) continue;
          // facing the ball coming, and the cameras (a wide screen's from +z, an upright phone's from −x: between them);
          // the plate's ends as clear as its middle
          let fx = Q.x - x, fz = Q.z - z;
          const L = Math.hypot(fx, fz) || 1;
          (fx = (0.8 * fx) / L - 0.8), (fz = (0.8 * fz) / L + 1.1);
          // (a sign read from the tee faces both cameras alike, half way between them)
          const yaw = tee ? Math.atan2(-1, 1) : Math.atan2(fx, fz), ex = Math.cos(yaw) * (PW / 2 + 0.1), ez = -Math.sin(yaw) * (PW / 2 + 0.1);
          const ends = [[x - ex, z - ez], [x + ex, z + ez]] as const;
          if (ends.some(([px, pz]) => offAt(px, pz) < 1 || !clear(px, pz, !tee))) continue;
          const floor = at.ok(x, z, 0.8, 1.2) && ends.every(([px, pz]) => at.ok(px, pz, 0.35, 0.8)) && !pits.some((q) => by(q, x, z, 1.2) || ends.some(([px, pz]) => by(q, px, pz, 0.8)));
          const hung = !floor && off >= 4 && off <= 5.5 && overVoid(x, z) && ends.every(([px, pz]) => overVoid(px, pz)) && ![[x, z], ...ends].some(([px, pz]) => shafts.some((q) => inZone(q, px, pz)));
          if (!floor && !hung) continue;
          const k = (tee ? Math.hypot(0.5 * (x - P.x), 1.5 * (z - P.z)) : Math.hypot(x - P.x, z - P.z)) + Math.max(hides(x, z, deep), ...ends.map(([px, pz]) => hides(px, pz, deep))) + 0.6 * Math.abs(off - (hung ? 4.6 : 2.3));
          if (k === Infinity || (best && k >= best.k)) continue;
          const near = snap(x, z);
          best = { name: a.name, x, z, y: hung ? at.t.height(near.x, near.z) + HUNG_Y : at.bank(x, z), yaw, hung, k };
        }
      if (best) break;
    }
    if (!best) best = bracketSpot(a, P);
    if (!best) continue;
    out.push(best);
    taken.push(best);
    perSign.set(a.name, (perSign.get(a.name) || 0) + 1);
  }
  return out;
}

function build(s: Hole, at: Ground, spots: Spot[], lit: boolean) {
  const g = new THREE.Group(), rand = seeded("mines-signs" + s.hole);
  for (const p of spots) {
    const { g: sign, lampAt } = p.bracket ? bracketed(p.name, rand, at.lamp, p.bracket.foot, p.bracket.side) : (p.hung ? hanging : standing)(p.name, rand, at.lamp);
    sign.position.set(p.x, p.y, p.z);
    sign.rotation.y = p.yaw;
    if (p.hung) sign.scale.setScalar(HUNG_SCALE);
    // (a thin line, as the lane's pieces have: the kit's prop and stone come with the thick one)
    sign.traverse((o) => { if (o instanceof THREE.Mesh && o.material === INK) o.material = INK_THIN; });
    g.add(sign);
    if (!p.hung && !p.bracket) at.reserve(p.x, p.z, PW / 2 + 0.3);
    if (lit && at.light) {
      sign.updateMatrixWorld(true);
      at.light(lampAt.applyMatrix4(sign.matrixWorld));
    }
  }
  return g;
}

// (plan: the pulse signs' last spots, by the pieces seen they were planned for: the same pieces, the same spots, planned once)
const grounds = new WeakMap<Hole, { at: Ground; taken: { x: number; z: number }[]; seen: Map<string, Lists>; plan?: { key: string; spots: Spot[] } }>();

/**
 * The hole's signs, for its decor (built before the rest of it: the signs
 * take their spots first): its own pieces', and a dark gallery's at the tee.
 */
export function signs(s: Hole, at: Ground) {
  const taken: { x: number; z: number }[] = [];
  grounds.set(s, { at, taken, seen: new Map() });
  const list = marks({ walls: s.walls || [], posts: s.posts || [], zones: s.zones || [] }, s.zones || []);
  if (darkGallery(s)) list.push({ name: "dark", pts: [[s.start[0], s.start[1]]] });
  return build(s, at, plan(s, at, list, 5, taken, null), true);
}

/**
 * A stroke's extras with the signs of the pulse pieces (the tide, the
 * dynamite, a rockfall, the vault doors...): every one the chain has shown
 * on this hole so far (this stroke's, the look-ahead's, the earlier ones'),
 * so a sign stands before its piece comes and stays after. Merged with the
 * stroke's pieces by the caller (mines.ts extras).
 */
export function pulseSigns<T extends { group: THREE.Object3D; skins: Set<string> }>(own: T | null | undefined, ex: Extras, s: Hole) {
  const held = grounds.get(s);
  if (!own || !held) return own;
  for (const q of [ex, ...(ex.ahead || [])]) {
    if (!q) continue;
    for (const w of q.walls) held.seen.set(JSON.stringify(w), { walls: [w], posts: [], zones: [] });
    for (const p of q.posts) held.seen.set(JSON.stringify(p), { walls: [], posts: [p], zones: [] });
    for (const z of q.zones || []) held.seen.set(JSON.stringify(z), { walls: [], posts: [], zones: [z] });
  }
  const key = [...held.seen.keys()].join("\n");
  if (held.plan?.key !== key) {
    const seen = [...held.seen.values()], all: Lists = { walls: seen.flatMap((q) => q.walls), posts: seen.flatMap((q) => q.posts), zones: seen.flatMap((q) => q.zones) };
    held.plan = { key, spots: plan(s, held.at, marks(all, [...(s.zones || []), ...all.zones]), 3, [...held.taken], all) };
  }
  const spots = held.plan.spots;
  if (spots.length) own.group.add(build(s, { ...held.at, reserve: () => {} }, spots, false));
  return own;
}
