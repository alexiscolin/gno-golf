// Colour as people see it, for the collection's readability rules
// (docs/gnomes/design.md, "Readable at ball size"): OKLab, where a distance
// is about how different two colours look.

/** A colour in OKLab: lightness 0..1, and its two hues. */
export type Lab = readonly [L: number, a: number, b: number];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** An sRGB colour (0xrrggbb) in OKLab. */
export function oklab(hex: number): Lab {
  const r = lin(((hex >> 16) & 255) / 255), g = lin(((hex >> 8) & 255) / 255), b = lin((hex & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** How different two colours look: 0 the same, about 0.02 just told apart, 0.1 plainly. */
export function deltaE(x: number, y: number) {
  const [a, b] = [oklab(x), oklab(y)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** x laid over y at opacity o (a ghost over the ground), as one colour. */
export function over(x: number, y: number, o: number) {
  const ch = (s: number) => Math.round(((x >> s) & 255) * o + ((y >> s) & 255) * (1 - o));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A body too dark for ink eyes to read on: his eyes are lit instead (scene/gnome.ts). */
export const darkBody = (body: number) => oklab(body)[0] < 0.55;
