// A gnome as the chain draws him (svg.gno): the realm's answer for his
// picture, in each form it gives it (TokenURI's data URI; his page's
// markdown, for one not minted yet; TokenMetadata's JSON), read to its SVG,
// the SVG checked against what a portrait is drawn with and refused for
// anything else, then shown only as an <img>'s data URI: never put in the
// page's DOM, so nothing in it runs even if a check missed it. Each gnome is
// read once a visit, a few at a time; any failure is null, and the screen
// shows his 3D portrait instead. The look a viewer picks (3D or on chain)
// is kept in this browser.
import type { Chain } from "../chain";
import { makeShop } from "./shop";

/** How the shop shows a gnome: his 3D portrait (the thumbnails), or the SVG the chain draws. */
export type Look = "3d" | "chain";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_URI = "data:image/svg+xml;base64,";
/** The largest SVG taken, in characters (the heaviest portrait is about 6,000). */
const MAX = 100_000;

// The elements and attributes a portrait is drawn with: shapes, groups, and
// paints and clips defined inside it. Nothing that runs, links, embeds or
// animates (script, a, image, use, foreignObject, set, animate…), and no
// handler (on…): anything not listed refuses the whole picture.
const ELEMENTS = new Set(["svg", "title", "desc", "style", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask"]);
const ATTRIBUTES = new Set(["xmlns", "viewBox", "preserveAspectRatio", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "fx", "fy", "d", "points", "transform", "class", "id", "style", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
  "stroke-linejoin", "stroke-linecap", "stroke-dasharray", "stroke-miterlimit", "opacity", "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "clip-path", "clip-rule", "mask"]);
/** The elements that hold text: the rest hold elements alone. */
const TEXT = new Set(["title", "desc", "style"]);
// a tag, its attributes each quoted; anything else at a "<" (a comment, CDATA, a doctype, an instruction) is refused
const TAG = /<(\/?)([A-Za-z][\w.:-]*)((?:\s+[^\s=<>/"']+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const ATTR = /\s+([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
// XML's own entities (a doctype could define others: there is none)
const ENTITY = /&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#x([0-9a-fA-F]{1,6}));/g;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** A value as the browser reads it (its entities undone), null when it holds an entity XML does not define. */
function unescape(v: string) {
  if (/&/.test(v.replace(ENTITY, ""))) return null;
  return v.replace(ENTITY, (_, n: string | undefined, d: string | undefined, x: string | undefined) => (n ? NAMED[n] : String.fromCodePoint(Math.min(0x10ffff, parseInt(d ?? x ?? "0", d ? 10 : 16)))));
}
/** Whether a value (css: a style's) reaches nothing outside the picture: url() only to its own ids, no script, no CSS escape, at-rule or comment. */
function safe(raw: string, css: boolean) {
  const v = unescape(raw);
  return v != null && !/url\s*\(\s*(?!['"]?\s*#)/i.test(v) && !/javascript:|expression\s*\(|\\/i.test(v) && !(css && /@|\/\*/.test(v));
}

/** The SVG as it is when it is a portrait (an XML declaration before it dropped), null for anything else: one svg root in
 *  SVG's namespace, the elements and attributes above alone, every tag closed, no reference out of it. A refusal, never a repair. */
export function cleanSvg(svg: string): string | null {
  const s = svg.replace(/^﻿?\s*(?:<\?xml\s[^<>?]*\?>)?\s*/, "").trimEnd();
  if (s.length > MAX) return null;
  const open: string[] = [];
  let roots = 0;
  for (let at = 0; at < s.length;) {
    if (s[at] !== "<") {
      const end = s.indexOf("<", at), text = s.slice(at, end < 0 ? s.length : end), inside = open[open.length - 1];
      if (text.trim() && !(inside && TEXT.has(inside) && safe(text, inside === "style"))) return null;
      at += text.length;
      continue;
    }
    TAG.lastIndex = at;
    const m = TAG.exec(s);
    if (!m) return null;
    const [all, close, name, attrs, self] = m;
    at += all.length;
    if (close) {
      if (attrs || self || open.pop() !== name) return null;
      continue;
    }
    // the root is the one svg, and nothing else is
    if (!ELEMENTS.has(name) || (name === "svg") !== !open.length || (!open.length && roots++)) return null;
    const seen = new Set<string>();
    for (const [, k, dq, sq] of attrs.matchAll(ATTR)) {
      const v = dq ?? sq ?? "";
      if (seen.has(k) || !ATTRIBUTES.has(k) || !safe(v, k === "style") || (k === "xmlns" && v !== SVG_NS)) return null;
      seen.add(k);
    }
    if (name === "svg" && !seen.has("xmlns")) return null;
    if (!self) open.push(name);
  }
  return roots === 1 && !open.length ? s : null;
}

const fromBase64 = (b64: string) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
};
const toBase64 = (text: string) => {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
};
/** The SVG a data URI holds (base64 or percent-encoded), null for another type or one that does not decode. */
function fromUri(uri: string) {
  const m = /^data:image\/svg\+xml((?:;[^;,]*)*?)(;base64)?,([\s\S]*)$/.exec(uri);
  if (!m) return null;
  if (m[2]) return fromBase64(m[3].replace(/\s+/g, ""));
  try {
    return decodeURIComponent(m[3]);
  } catch {
    return null;
  }
}
/** The SVG in a realm's answer: a data URI (TokenURI), a page with one as its picture (Render), JSON whose image is one
 *  (TokenMetadata), the SVG itself or its bare base64. */
function svgIn(answer: string, json = true): string | null {
  const a = answer.trim();
  if (a.startsWith("{")) {
    if (!json) return null;
    let v: unknown;
    try { v = JSON.parse(a); } catch { return null; }
    const image = typeof v === "object" && v !== null ? (v as { image?: unknown }).image : null;
    return typeof image === "string" ? svgIn(image, false) : null;
  }
  if (a.startsWith("data:")) return fromUri(a);
  if (a.startsWith("<")) return a;
  const pictured = /!\[[^\]]*\]\((data:image\/svg\+xml[^)\s]*)\)/.exec(a);
  if (pictured) return fromUri(pictured[1]);
  return /^[A-Za-z0-9+/]+={0,2}$/.test(a) ? fromBase64(a) : null;
}

/** A realm's answer for a gnome's picture as the data URI the page shows (the SVG checked, in base64), null when it
 *  holds no portrait, or one cleanSvg refuses. */
export function portraitOf(answer: string): string | null {
  const svg = svgIn(answer), clean = svg && cleanSvg(svg);
  return clean ? SVG_URI + toBase64(clean) : null;
}

/** The on-chain portraits of a visit: get, a gnome's (null for none, never a rejection); known, what is already
 *  read (undefined: not yet), for a screen to draw at once. */
export interface Portraits { get: (id: number) => Promise<string | null>; known: (id: number) => string | null | undefined }
/** Portraits read with read (a gnome's id to the realm's answer), each once, most at a time (4); a read that fails
 *  is not kept, and is asked again the next time. */
export function portraits(read: (id: number) => Promise<string>, most = 4): Portraits {
  const kept = new Map<number, string | null>(), asked = new Map<number, Promise<string | null>>(), queue: (() => void)[] = [];
  const cap = Math.max(1, most | 0);
  let busy = 0;
  const next = () => {
    for (; busy < cap && queue.length; busy++) queue.shift()!();
  };
  const get = (id: number): Promise<string | null> => {
    if (kept.has(id)) return Promise.resolve(kept.get(id) ?? null);
    let p = asked.get(id);
    if (!p) {
      p = new Promise<string | null>((done) => {
        queue.push(() => {
          read(id)
            .then((a) => { const url = portraitOf(a); kept.set(id, url); done(url); }, () => done(null))
            .finally(() => (busy--, asked.delete(id), next()));
        });
      });
      asked.set(id, p);
      next();
    }
    return p;
  };
  return { get, known: (id) => kept.get(id) };
}

const visits = new WeakMap<object, Portraits>();
/** The on-chain portraits on this chain, one store a visit (the shop's gallery and a gnome's sheet share it). */
export function portraitsOf(chain: Pick<Chain, "qjson" | "qstr">): Portraits {
  let p = visits.get(chain);
  if (!p) {
    const shop = makeShop(chain);
    visits.set(chain, (p = portraits((id) => shop.portrait(id))));
  }
  return p;
}

const LOOK_KEY = "gnogolf.gnomes.look";
/** The look this viewer picked, 3D when none (or this browser keeps nothing). */
export function savedLook(): Look {
  try {
    return localStorage.getItem(LOOK_KEY) === "chain" ? "chain" : "3d";
  } catch {
    return "3d";
  }
}
export function saveLook(look: Look) {
  try { localStorage.setItem(LOOK_KEY, look); } catch {}
}
