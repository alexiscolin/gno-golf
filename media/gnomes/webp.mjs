// @ts-check
// An animated WebP from still ones: each frame's image chunks (VP8, VP8L,
// ALPH) wrapped in an ANMF chunk, behind a VP8X header and an ANIM chunk
// (Google's container spec, "Animation"). The frames as Chrome's
// canvas.toDataURL("image/webp") writes them, all one size. No encoder needed.

/** @param {Buffer[]} chunks */
const riff = (chunks) => {
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
};
/** A chunk: its tag, its size, its data, padded to even. @param {string} tag @param {Buffer} data */
const chunk = (tag, data) => {
  const h = Buffer.alloc(8);
  h.write(tag, 0);
  h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};
const u24 = (/** @type {number} */ n) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255]);

/** A still WebP's image chunks (what an ANMF frame holds). @param {Buffer} webp */
function imageChunks(webp) {
  const out = [];
  for (let at = 12; at + 8 <= webp.length; ) {
    const tag = webp.toString("latin1", at, at + 4), size = webp.readUInt32LE(at + 4);
    if (tag === "VP8 " || tag === "VP8L" || tag === "ALPH") out.push(webp.subarray(at, at + 8 + size + (size % 2)));
    at += 8 + size + (size % 2);
  }
  return Buffer.concat(out);
}

/**
 * The frames as one looping animation.
 * @param {Buffer[]} frames still WebPs, all w × h
 * @param {number} w @param {number} h @param {number} ms each frame's time
 */
export function animate(frames, w, h, ms) {
  const flags = Buffer.from([0x02, 0, 0, 0]); // animation; (no alpha: an opaque background)
  const vp8x = chunk("VP8X", Buffer.concat([flags, u24(w - 1), u24(h - 1)]));
  const anim = chunk("ANIM", Buffer.from([0xff, 0xff, 0xff, 0xff, 0, 0])); // background, loop forever
  const anmf = frames.map((f) => chunk("ANMF", Buffer.concat([u24(0), u24(0), u24(w - 1), u24(h - 1), u24(ms), Buffer.from([0x02]), imageChunks(f)])));
  return riff([vp8x, anim, ...anmf]);
}
