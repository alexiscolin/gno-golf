// An Epic's own thing, as data: a few simple shapes, inked like the rest of
// him (scene/gnome-props.ts builds them). A new one is a new last entry: its
// name is its code (PROPS), so the order is the encoding's.
//
// Where a part stands: "body" is the gnome's own space (his body a sphere of
// 0.55 at the origin, his face toward +z, eyes at y 0.08); "hat" the hat's
// (its foot at y -0.3, the cone's tip at 0.575, leaning back with it); "top"
// the tip of whatever hat he wears. A gnome has no arms: what he carries is
// tucked at his side, x ±0.5, as the Diver's snorkel is.
//
// A part: s its shape and d its sizes (sphere [r, and three's other
// arguments], cone [r, h], cyl [top,
// bottom, h], box [w, h, d], torus [R, tube, arc?], oct/ico/tetra [r], disc
// [r]); p where, r its turn (radians, x y z), k its stretch; c its colour (a
// palette name, or "prop", "hat", "body", "hair", "accent": the gnome's own),
// m true to take his material (a brass key on a brass gnome), glow true for
// what is lit (unshaded: a flame, a lit window), bare true for no outline.
// Every part is a few dozen triangles: a whole prop stays under ~600.

export type Shape = "sphere" | "cone" | "cyl" | "box" | "torus" | "oct" | "ico" | "tetra" | "disc";
export type Anchor = "body" | "hat" | "top";
export interface Part {
  s: Shape;
  d: readonly number[];
  p: readonly [number, number, number];
  r?: readonly [number, number, number];
  k?: readonly [number, number, number];
  c?: string;
  m?: boolean;
  glow?: boolean;
  bare?: boolean;
}
/** A prop: its parts, or a Legendary's piece, built in code (scene/gnome-legend.ts, its motion with it). */
export type PropDesign = { at: Anchor; parts: readonly Part[] } | { legend: true };

const Q = Math.PI / 2;

