// @ts-check
// The gnome shop tried in the repo's headless Chrome against a local chain
// seeded by scripts/e2e-gnomes.sh SEED=1 (its seed.env), the wallet a
// stand-in that signs with the seed's throwaway keys (wallet.mjs), the client
// a dev server on that chain with NEXT_PUBLIC_GNOMES=1 (APP). Each step is a
// screen or a signature, checked against the chain, screenshotted at each
// width it names, and audited: no sideways scroll at any width, nothing
// wider than the window. Prints PASS/FAIL a step; exits non-zero on a FAIL.
//   SEED=<seed.env> APP=http://localhost:3311 OUT=<dir> node media/gnomes/shop-e2e.mjs
// Local only: seedEnv refuses an RPC that is not this machine's.
import fs from "node:fs";
import { launch, sleep } from "../lib/cdp.mjs";
import { fakeAdena, seedEnv } from "./wallet.mjs";

const env = seedEnv(process.env.SEED || "");
const APP = process.env.APP || "http://localhost:3311";
const OUT = process.env.OUT || "shots";
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [320, 390, 768, 1280, 1440];
let failed = 0;
const say = (/** @type {boolean} */ ok, /** @type {string} */ what, /** @type {string} */ more = "") => (ok || failed++, console.log(`${ok ? "PASS" : "FAIL"} ${what}${more ? `: ${more}` : ""}`));

/** A qeval of the gnomes realm, its string unquoted. @param {string} expr */
async function qg(expr) {
  const hex = Buffer.from(`${env.GNOMES}.${expr}`).toString("hex");
  const r = await (await fetch(`${env.RPC}/abci_query?path=%22vm/qeval%22&data=0x${hex}`)).json();
  const raw = Buffer.from(r.result.response.ResponseBase.Data || "", "base64").toString();
  const m = /^\("((?:[^"\\]|\\.)*)" [^ ()]+\)/s.exec(raw);
  return m ? JSON.parse(`"${m[1]}"`) : raw;
}

/** A page as key (a seed key, or "" for none), at width (a computer 800 high, a phone 844); its stand-in wallet; off:
 *  the wallet there but not connected (as after Disconnect). @param {string} key @param {number} width */
async function open(key, width = 1280, off = false) {
  const b = await launch({ width, height: width < 600 ? 844 : 800, mobile: width < 600, touch: width < 600 });
  const w = key ? await fakeAdena(b, env, key) : null;
  if (off) await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("gnogolf.adenaOff", "1"); } catch {}` });
  return { b, w };
}
/** Waits for expr to be true in the page, answering the wallet meanwhile. @param {any} b @param {any} w @param {string} expr */
async function until(b, w, expr, ms = 30e3) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
    if (w) await w.pump();
    if (await b.ev(`!!(${expr})`)) return true;
    await sleep(250);
  }
  return false;
}
/** The page's sideways scroll and what sticks out of the window, none at all is the rule. @param {any} b */
const overflow = (b) => b.ev(`(() => {
  const w = innerWidth, out = [];
  if (document.documentElement.scrollWidth > w + 1) out.push("the page scrolls sideways (" + document.documentElement.scrollWidth + " > " + w + ")");
  for (const el of document.querySelectorAll(".shop *, .gsheet *, .owned *")) {
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > w + 1 || r.left < -1) && !el.closest(".owned__row, .gshelf, .sheet__in pre, .gnokey")) out.push((el.className || el.tagName) + " " + Math.round(r.left) + "–" + Math.round(r.right));
    if (out.length > 4) break;
  }
  return out;
})()`);
/** A screenshot, named, and the overflow audit. @param {any} b @param {string} name */
async function shot(b, name) {
  const { data } = await b.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
  const file = `${OUT}/${name}.jpg`;
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  const bad = await overflow(b);
  say(!bad || !bad.length, `layout ${name}`, (bad || []).join("; "));
  say(!b.errors.length, `no page error ${name}`, b.errors.slice(0, 2).join(" | "));
  return file;
}
/** Clicks the first element matching a selector whose text has words. @param {any} b @param {string} sel @param {string} words */
const click = (b, sel, words = "") => b.js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(words)})); if (!el) return false; el.click(); return true; })()`);

// ------------------------------------------------------------------ the flows
const cards = ".gshelf .gcard:not(.gcard--skel)";

