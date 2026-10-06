// A stand-in for the one DOM call the gnome's build makes (a canvas for a
// texture: a pattern, a material's marks, the lamp's glow), so makeBall runs
// in a unit test. Its 2D context draws nothing but writes down every call and
// every setting it is given, in order, as the canvas's __log: what a texture
// would show, for test/looks.ts to fingerprint.
/** @returns {{ ctx: object, log: string[] }} */
function recorder() {
  /** @type {string[]} */
  const log = [];
  const gradient = { addColorStop: (/** @type {unknown[]} */ ...a) => void log.push("stop" + JSON.stringify(a)) };
  const ctx = new Proxy({}, {
    get: (_, k) => (/** @type {unknown[]} */ ...a) => (log.push(String(k) + JSON.stringify(a)), String(k).startsWith("create") ? gradient : undefined),
    set: (_, k, v) => (log.push(String(k) + "=" + JSON.stringify(v)), true),
  });
  return { ctx, log };
}
globalThis.document ??= /** @type {Document} */ (/** @type {unknown} */ ({
  createElement: () => {
    const r = recorder();
    return { width: 0, height: 0, getContext: () => r.ctx, __log: r.log };
  },
}));