/** The props, by name: what each one is made of. */
export const PROP_DESIGNS: Readonly<Record<string, PropDesign>> = {
  // a wind-up key in his back, a little to the side, its bow standing up and down
  "windup-key": { at: "body", parts: [
    { s: "cyl", d: [0.04, 0.04, 0.24], p: [0.27, 0.05, -0.53], r: [Q, 0, -2.67], m: true },
    { s: "torus", d: [0.11, 0.035], p: [0.32, 0.19, -0.63], r: [0, 1.1, 0], m: true },
    { s: "torus", d: [0.11, 0.035], p: [0.32, -0.09, -0.63], r: [0, 1.1, 0], m: true },
  ] },
  // a watering can hung on the brim, its spout forward
  "watering-can": { at: "hat", parts: [
    { s: "cyl", d: [0.13, 0.15, 0.24], p: [0.44, -0.12, 0.1], m: true },
    { s: "cyl", d: [0.025, 0.035, 0.32], p: [0.5, -0.06, 0.3], r: [1.0, 0, 0], m: true },
    { s: "torus", d: [0.1, 0.025, Math.PI], p: [0.44, 0.0, 0.1], r: [0, Q, 0], m: true },
    { s: "cyl", d: [0.05, 0.05, 0.02], p: [0.5, 0.06, 0.43], r: [1.0, 0, 0], c: "pebble", bare: true },
  ] },
  // an acorn on the hat's tip
  acorn: { at: "top", parts: [
    { s: "sphere", d: [0.13], p: [0, 0.12, 0], k: [1, 1.25, 1], c: "caramel" },
    { s: "sphere", d: [0.14], p: [0, 0.2, 0], k: [1, 0.55, 1], c: "chestnut" },
    { s: "cyl", d: [0.02, 0.025, 0.08], p: [0, 0.3, 0], c: "bark" },
  ] },
  // a garden spade over his shoulder
  spade: { at: "body", parts: [
    { s: "cyl", d: [0.03, 0.03, 0.75], p: [0.48, 0.12, -0.12], r: [0.5, 0, -0.35], c: "caramel" },
    { s: "box", d: [0.2, 0.24, 0.04], p: [0.62, -0.18, 0.06], r: [0.5, 0, -0.35], c: "steel" },
    { s: "torus", d: [0.06, 0.02], p: [0.36, 0.45, -0.28], r: [0.5, 0, -0.35], c: "caramel" },
  ] },
  // a snail on the hat, its shell a spiral
  snail: { at: "hat", parts: [
    { s: "sphere", d: [0.13], p: [0.24, -0.02, 0.24], k: [0.7, 1, 1], c: "prop" },
    { s: "torus", d: [0.07, 0.03], p: [0.31, -0.02, 0.26], r: [0, Q, 0], c: "cream", bare: true },
    { s: "sphere", d: [0.06], p: [0.28, -0.13, 0.4], k: [1, 0.8, 1.6], c: "lichen" },
    { s: "cyl", d: [0.01, 0.01, 0.08], p: [0.27, -0.06, 0.47], r: [0.6, 0, 0], c: "ink", bare: true },
  ] },
  // a teacup on the brim, saucer and all
  teacup: { at: "hat", parts: [
    { s: "cyl", d: [0.12, 0.08, 0.13], p: [0.38, -0.08, 0.16], c: "white" },
    { s: "cyl", d: [0.17, 0.15, 0.025], p: [0.38, -0.155, 0.16], c: "white" },
    { s: "torus", d: [0.045, 0.015], p: [0.5, -0.07, 0.16], r: [0, 0, 0], c: "prop", bare: true },
    { s: "disc", d: [0.1], p: [0.38, -0.012, 0.16], r: [-Q, 0, 0], c: "caramel", bare: true },
  ] },
  // two knitting needles through the hat and the ball of yarn they come from
  knitting: { at: "hat", parts: [
    { s: "cyl", d: [0.018, 0.018, 0.7], p: [0.05, 0.25, 0.05], r: [0, 0, -0.9], c: "silver" },
    { s: "cyl", d: [0.018, 0.018, 0.7], p: [-0.05, 0.25, 0.05], r: [0, 0, 0.9], c: "silver" },
    { s: "sphere", d: [0.15], p: [0.36, -0.12, 0.2], c: "prop" },
    { s: "torus", d: [0.15, 0.015], p: [0.36, -0.12, 0.2], r: [0.6, 0.4, 0], c: "accent", bare: true },
  ] },
  // a neon sunflower sign on the hat's side
  "neon-bloom": { at: "hat", parts: [
    { s: "torus", d: [0.16, 0.03], p: [0.38, 0.0, 0.08], r: [0, 0.9, 0], c: "prop", glow: true },
    { s: "disc", d: [0.09], p: [0.38, 0.0, 0.08], r: [0, 0.9, 0], c: "amber", glow: true, bare: true },
    { s: "cyl", d: [0.02, 0.02, 0.22], p: [0.38, -0.25, 0.08], c: "prop", glow: true, bare: true },
  ] },
  // a koi leaping off the bucket hat's brim
  koi: { at: "hat", parts: [
    { s: "sphere", d: [0.12], p: [0.3, 0.12, 0.2], r: [0, 0, 0.8], k: [1, 2.1, 0.75], c: "prop" },
    { s: "sphere", d: [0.05], p: [0.32, 0.13, 0.28], c: "white", bare: true },
    { s: "cone", d: [0.1, 0.16], p: [0.13, 0.32, 0.2], r: [0, 0, 0.9], k: [1, 1, 0.3], c: "prop" },
    { s: "sphere", d: [0.025], p: [0.4, 0.07, 0.27], c: "ink", bare: true },
  ] },
  // a fishing rod over his shoulder, the line down to a bobber
  "fishing-rod": { at: "body", parts: [
    { s: "cyl", d: [0.015, 0.035, 1.0], p: [0.42, 0.3, -0.3], r: [-0.6, 0, -0.5], c: "walnut" },
    { s: "cyl", d: [0.006, 0.006, 0.42], p: [0.68, 0.38, -0.66], c: "ink", bare: true },
    { s: "sphere", d: [0.06], p: [0.68, 0.15, -0.66], c: "cap" },
    { s: "cyl", d: [0.05, 0.05, 0.06], p: [0.36, -0.05, -0.08], r: [0, 0, Q], c: "steel", bare: true },
  ] },
  // a bosun's whistle on a chain across his chest
  "bosun-whistle": { at: "body", parts: [
    { s: "cyl", d: [0.035, 0.05, 0.22], p: [0.18, -0.32, 0.46], r: [0, 0, 1.2], m: true },
    { s: "sphere", d: [0.07], p: [0.07, -0.37, 0.47], m: true },
    { s: "torus", d: [0.45, 0.012, 1.6], p: [0, 0.0, 0.18], r: [0.35, 0, -2.4], c: "prop", bare: true },
  ] },
  // a ship's wheel on his back, its spokes over his shoulders
  "ship-wheel": { at: "body", parts: [
    { s: "torus", d: [0.3, 0.035], p: [0, 0.05, -0.6], m: true },
    { s: "cyl", d: [0.04, 0.04, 0.1], p: [0, 0.05, -0.6], r: [Q, 0, 0], m: true },
    ...[0, 1, 2, 3].map((k): Part => ({ s: "cyl", d: [0.018, 0.018, 0.78], p: [0, 0.05, -0.6], r: [0, 0, (k * Math.PI) / 4], m: true })),
  ] },
  // an anchor on a cord at his chest
  anchor: { at: "body", parts: [
    { s: "cyl", d: [0.025, 0.025, 0.24], p: [0, -0.28, 0.54], r: [-0.25, 0, 0], c: "prop" },
    { s: "torus", d: [0.1, 0.025, Math.PI], p: [0, -0.37, 0.52], r: [Math.PI - 0.25, 0, 0], c: "prop" },
    { s: "torus", d: [0.04, 0.015], p: [0, -0.14, 0.5], r: [-0.25, 0, 0], c: "prop", bare: true },
    { s: "cyl", d: [0.02, 0.02, 0.16], p: [0, -0.2, 0.52], r: [-0.25, 0, Q], c: "prop", bare: true },
  ] },
  // a lighthouse's lantern room on the hat's tip, lit
  beacon: { at: "top", parts: [
    { s: "cyl", d: [0.1, 0.12, 0.05], p: [0, 0.0, 0], c: "ink" },
    { s: "cyl", d: [0.09, 0.09, 0.13], p: [0, 0.09, 0], c: "amber", glow: true },
    { s: "cone", d: [0.12, 0.12], p: [0, 0.21, 0], c: "cap" },
    { s: "sphere", d: [0.025], p: [0, 0.28, 0], c: "ink", bare: true },
  ] },
  // a conch at his side
  conch: { at: "body", parts: [
    { s: "cone", d: [0.14, 0.38], p: [0.55, -0.18, 0.15], r: [0, 0, 1.9], c: "prop" },
    { s: "torus", d: [0.1, 0.03], p: [0.48, -0.15, 0.15], r: [0, Q, 0], c: "coral" },
    { s: "sphere", d: [0.08], p: [0.44, -0.15, 0.17], k: [0.5, 1, 1], c: "petal", bare: true },
  ] },
  // a neon palm tree on the hat
  palm: { at: "hat", parts: [
    { s: "cyl", d: [0.02, 0.03, 0.36], p: [0.34, 0.02, 0.1], r: [0, 0, -0.25], c: "amber", glow: true },
    ...[0, 1, 2, 3, 4].map((k): Part => ({ s: "cone", d: [0.04, 0.24], p: [0.39 + 0.1 * Math.cos(k * 1.26), 0.2, 0.1 + 0.1 * Math.sin(k * 1.26)], r: [Math.sin(k * 1.26) * 1.3, 0, -Math.cos(k * 1.26) * 1.3], c: "prop", glow: true, bare: true })),
  ] },
  // a spyglass at his side, drawn out
  spyglass: { at: "body", parts: [
    { s: "cyl", d: [0.06, 0.06, 0.3], p: [0.5, -0.05, 0.12], r: [Q, 0, 0], m: true },
    { s: "cyl", d: [0.045, 0.045, 0.25], p: [0.5, -0.05, 0.38], r: [Q, 0, 0], m: true },
    { s: "torus", d: [0.065, 0.015], p: [0.5, -0.05, 0.27], c: "ink", bare: true },
    { s: "disc", d: [0.04], p: [0.5, -0.05, 0.51], c: "ice", glow: true, bare: true },
  ] },
  // a coil of rope over his shoulder
  "rope-coil": { at: "body", parts: [
    { s: "torus", d: [0.2, 0.045], p: [0.44, 0.0, 0.0], r: [0, 0, 1.1], c: "oat" },
    { s: "torus", d: [0.17, 0.045], p: [0.46, -0.02, 0.0], r: [0, 0, 1.1], c: "oat" },
    { s: "cyl", d: [0.035, 0.035, 0.22], p: [0.62, -0.3, 0.05], c: "oat" },
  ] },
  // a seagull sitting on the hat
  gull: { at: "hat", parts: [
    { s: "sphere", d: [0.13], p: [0.22, 0.12, 0.08], k: [0.9, 0.8, 1.3], c: "white" },
    { s: "sphere", d: [0.08], p: [0.22, 0.24, 0.2], c: "white" },
    { s: "cone", d: [0.025, 0.1], p: [0.22, 0.23, 0.31], r: [Q, 0, 0], c: "sun" },
    { s: "sphere", d: [0.13], p: [0.22, 0.14, 0.04], k: [1.25, 0.25, 0.9], c: "prop" },
    { s: "sphere", d: [0.018], p: [0.27, 0.26, 0.26], c: "ink", bare: true },
  ] },
  // an oyster on the hat, open, its pearl showing
  oyster: { at: "hat", parts: [
    { s: "sphere", d: [0.15], p: [0.3, -0.06, 0.18], k: [1, 0.3, 1], c: "pebble" },
    { s: "sphere", d: [0.15], p: [0.3, 0.04, 0.12], r: [-0.7, 0, 0], k: [1, 0.3, 1], c: "pebble" },
    { s: "sphere", d: [0.065], p: [0.3, 0.0, 0.2], c: "prop" },
  ] },
  // a rolling pin across his back
  "rolling-pin": { at: "body", parts: [
    { s: "cyl", d: [0.08, 0.08, 0.6], p: [0, 0.1, -0.58], r: [0, 0, 1.2], c: "prop" },
    { s: "cyl", d: [0.035, 0.035, 0.36], p: [0, 0.1, -0.58], r: [0, 0, 1.2], c: "walnut", bare: true },
  ] },
  // a cupcake on the hat's tip, a cherry on it
  cupcake: { at: "top", parts: [
    { s: "cyl", d: [0.13, 0.1, 0.1], p: [0, 0.03, 0], c: "caramel" },
    { s: "sphere", d: [0.14], p: [0, 0.12, 0], k: [1, 0.7, 1], c: "prop" },
    { s: "sphere", d: [0.045], p: [0, 0.22, 0], c: "ruby" },
  ] },
  // a whisk at his side
  whisk: { at: "body", parts: [
    { s: "cyl", d: [0.03, 0.03, 0.22], p: [0.52, -0.3, 0.1], r: [0.3, 0, 0.2], m: true },
    ...[0, 1, 2].map((k): Part => ({ s: "torus", d: [0.09, 0.012], p: [0.49, -0.04, 0.18], r: [0.3, (k * Math.PI) / 3, 0.2], k: [1, 1.6, 1], m: true, bare: true })),
  ] },
  // a painter's palette at his side, dabs of colour on it
  "paint-palette": { at: "body", parts: [
    { s: "cyl", d: [0.22, 0.22, 0.03], p: [0.5, -0.15, 0.2], r: [Q, 0, -1.1], c: "prop" },
    { s: "sphere", d: [0.04], p: [0.54, -0.07, 0.3], c: "cap", bare: true },
    { s: "sphere", d: [0.04], p: [0.58, -0.17, 0.32], c: "delft", bare: true },
    { s: "sphere", d: [0.04], p: [0.54, -0.25, 0.32], c: "lemon", bare: true },
  ] },
  // a paintbrush through the beret
  paintbrush: { at: "hat", parts: [
    { s: "cyl", d: [0.025, 0.035, 0.6], p: [0.1, 0.15, -0.05], r: [0, 0, -1.0], c: "walnut" },
    { s: "cone", d: [0.05, 0.14], p: [0.37, 0.32, -0.05], r: [0, 0, -1.0], c: "prop", glow: true },
    { s: "cyl", d: [0.04, 0.04, 0.06], p: [0.3, 0.28, -0.05], r: [0, 0, -1.0], c: "silver", bare: true },
  ] },
  // a clock's face on the hat's front
  "clock-face": { at: "hat", parts: [
    { s: "cyl", d: [0.15, 0.15, 0.04], p: [0, 0.2, 0.38], r: [Q - 0.2, 0, 0], c: "white" },
    { s: "torus", d: [0.15, 0.02], p: [0, 0.2, 0.38], r: [-0.2, 0, 0], c: "prop", bare: true },
    { s: "box", d: [0.02, 0.1, 0.01], p: [0, 0.24, 0.405], r: [-0.2, 0, 0], c: "ink", bare: true },
    { s: "box", d: [0.07, 0.02, 0.01], p: [0.03, 0.2, 0.405], r: [-0.2, 0, 0], c: "ink", bare: true },
  ] },
  // a pigeon on the hat
  pigeon: { at: "hat", parts: [
    { s: "sphere", d: [0.13], p: [0.2, 0.1, 0.1], k: [0.9, 0.9, 1.3], c: "prop" },
    { s: "sphere", d: [0.075], p: [0.2, 0.22, 0.22], c: "prop" },
    { s: "cone", d: [0.02, 0.07], p: [0.2, 0.21, 0.31], r: [Q, 0, 0], c: "pebble", bare: true },
    { s: "sphere", d: [0.06], p: [0.2, 0.15, 0.18], k: [1.3, 0.6, 0.7], c: "teal", bare: true },
  ] },
  // a candle on the hat's tip, lit
  candle: { at: "top", parts: [
    { s: "cyl", d: [0.12, 0.14, 0.03], p: [0, 0.0, 0], c: "prop", m: true },
    { s: "cyl", d: [0.05, 0.05, 0.18], p: [0, 0.1, 0], c: "cream" },
    { s: "sphere", d: [0.05], p: [0, 0.23, 0], k: [1, 1.6, 1], c: "amber", glow: true, bare: true },
  ] },
  // a cinnamon roll on the hat
  "cinnamon-roll": { at: "top", parts: [
    { s: "torus", d: [0.11, 0.06], p: [0, 0.04, 0], r: [Q, 0, 0], c: "prop" },
    { s: "cyl", d: [0.08, 0.08, 0.1], p: [0, 0.04, 0], c: "prop" },
    { s: "sphere", d: [0.12], p: [0, 0.09, 0], k: [1.1, 0.25, 1.1], c: "white", bare: true },
  ] },
  // an ice axe on his back, its head over the shoulder
  "ice-axe": { at: "body", parts: [
    { s: "cyl", d: [0.03, 0.03, 0.9], p: [0.15, 0.1, -0.58], r: [0, 0, -0.4], c: "walnut" },
    { s: "box", d: [0.38, 0.06, 0.05], p: [0.32, 0.5, -0.58], r: [0, 0, -0.4], m: true },
    { s: "cone", d: [0.035, 0.12], p: [0.5, 0.49, -0.58], r: [0, 0, -1.97], m: true },
  ] },
  // an alphorn over his shoulder, its bell behind him
  alphorn: { at: "body", parts: [
    { s: "cyl", d: [0.03, 0.05, 0.9], p: [0.38, 0.0, -0.38], r: [-0.9, 0, -0.35], c: "prop" },
    { s: "cone", d: [0.14, 0.18], p: [0.52, -0.3, -0.7], r: [-2.4, 0, 0], c: "prop" },
    { s: "torus", d: [0.05, 0.015], p: [0.26, 0.3, -0.06], r: [-0.9, 0, -0.35], c: "ink", bare: true },
  ] },
  // a cuckoo clock's house on the hat's tip, the bird out
  "cuckoo-clock": { at: "top", parts: [
    { s: "box", d: [0.2, 0.18, 0.14], p: [0, 0.09, 0], c: "prop" },
    { s: "box", d: [0.26, 0.03, 0.18], p: [0.07, 0.21, 0], r: [0, 0, -0.6], c: "chestnut" },
    { s: "box", d: [0.26, 0.03, 0.18], p: [-0.07, 0.21, 0], r: [0, 0, 0.6], c: "chestnut" },
    { s: "sphere", d: [0.05], p: [0, 0.11, 0.11], c: "lemon" },
    { s: "cone", d: [0.015, 0.05], p: [0, 0.11, 0.17], r: [Q, 0, 0], c: "apricot", bare: true },
  ] },
  // a mug of cocoa at his side, steaming
  "cocoa-mug": { at: "body", parts: [
    { s: "cyl", d: [0.1, 0.09, 0.2], p: [0.52, -0.2, 0.2], c: "prop" },
    { s: "torus", d: [0.06, 0.02], p: [0.62, -0.2, 0.2], c: "prop", bare: true },
    { s: "disc", d: [0.085], p: [0.52, -0.095, 0.2], r: [-Q, 0, 0], c: "chocolate", bare: true },
    { s: "sphere", d: [0.04], p: [0.5, -0.07, 0.22], c: "white", bare: true },
  ] },
  // a pair of skis crossed on his back
  skis: { at: "body", parts: [
    { s: "box", d: [0.09, 1.1, 0.025], p: [0, 0.1, -0.58], r: [0, 0, 0.4], c: "prop", glow: true },
    { s: "box", d: [0.09, 1.1, 0.025], p: [0, 0.1, -0.6], r: [0, 0, -0.4], c: "prop", glow: true },
  ] },
  // an edelweiss on the hat
  edelweiss: { at: "hat", parts: [
    ...[0, 1, 2, 3, 4, 5].map((k): Part => ({ s: "sphere", d: [0.08], p: [0.3 + 0.08 * Math.cos(k * 1.05), 0.0 + 0.08 * Math.sin(k * 1.05), 0.25], k: [1, 1, 0.35], c: "white" })),
    { s: "sphere", d: [0.05], p: [0.3, 0.0, 0.28], c: "lemon", bare: true },
    { s: "sphere", d: [0.06], p: [0.24, -0.1, 0.22], k: [1, 1.8, 0.4], c: "prop", bare: true },
  ] },
  // a cairn on the hat's tip: three stones
  cairn: { at: "top", parts: [
    { s: "sphere", d: [0.12], p: [0, 0.05, 0], k: [1.1, 0.6, 1], c: "prop" },
    { s: "sphere", d: [0.09], p: [0.01, 0.15, 0], k: [1.1, 0.65, 1], c: "pebble" },
    { s: "sphere", d: [0.06], p: [-0.01, 0.23, 0], k: [1.1, 0.7, 1], c: "ash" },
  ] },
  // a rescue keg under his chin, on a strap
  "rescue-keg": { at: "body", parts: [
    { s: "cyl", d: [0.1, 0.1, 0.22], p: [0, -0.48, 0.42], r: [0, 0, Q], c: "walnut" },
    { s: "torus", d: [0.1, 0.015], p: [0.07, -0.48, 0.42], r: [0, Q, 0], c: "prop", bare: true },
    { s: "torus", d: [0.1, 0.015], p: [-0.07, -0.48, 0.42], r: [0, Q, 0], c: "prop", bare: true },
  ] },
  // a snowglobe at his side
  snowglobe: { at: "body", parts: [
    { s: "cyl", d: [0.11, 0.13, 0.08], p: [0.52, -0.3, 0.18], c: "prop" },
    { s: "sphere", d: [0.14], p: [0.52, -0.14, 0.18], c: "ice" },
    { s: "cone", d: [0.05, 0.12], p: [0.52, -0.16, 0.18], c: "pine", bare: true },
  ] },
  // a pickaxe over his shoulder
  pickaxe: { at: "body", parts: [
    { s: "cyl", d: [0.03, 0.03, 0.85], p: [0.3, 0.05, -0.45], r: [-0.4, 0, -0.5], c: "walnut" },
    { s: "torus", d: [0.28, 0.04, 2.2], p: [0.5, 0.42, -0.58], r: [0, 0, 0.5], m: true },
  ] },
  // a geode on the hat, split open, crystals inside
  geode: { at: "hat", parts: [
    { s: "sphere", d: [0.15], p: [0.3, 0.0, 0.18], k: [1, 1, 0.6], c: "pebble" },
    { s: "disc", d: [0.13], p: [0.33, 0.0, 0.27], r: [0, 0.5, 0], c: "prop", bare: true },
    ...[0, 1, 2].map((k): Part => ({ s: "cone", d: [0.03, 0.09], p: [0.33 + 0.05 * Math.cos(k * 2.1), 0.05 * Math.sin(k * 2.1), 0.28], r: [Q, 0, 0], c: "lilac", bare: true })),
  ] },
  // a canary's cage at his side, the canary in it
  "canary-cage": { at: "body", parts: [
    { s: "cyl", d: [0.13, 0.13, 0.03], p: [0.55, -0.35, 0.15], c: "brass" },
    ...[0, 1, 2, 3, 4, 5].map((k): Part => ({ s: "cyl", d: [0.01, 0.01, 0.24], p: [0.55 + 0.12 * Math.cos(k * 1.05), -0.22, 0.15 + 0.12 * Math.sin(k * 1.05)], c: "brass", bare: true })),
    { s: "sphere", d: [0.13], p: [0.55, -0.1, 0.15], k: [1, 0.5, 1], c: "brass" },
    { s: "sphere", d: [0.06], p: [0.55, -0.25, 0.17], c: "prop" },
  ] },
  // a gold pan at his side, nuggets in it
  "gold-pan": { at: "body", parts: [
    { s: "cyl", d: [0.24, 0.17, 0.06], p: [0.52, -0.2, 0.12], r: [0, 0, 1.3], c: "pewter" },
    { s: "sphere", d: [0.04], p: [0.56, -0.15, 0.16], c: "prop", bare: true },
    { s: "sphere", d: [0.03], p: [0.55, -0.25, 0.1], c: "prop", bare: true },
  ] },
  // a cluster of glowing crystals on the helmet
  "glow-crystal": { at: "hat", parts: [
    { s: "cone", d: [0.06, 0.26], p: [0.0, 0.18, 0.1], r: [0.2, 0, 0], c: "prop", glow: true },
    { s: "cone", d: [0.045, 0.18], p: [0.1, 0.14, 0.08], r: [0.1, 0, -0.5], c: "prop", glow: true },
    { s: "cone", d: [0.045, 0.18], p: [-0.1, 0.14, 0.08], r: [0.1, 0, 0.5], c: "prop", glow: true },
  ] },
  // two gears on the helmet's side
  gears: { at: "hat", parts: [
    { s: "cyl", d: [0.15, 0.15, 0.05], p: [0.45, 0.0, 0.05], r: [0, 0, Q], m: true },
    ...[0, 1, 2, 3, 4, 5].map((k): Part => ({ s: "box", d: [0.05, 0.06, 0.06], p: [0.45, 0.18 * Math.cos(k * 1.05), 0.05 + 0.18 * Math.sin(k * 1.05)], r: [k * 1.05, 0, 0], m: true, bare: true })),
    { s: "cyl", d: [0.09, 0.09, 0.05], p: [0.43, 0.2, 0.25], r: [0, 0, Q], c: "prop" },
  ] },
  // a lantern at his side
  "hand-lantern": { at: "body", parts: [
    { s: "box", d: [0.16, 0.2, 0.16], p: [0.52, -0.2, 0.18], c: "amber", glow: true },
    { s: "cone", d: [0.13, 0.08], p: [0.52, -0.06, 0.18], r: [0, Math.PI / 4, 0], c: "prop" },
    { s: "torus", d: [0.05, 0.012], p: [0.52, 0.0, 0.18], c: "prop", bare: true },
    { s: "box", d: [0.18, 0.03, 0.18], p: [0.52, -0.31, 0.18], c: "prop" },
  ] },
  // a mole looking out of the helmet's top
  mole: { at: "top", parts: [
    { s: "sphere", d: [0.14], p: [0, 0.04, 0.02], c: "prop" },
    { s: "sphere", d: [0.04], p: [0, 0.03, 0.15], c: "petal" },
    { s: "sphere", d: [0.03], p: [0.06, 0.12, 0.1], c: "ink", bare: true },
    { s: "sphere", d: [0.03], p: [-0.06, 0.12, 0.1], c: "ink", bare: true },
  ] },
  // a big gold nugget on the hat
  nugget: { at: "hat", parts: [
    { s: "ico", d: [0.13], p: [0.28, 0.02, 0.2], k: [1.2, 0.9, 1], c: "prop" },
    { s: "ico", d: [0.06], p: [0.36, -0.07, 0.25], c: "prop", bare: true },
  ] },
  // a smith's hammer on his back, its head over the shoulder
  hammer: { at: "body", parts: [
    { s: "cyl", d: [0.035, 0.035, 0.8], p: [0.18, 0.1, -0.55], r: [0, 0, -0.45], c: "walnut" },
    { s: "box", d: [0.28, 0.14, 0.14], p: [0.35, 0.47, -0.55], r: [0, 0, -0.45], m: true },
  ] },
  // a pair of bellows at his side
  bellows: { at: "body", parts: [
    { s: "sphere", d: [0.2], p: [0.52, -0.2, 0.12], k: [0.3, 1, 0.75], c: "prop" },
    { s: "cone", d: [0.04, 0.2], p: [0.52, -0.42, 0.18], r: [Math.PI, 0, 0], c: "pewter" },
    { s: "box", d: [0.05, 0.36, 0.2], p: [0.58, -0.17, 0.12], c: "walnut" },
  ] },
  // a rolled map at his side, tied
  "map-scroll": { at: "body", parts: [
    { s: "cyl", d: [0.07, 0.07, 0.42], p: [0.5, -0.15, 0.15], r: [0.5, 0, 0.2], c: "prop" },
    { s: "torus", d: [0.072, 0.015], p: [0.5, -0.15, 0.15], r: [Q + 0.5, 0, 0.2], c: "cap", bare: true },
  ] },
  // a long thermometer at his side, its bulb red
  thermometer: { at: "body", parts: [
    { s: "cyl", d: [0.035, 0.035, 0.6], p: [0.5, 0.05, 0.12], r: [0, 0, -0.15], c: "prop" },
    { s: "sphere", d: [0.06], p: [0.46, -0.26, 0.12], c: "cap" },
    { s: "cyl", d: [0.015, 0.015, 0.3], p: [0.475, -0.08, 0.15], r: [0, 0, -0.15], c: "cap", bare: true },
  ] },
  // a pineapple on the hat
  pineapple: { at: "top", parts: [
    { s: "sphere", d: [0.13], p: [0, 0.1, 0], k: [1, 1.3, 1], c: "prop" },
    ...[0, 1, 2, 3].map((k): Part => ({ s: "cone", d: [0.04, 0.2], p: [0.04 * Math.cos(k * Q), 0.3, 0.04 * Math.sin(k * Q)], r: [0.4 * Math.sin(k * Q), 0, -0.4 * Math.cos(k * Q)], c: "fern", bare: true })),
  ] },
  // a neon flame sign on the hat
  "neon-flame": { at: "hat", parts: [
    { s: "cone", d: [0.12, 0.32], p: [0.34, 0.08, 0.12], r: [0, 0, -0.2], k: [1, 1, 0.3], c: "prop", glow: true },
    { s: "cone", d: [0.06, 0.18], p: [0.35, 0.02, 0.15], r: [0, 0, -0.2], k: [1, 1, 0.3], c: "lemon", glow: true, bare: true },
  ] },
  // a clay pot on the hat's tip
  "clay-pot": { at: "top", parts: [
    { s: "cyl", d: [0.12, 0.08, 0.16], p: [0, 0.06, 0], c: "prop" },
    { s: "torus", d: [0.12, 0.025], p: [0, 0.14, 0], r: [Q, 0, 0], c: "prop" },
  ] },
  // a torch at his side, burning
  torch: { at: "body", parts: [
    { s: "cyl", d: [0.04, 0.03, 0.5], p: [0.52, -0.12, 0.15], r: [0.2, 0, -0.1], c: "walnut" },
    { s: "cyl", d: [0.06, 0.05, 0.08], p: [0.54, 0.12, 0.2], r: [0.2, 0, -0.1], c: "prop" },
    { s: "cone", d: [0.07, 0.2], p: [0.55, 0.25, 0.23], c: "amber", glow: true, bare: true },
  ] },
  // a kettle on the hat's tip, steaming
  kettle: { at: "top", parts: [
    { s: "sphere", d: [0.12], p: [0, 0.08, 0], k: [1, 0.8, 1], c: "prop" },
    { s: "cyl", d: [0.02, 0.03, 0.14], p: [0.12, 0.1, 0], r: [0, 0, -0.9], c: "prop" },
    { s: "torus", d: [0.08, 0.015, Math.PI], p: [0, 0.14, 0], r: [0, Q, 0], c: "ink", bare: true },
    { s: "sphere", d: [0.04], p: [0.2, 0.2, 0], c: "white", bare: true },
  ] },
  // a lightning rod on the hat's tip
  "lightning-rod": { at: "top", parts: [
    { s: "cyl", d: [0.015, 0.025, 0.4], p: [0, 0.2, 0], m: true },
    { s: "sphere", d: [0.04], p: [0, 0.18, 0], m: true },
    { s: "cone", d: [0.03, 0.08], p: [0, 0.43, 0], c: "prop", glow: true, bare: true },
  ] },
  // a weathervane on the hat's tip, its rooster
  weathervane: { at: "top", parts: [
    { s: "cyl", d: [0.015, 0.015, 0.25], p: [0, 0.12, 0], m: true },
    { s: "cyl", d: [0.01, 0.01, 0.3], p: [0, 0.08, 0], r: [0, 0, Q], m: true, bare: true },
    { s: "sphere", d: [0.07], p: [0, 0.28, 0], k: [1.4, 0.8, 0.35], m: true },
    { s: "cone", d: [0.06, 0.12], p: [-0.12, 0.3, 0], r: [0, 0, 1.0], k: [1, 1, 0.35], m: true },
    { s: "sphere", d: [0.04], p: [0.08, 0.34, 0], k: [1, 1, 0.5], m: true },
  ] },
  // a barometer's dial on his chest
  barometer: { at: "body", parts: [
    { s: "cyl", d: [0.15, 0.15, 0.04], p: [0.25, -0.22, 0.45], r: [Q - 0.4, 0.5, 0], c: "prop" },
    { s: "disc", d: [0.12], p: [0.265, -0.21, 0.475], r: [-0.4, 0.5, 0], c: "cream", bare: true },
    { s: "box", d: [0.015, 0.09, 0.01], p: [0.27, -0.19, 0.485], r: [-0.4, 0.5, 0.5], c: "cap", bare: true },
  ] },
  // a spellbook at his side, its runes glowing
  spellbook: { at: "body", parts: [
    { s: "box", d: [0.07, 0.3, 0.24], p: [0.55, -0.2, 0.15], r: [0, 0, -0.2], c: "prop" },
    { s: "box", d: [0.06, 0.27, 0.22], p: [0.57, -0.2, 0.15], r: [0, 0, -0.2], c: "cream", bare: true },
    { s: "oct", d: [0.05], p: [0.6, -0.18, 0.15], k: [0.3, 1, 1], c: "prop", glow: true, bare: true },
  ] },
  // an umbrella up over his hat, off to one side
  umbrella: { at: "body", parts: [
    { s: "cyl", d: [0.018, 0.018, 0.95], p: [0.44, 0.24, -0.05], r: [0, 0, -0.06], c: "walnut" },
    { s: "sphere", d: [0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2], p: [0.46, 0.72, -0.05], k: [1, 0.5, 1], c: "prop" },
    { s: "torus", d: [0.05, 0.015, Math.PI], p: [0.41, -0.23, -0.05], r: [0, 0, Math.PI], c: "walnut", bare: true },
  ] },
  // a kite flying off his back on its string
  kite: { at: "body", parts: [
    { s: "oct", d: [0.2], p: [0.5, 0.75, -0.55], k: [0.75, 1.1, 0.12], r: [0, -0.5, -0.3], c: "prop" },
    { s: "cyl", d: [0.006, 0.006, 0.75], p: [0.3, 0.42, -0.4], r: [0.5, 0, -0.8], c: "ink", bare: true },
    { s: "box", d: [0.06, 0.04, 0.01], p: [0.55, 0.46, -0.55], r: [0, -0.5, -0.5], c: "accent", bare: true },
  ] },
  // a crystal ball at his side, on its stand
  "crystal-ball": { at: "body", parts: [
    { s: "cyl", d: [0.08, 0.12, 0.08], p: [0.52, -0.33, 0.18], c: "walnut" },
    { s: "sphere", d: [0.15], p: [0.52, -0.15, 0.18], c: "prop", glow: true },
    { s: "sphere", d: [0.04], p: [0.48, -0.1, 0.28], c: "white", glow: true, bare: true },
  ] },
  // a pair of small stone wings on his back
  "stone-wings": { at: "body", parts: [
    { s: "sphere", d: [0.3], p: [0.3, 0.12, -0.5], r: [0, 0.5, 0.5], k: [1, 0.45, 0.12], m: true },
    { s: "sphere", d: [0.3], p: [-0.3, 0.12, -0.5], r: [0, -0.5, -0.5], k: [1, 0.45, 0.12], m: true },
  ] },
  // an owl perched on the hat's side
  owl: { at: "hat", parts: [
    { s: "sphere", d: [0.13], p: [0.36, -0.02, 0.1], k: [1, 1.2, 1], c: "prop" },
    { s: "sphere", d: [0.045], p: [0.32, 0.05, 0.21], c: "white", bare: true },
    { s: "sphere", d: [0.045], p: [0.42, 0.05, 0.19], c: "white", bare: true },
    { s: "sphere", d: [0.02], p: [0.32, 0.05, 0.25], c: "ink", bare: true },
    { s: "sphere", d: [0.02], p: [0.43, 0.05, 0.23], c: "ink", bare: true },
    { s: "cone", d: [0.04, 0.08], p: [0.33, 0.14, 0.1], c: "prop", bare: true },
    { s: "cone", d: [0.04, 0.08], p: [0.43, 0.14, 0.08], c: "prop", bare: true },
  ] },
  // the Legendaries' pieces
  "crystal-cluster": { legend: true },
  "lava-vent": { legend: true },
  thundercloud: { legend: true },
  "mill-sails": { legend: true },
  epaulettes: { legend: true },
  "fairy-ring": { legend: true },
  "frost-cap": { legend: true },
};

/** The props, by code (0: none): PROP_DESIGNS' order, so a new one goes last. */
export const PROPS: readonly string[] = ["", ...Object.keys(PROP_DESIGNS)];