// the gallery, every width, as a player with no record (p0): the sale in its players' window
for (const width of WIDTHS) {
  const { b, w } = await open("p0", width);
  await b.send("Page.navigate", { url: `${APP}/g/` });
  const ok = await until(b, w, `document.querySelectorAll(${JSON.stringify(cards)}).length >= 12`, 90e3);
  say(ok, `gallery at ${width}: the cards`);
  await sleep(800);
  // one way to each thing: no look switch, more filters, search (All's) nor album link on sale; the tiers say what is left
  const lean = await b.ev(`!document.querySelector(".gbar .seg--look, .gbar__more, .gfilters, .gbar__find, .galbum-line")`);
  const left = await b.ev(`[...document.querySelectorAll(".gbar .tierbtn__left")].map((e) => e.textContent).join(" ")`);
  say(lean && /^(\d+\/\d+ left ?)+$/.test(left), `gallery at ${width}: a lean bar, the tiers' counts`, left);
  await shot(b, `gallery-${width}`);
  b.kill();
}


/** A gnome's sheet open at its own page (/g/<id>/), as key, at width (off: the wallet not connected). @param {string} key @param {number | string} id @param {number} width */
async function sheet(key, id, width = 1280, off = false) {
  const o = await open(key, width, off);
  await o.b.send("Page.navigate", { url: `${APP}/g/${id}/` });
  say(await until(o.b, o.w, `document.querySelector(".gsheet h2") && !document.querySelector(".gsheet h2").textContent.includes("Reading")`, 90e3), `sheet #${id} as ${key || "nobody"} at ${width}`);
  await sleep(1200);
  return o;
}
const owner = async (/** @type {number} */ id) => JSON.parse(await qg(`Gnome("${id}")`)).owner;
const button = (/** @type {any} */ b, /** @type {string} */ words) => b.ev(`(() => { const el = [...document.querySelectorAll(".gsheet button, .gsheet a.btn")].find((e) => e.textContent.includes(${JSON.stringify(words)})); return el ? { text: el.textContent, off: el.disabled || el.getAttribute("aria-disabled") === "true" } : null; })()`);
const tick = (/** @type {any} */ b) => b.js(`[...document.querySelectorAll(".gsheet .box input")].forEach((i) => { if (!i.checked) i.click(); })`);
/** The order on its first screen: its total first, the two boxes unticked and the button in view (nothing scrolled),
 *  the total and the button one figure, to the hundredth. @param {any} b @param {number} width */
async function firstScreen(b, width) {
  const r = await b.ev(`(() => { const s = document.querySelector(".gsheet"), inView = (e) => { const q = e && e.getBoundingClientRect(); return !!q && q.top >= 0 && q.bottom <= innerHeight; };
    const boxes = [...s.querySelectorAll(".box input")], btn = [...s.querySelectorAll("button")].find((e) => e.textContent.includes("Order with obligation to pay"));
    return { boxes: boxes.length === 2 && boxes.every((i) => !i.checked && inView(i.closest(".box"))), button: inView(btn),
      total: (/([\\d,.]+) GNOT/.exec(s.querySelector(".review__total b")?.textContent || "") || [])[1], said: (/\\(([\\d,.]+) GNOT\\)/.exec(btn?.textContent || "") || [])[1] }; })()`);
  say(r.boxes && r.button, `the order at ${width}: both boxes, unticked, and the button on the first screen`, JSON.stringify(r));
  say(!!r.total && r.total === r.said && /^[\d,]+(\.\d{1,2})?$/.test(r.total), `the order at ${width}: the total and the button one figure, to the hundredth`, `${r.total} / ${r.said}`);
}

// a player with no record, in the players' window: the button says why, off
for (const width of [390, 1280]) {
  const { b } = await sheet("p0", 5, width);
  const btn = await button(b, "Players first");
  say(!!btn && btn.off, "p0 in the players' window: Buy off, the reason said", btn ? btn.text : "no such button");
  say(!!(await button(b, "Play a round")), "p0: a round to play, a tap away");
  await shot(b, `sheet-players-only-${width}`);
  b.kill();
}

