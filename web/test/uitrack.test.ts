// The interface's named clicks: every row of the table names its action (and its detail), anything else none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { UI, actionOf, watchClicks } from "../lib/uitrack.ts";

// an element a row's selector matches, with classes, a data-kind and an href; closest() finds it from any of the table's selectors
// (and its screen, holding a locked gnome's band or not)
const at = (sel: string, classes: string[] = [], href = "", kind?: string, lock = false) => {
  const el = { classList: classes, href, dataset: { kind }, matches: (s: string) => s === sel, closest: (all: string) => (all === ".screen--pick" ? { querySelector: () => (lock ? {} : null) } : all.includes(sel) ? el : null) };
  return el as unknown as Element;
};

test("each row of the table: its action, its detail from the control's own classes or link", () => {
  for (const [sel, action] of UI) assert.equal(actionOf(at(sel, [], "https://gno.land/"))?.action, action, sel);
  assert.deepEqual(actionOf(at(".world:not([disabled])", ["world", "world--mines", "tint--mines"])), { action: "cup_picked", cup: "mines" });
  assert.deepEqual(actionOf(at(".modes__list .mode:not([disabled])", ["mode", "mode--duel"])), { action: "mode_picked", mode: "duel" });
  assert.deepEqual(actionOf(at('a[target="_blank"]', [], "https://onyx.testnets.gno.land/u/g1abc")), { action: "external_link_opened", host: "onyx.testnets.gno.land", kind: "player" }, "a link's host, never its path (an address)");
  assert.deepEqual(actionOf(at('a[target="_blank"]', [], "not a url")), { action: "external_link_opened", host: undefined, kind: "other" }, "an odd href never throws in the listener");
  assert.deepEqual(actionOf(at(".screen--pick .btn--play", [], "", undefined, true)), { action: "gnome_chosen", locked: true }, "Play on a locked gnome plays the one chosen before");
  assert.deepEqual(actionOf(at(".screen--pick .btn--play")), { action: "gnome_chosen", locked: false });
});

test("a link opened is named by what it opens: its class, else its address's shape", () => {
  const kind = (href: string, classes: string[] = []) => actionOf(at('a[target="_blank"]', classes, href))?.kind;
  const A = "g1" + "q".repeat(38), WEB = "https://gno.land/r/gnogolf/golf";
  assert.equal(kind("https://x.com/intent/post?text=hi", ["share__icon"]), "share");
  assert.equal(kind("https://github.com/alexiscolin/gno-golf/issues/new"), "github");
  assert.equal(kind("https://www.adena.app/"), "adena");
  assert.equal(kind("https://faucet.gno.land"), "faucet");
  assert.equal(kind("https://gno.land/r/gnogolf/holes/garden1$source"), "src");
  assert.equal(kind(`${WEB}:garden/3/data`), "src");
  assert.equal(kind("https://gno.land/r/x", ["src"]), "src");
  assert.equal(kind(`https://gno.land/u/${A}`), "player");
  assert.equal(kind(`${WEB}:garden/3/${A}`), "round");
  assert.equal(kind(`${WEB}:garden/3#pro`), "board");
  assert.equal(kind(`${WEB}$help&func=Claim`), "form");
  assert.equal(kind("https://example.com/"), "other");
  assert.deepEqual(actionOf(at(".rival__pick:not([disabled])", ["mode", "rival__pick"], "", "today")), { action: "rival_picked", kind: "today" }, "a rival pick is no mode pick");
});

test("a click on nothing named, or not on an element: no action", () => {
  assert.equal(actionOf(at(".somewhere-else")), null);
  assert.equal(actionOf(null), null);
  assert.equal(actionOf({} as EventTarget), null);
});

test("watchClicks listens once on the page, passive, and stops", () => {
  const calls: unknown[][] = [];
  const doc = { addEventListener: (...a: unknown[]) => calls.push(["add", ...a]), removeEventListener: (...a: unknown[]) => calls.push(["remove", ...a]) } as unknown as Document;
  const stop = watchClicks(doc);
  assert.deepEqual([calls[0][0], calls[0][1], calls[0][3]], ["add", "click", { capture: true, passive: true }]);
  stop();
  assert.deepEqual([calls[1][0], calls[1][1], calls[1][2]], ["remove", "click", calls[0][2]]);
});

// a small tree and a selector matcher (tags, classes, attributes, :not(), descendants, lists): the table's
// selectors against the real buttons' shapes, not their own strings
type Node = { tag: string; classList: string[]; attrs: Record<string, string>; dataset: Record<string, string>; parent: Node | null; href?: string };
const node = (tag: string, cls: string, parent: Node | null = null, attrs: Record<string, string> = {}): Node => ({ tag, classList: cls.split(" ").filter(Boolean), attrs, dataset: {}, parent });
const one = (n: Node, part: string): boolean => {
  const not = /:not\(\[([a-z-]+)\]\)$/.exec(part);
  if (not) return !(not[1] in n.attrs) && one(n, part.slice(0, not.index));
  const tag = /^[a-z]+/.exec(part)?.[0];
  return (!tag || n.tag === tag) && [...part.matchAll(/\.([\w-]+)/g)].every(([, c]) => n.classList.includes(c)) && [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, k, v]) => k in n.attrs && (v === undefined || n.attrs[k] === v));
};
const matches = (n: Node, sel: string) => sel.split(", ").some((s) => {
  const parts = s.trim().split(/\s+/);
  if (!one(n, parts.pop()!)) return false;
  for (let up = n.parent; parts.length && up; up = up.parent) if (one(up, parts[parts.length - 1])) parts.pop();
  return !parts.length;
});
const el = (n: Node): Element => {
  const e = { classList: n.classList, dataset: n.dataset, href: n.href || "", matches: (s: string) => matches(n, s), closest: (s: string) => { for (let x: Node | null = n; x; x = x.parent) if (matches(x, s)) return x === n ? e : el(x); return null; } };
  return e as unknown as Element;
};

test("the real shapes: the rival screen's leaderboard link is no surprise, its picks no mode, a mode card a mode", () => {
  const links = node("span", "rival__links");
  assert.equal(actionOf(el(node("button", "linkish rival__all", links))), null, "See the whole leaderboard: the boards screen says it");
  assert.equal(actionOf(el(node("button", "linkish rival__all rival__surprise", links)))?.action, "rival_surprise");
  assert.equal(actionOf(el(node("button", "linkish rival__all rival__surprise", links, { disabled: "" }))), null, "a disabled surprise is no pick");
  const pick = node("button", "mode rival__pick tint--a", node("ul", "rival__picks"));
  pick.dataset.kind = "today";
  assert.deepEqual(actionOf(el(node("span", "rival__go", pick))), { action: "rival_picked", kind: "today" }, "its Race label is the pick");
  const card = node("button", "mode mode--duel", node("ul", "modes__list"));
  assert.deepEqual(actionOf(el(node("span", "mode__name", card))), { action: "mode_picked", mode: "duel" });
});
