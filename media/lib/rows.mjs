// @ts-check
// Buttons side by side, as a player sees them (components/ui.tsx Button, Chip):
// in a row, every control as tall as the others, on one top, and their words
// on one baseline; off (disabled), a button keeps the box it has on. For the
// headless checks (scripts/builderui.ts, media/gnomes/shop-open.mjs): each is
// an expression to evaluate in the page (its function runs there, not in Node).
/* global document, NodeFilter, getComputedStyle */

/**
 * In the page: what is out of line in each row, [] when all is: a control's
 * box (height or top) off the first's by over half a pixel, or its words'
 * baseline off by over one. A row: box, the controls (those shown); words, the
 * elements whose first words share the baseline (none: the controls' own, an
 * icon's sign left out); by, a grid whose row tracks split the controls into
 * rows (a toolbar on two lines).
 * @param {{ name: string, box: string, words?: string, by?: string }[]} rows
 */
export const misaligned = (rows) => `(${((/** @type {typeof rows} */ rows) => {
  const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement("canvas").getContext("2d"));
  const shown = (/** @type {Element} */ e) => e.checkVisibility() && e.getBoundingClientRect().width > 0;
  // the baseline of an element's first words: their line's top, plus its font's ascent
  const baseline = (/** @type {Element} */ e) => {
    const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const p = n.parentElement;
      if (!n.textContent?.trim() || !p || !shown(p)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const line = range.getClientRects()[0];
      if (!line) continue;
      const s = getComputedStyle(p);
      ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      return line.top + ctx.measureText(n.textContent).fontBoundingBoxAscent;
    }
    return null;
  };
  /** @type {string[]} */
  const out = [];
  for (const { name, box, words, by } of rows) {
    const grid = by ? document.querySelector(by) : null;
    const tracks = grid ? getComputedStyle(grid).gridTemplateRows.split(" ").map(parseFloat) : [];
    const top = grid ? grid.getBoundingClientRect().top + parseFloat(getComputedStyle(grid).borderTopWidth) : 0, gap = grid ? parseFloat(getComputedStyle(grid).rowGap) || 0 : 0;
    // (the track a control's middle is in)
    const trackOf = (/** @type {DOMRect} */ r) => {
      let y = top;
      for (const [i, t] of tracks.entries()) if ((y += t + gap) > r.top + r.height / 2) return i;
      return tracks.length - 1;
    };
    /** @type {Map<number, { label: string, r: DOMRect, base: number | null }[]>} */
    const lines = new Map();
    const all = [...document.querySelectorAll(box)].filter(shown);
    if (!all.length) out.push(`${name}: no control shown (${box})`);
    for (const e of all) {
      const r = e.getBoundingClientRect(), k = grid ? trackOf(r) : 0;
      const label = (e.getAttribute("aria-label") || e.textContent || e.className).trim().slice(0, 24);
      lines.set(k, [...(lines.get(k) || []), { label, r, base: words ? null : e.matches(".btn--icon") ? null : baseline(e) }]);
    }
    for (const [k, line] of lines) {
      const at = `${name}${lines.size > 1 ? ` (line ${k + 1})` : ""}`, [a] = line;
      for (const c of line.slice(1)) {
        if (Math.abs(c.r.height - a.r.height) > 0.5) out.push(`${at}: ${c.label} ${c.r.height} px tall, ${a.label} ${a.r.height}`);
        else if (Math.abs(c.r.top - a.r.top) > 0.5) out.push(`${at}: ${c.label} at ${c.r.top}, ${a.label} at ${a.r.top}`);
      }
      const bases = words ? [...document.querySelectorAll(words)].filter((e) => shown(e) && (!grid || trackOf(e.getBoundingClientRect()) === k)).map((e) => ({ label: (e.textContent || "").trim().slice(0, 24), base: baseline(e) })) : line;
      const set = bases.filter((b) => b.base != null);
      for (const b of set.slice(1)) if (Math.abs(/** @type {number} */ (b.base) - /** @type {number} */ (set[0].base)) > 1) out.push(`${at}: "${b.label}" on a baseline at ${b.base?.toFixed(1)}, "${set[0].label}" at ${set[0].base?.toFixed(1)}`);
    }
  }
  return out;
}).toString()})(${JSON.stringify(rows)})`;

/** In the page: a control's box as a player sees it (its size, its edge's width, its drop's offsets: no colour), to compare off and on. */
export const footprint = (/** @type {string} */ sel) => `(() => {
  const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return { l: r.left, t: r.top, w: r.width, h: r.height, edge: s.borderTopWidth + " " + s.borderBottomWidth + " " + s.borderTopStyle, drop: s.boxShadow.replace(/rgba?\\([^)]*\\)|#[0-9a-f]+/gi, "").trim() };
})()`;