// p1 (a record): the order before the wallet, cancelled once, then bought; the chain shows it
{
  const width = 1280, { b, w } = await sheet("p1", 5, width);
  say(!!(await click(b, ".gsheet button", "Buy ")), "p1: Buy opens the order");
  say(await until(b, w, `document.querySelector(".gsheet .review")`), "the order, term by term");
  await sleep(500);
  const off = await button(b, "Order with obligation to pay");
  say(!!off && off.off, "the order button waits for both boxes", off ? off.text : "none");
  say((await b.ev(`document.querySelector(".gsheet__foot")?.textContent || ""`)).includes("Tick both boxes above to order"), "the footer says why: tick both boxes");
  await firstScreen(b, width);
  await click(b, ".gsheet button", "Order with obligation to pay");
  await sleep(600);
  say(await b.ev(`document.activeElement === document.querySelector(".gsheet .box input") && !document.activeElement.checked`), "the order pressed early: the first box focused, never ticked for them");
  say(!(await b.ev(`document.querySelector(".gsheet h2")?.textContent.includes("Sign in")`)), "nothing sent while a box is unticked");
  await shot(b, "review-1280");
  await tick(b);
  w.next("cancel");
  await click(b, ".gsheet button", "Order with obligation to pay");
  say(await until(b, w, `document.querySelector(".gsheet .note")?.textContent.includes("Cancelled in Adena")`), "cancelled in Adena: nothing was sent, said");
  await shot(b, "review-cancelled-1280");
  await click(b, ".gsheet button", "Order with obligation to pay");
  say(await until(b, w, `document.querySelector(".gsheet h2")?.textContent.includes("yours!")`, 60e3), "signed, read back: yours");
  say((await owner(5)) === env.p1, "the chain: p1 holds #5");
  const done = await b.ev(`({ series: document.querySelector(".gsheet__meta")?.textContent || "", shares: document.querySelectorAll(".gsheet .gshare").length, icons: document.querySelectorAll(".gsheet .share__icon").length, first: document.querySelector(".gsheet__foot .btn")?.textContent || "" })`);
  say(/#5 · (the only|one of \d+) \w+ of [\w ]+ · 1 of \d+/.test(done.series) && done.shares === 1 && !done.icons && done.first.startsWith("Play with"), "yours: his place in the series, one share button, Play first", JSON.stringify(done));
  await shot(b, "bought-1280");
  await click(b, ".gsheet button", "Your receipt");
  await until(b, w, `document.querySelector(".receipt")`);
  const r = await b.ev(`document.querySelector(".receipt").textContent`);
  say(/Transaction: \S+/.test(r) && r.includes(env.p1) && r.includes("lose my right of withdrawal"), "the receipt: the transaction, the buyer, the consents");
  await shot(b, "receipt-1280");
  b.kill();
}
// the window's cap: three Commons this window
{
  const { b } = await sheet("p1", 6, 390);
  const btn = await button(b, "of 3 Commons this window");
  say(!!btn && btn.off, "p1: the window's cap said", btn ? btn.text : "none");
  await shot(b, "sheet-window-cap-390");
  b.kill();
}
// a Legendary at its price, as any gnome (b1 has a record), the wallet not connected yet: its button connects and
// goes straight on to the order
{
  const { b, w } = await sheet("b1", 104, 390, true);
  await shot(b, "sheet-legendary-390");
  say(!!(await click(b, ".gsheet button", "Connect Adena to buy")), "not connected: Connect Adena to buy");
  say(await until(b, w, `document.querySelector(".gsheet .review")`), "connected: straight on to the order");
  await sleep(500);
  await firstScreen(b, 390);
  await shot(b, "review-390");
  await tick(b);
  await click(b, ".gsheet button", "Order with obligation to pay");
  say(await until(b, w, `document.querySelector(".gsheet h2")?.textContent.includes("yours!")`, 60e3), "b1 buys the Legendary at its price");
  say((await owner(104)) === env.b1, "the chain: b1 holds #104");
  await shot(b, "bought-legendary-390");
  b.kill();
}
// Adena fails without saying nothing went: "don't buy again"
{
  const { b, w } = await sheet("p1", 74, 1280);
  await click(b, ".gsheet button", "Buy ");
  await until(b, w, `document.querySelector(".gsheet .review")`);
  await sleep(500);
  await tick(b);
  w.next("maybe");
  await click(b, ".gsheet button", "Order with obligation to pay");
  say(await until(b, w, `document.querySelector(".gsheet .note")?.textContent.includes("Don't buy again")`), "unsure: don't buy again, said");
  await shot(b, "unsure-1280");
  b.kill();
}
// my gnomes, and theirs
for (const width of [390, 1280]) {
  const { b, w } = await open("p1", width);
  await b.send("Page.navigate", { url: `${APP}/g/?who=${env.p1}` });
  say(await until(b, w, `document.querySelectorAll(${JSON.stringify(cards)}).length >= 4`, 90e3), `my gnomes at ${width}`);
  await sleep(1000);
  const line = await b.ev(`[...document.querySelectorAll(".shop .sale__note")].map((e) => e.textContent).join(" ")`);
  say(/Everyone sees|You play/.test(line || ""), "who sees what, one line", line);
  await until(b, w, `document.querySelector(".galbum__line")`, 20e3);
  const team = await b.ev(`(() => { const shelf = document.querySelector(".gshelf"), album = document.querySelector(".galbum"); return { first: !!shelf && !!album && !!(shelf.compareDocumentPosition(album) & 4), folded: !!album && !album.open, line: document.querySelector(".galbum__line")?.textContent || "", mine: document.querySelector(".gbar__views button.on")?.textContent || "" }; })()`);
  say(team.first && team.folded && /Your album \S.* \d+\/\d+ · \w+/.test(team.line) && /^Mine · \d+$/.test(team.mine), "my gnomes: the team first, the album one line under it, its count Mine's badge", JSON.stringify(team));
  await shot(b, `mine-${width}`);
  b.kill();
}
{
  const { b, w } = await open("p0", 390);
  await b.send("Page.navigate", { url: `${APP}/g/?who=${env.p1}` });
  say(await until(b, w, `document.querySelector(".shop h2")?.textContent.includes("gnomes") && document.querySelectorAll(${JSON.stringify(cards)}).length >= 4`, 90e3), "their gnomes, read-only");
  say(!!(await b.ev(`[...document.querySelectorAll(".shop button")].some((e) => e.textContent.includes("Race their ghost"))`)), "their gnomes: Race their ghost");
  await sleep(800);
  await shot(b, "theirs-390");
  b.kill();
}
// the picker: the game's, unchanged, and one row of p1's gnomes; a tap plays one, free; Show to everyone
for (const width of [390, 1280]) {
  const { b, w } = await open("p1", width);
  await b.send("Page.navigate", { url: `${APP}/?hole=garden/3&screen=pick` });
  say(await until(b, w, `document.querySelectorAll(".owned__face").length >= 4`, 120e3), `the picker's row at ${width}`);
  await sleep(1500);
  await shot(b, `picker-${width}`);
  if (width === 1280) {
    await b.js(`[...document.querySelectorAll(".owned__face")].find((e) => e.getAttribute("aria-label").includes(${JSON.stringify(JSON.parse(await qg('Gnome("73")')).name)}))?.click()`);
    await sleep(800);
    say(!!(await b.ev(`document.querySelector(".owned__line")?.textContent.includes("You play")`)), "a tap plays him, free: You play … · everyone sees …");
    await shot(b, "picker-picked-1280");
    await click(b, ".owned__line button", "Show to everyone");
    for (let i = 0; i < 60 && JSON.parse((await qg(`Worn(address("${env.p1}"))`)) || "{}").id !== "73"; i++) (await w.pump(), await sleep(500));
    say(JSON.parse((await qg(`Worn(address("${env.p1}"))`)) || "{}").id === "73", "Show to everyone: Equip signed, Worn(p1) is #73");
    await until(b, w, `document.querySelector(".owned__line")?.textContent.startsWith("Everyone sees")`, 20e3);
    say(!!(await b.ev(`document.querySelector(".owned .share")?.textContent.includes("Your rivals will see")`)), "shown to everyone: the game's share row, \"Your rivals will see …\"");
    await shot(b, "picker-shown-1280");
  }
  b.kill();
}
// the title: the live scene's watcher by the cup wears the player's gnome (p1 wears #73 for everyone by now)
{
  const { b, w } = await open("p1", 1280);
  // headless Chrome asks for less motion, and the title then shows its still (as render.mjs notes)
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.send("Page.navigate", { url: `${APP}/?camlog` });
  const live = await until(b, w, "window.__title", 60e3);
  if (!live) console.log("SKIP the title: no live scene in this Chrome (a weak GPU gets the still)");
  else {
    const ok = await until(b, w, `window.__title.info().gnome === "t73"`, 60e3);
    say(ok, "the title's watcher wears the player's gnome", String(await b.ev("window.__title.info().gnome")));
    await sleep(1500);
    await shot(b, "title-1280");
  }
  b.kill();
}

// an earned gnome's page, a gnome a player with no record waits for
{
  const { b } = await sheet("", "wizard", 390);
  say(!!(await button(b, "Play the Garden Cup")) && (await b.ev(`!!document.querySelector(".gsheet .gtile--earned")`)), "an earned gnome: his tile, Play the Garden Cup");
  await shot(b, "sheet-earned-390");
  b.kill();
  const o = await sheet("p0", 150, 1280);
  const btn = await button(o.b, "Players first until");
  say(!!btn && btn.off, "no record, the window on: Players first until <date>, off", btn ? btn.text : "none");
  await shot(o.b, "sheet-players-1280");
  o.b.kill();
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
