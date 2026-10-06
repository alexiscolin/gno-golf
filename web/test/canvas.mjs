// A stand-in for the one DOM call the gnome's build makes (a canvas for a
// texture: the pirate's stripes, the lamp's glow), so makeBall runs in a unit
// test: a 2D context that draws nothing.
const ctx = new Proxy({}, { get: (_, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}) });
globalThis.document ??= /** @type {Document} */ (/** @type {unknown} */ ({ createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }));
