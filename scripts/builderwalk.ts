#!/usr/bin/env -S node --experimental-strip-types
// The Builder's starter path, timed (the GUI spec's B6): a new player in a
// headless Chrome against a dev server with the Builder on, from /build to a
// proved hole on the Publish form. It opens /build (the first run: the
// Garden's dogleg and its hints), presses Got it, drags a Bumper onto the
// starter, presses Hole it, pastes the address the hole is proved under, holes
// each weather (each round found as scripts/starters.ts finds one, through
// the page's own test chain, builder.wasm; each shot fired as an aim would
// fire it, through the game's ?camlog hook, and counted as one drag; each
// next weather starting on its own), and presses Publish on the summary
// card the last one ends on. It reports the wall time and the clicks, drags and fields
// typed in, and fails over 5 minutes or over B6's budget. Without a local
// chain the Publish form says the chain is unread: it still counts as
// reached (B6).
//
//   APP=http://localhost:3471 node --experimental-strip-types scripts/builderwalk.ts
//
// WIDTH and HEIGHT set the window (1280x800); NOSUBTLE=1 takes crypto.subtle
// away, as a page on plain http from another machine is. At the first run it checks
// that the three hints, Got it and the three steps' words are each in the
// window, on top (nothing drawn over them), and readable (4.5:1 on their
// ground at least).
//
// With SEED (a seed.env of scripts/e2e-gnomes.sh SEED=1 or try-local.sh)
// and KEY (one of its keys, p1 by default), the hole is proved under that
// key's address and published for real once the walk is timed: Publish in
// Adena, the stand-in Adena signing with the key (media/gnomes/wallet.mjs),
// until the page and the chain say it is there.

interface Browser {
  send: (method: string, params?: object) => Promise<unknown>;
  ev: <T = unknown>(expr: string) => Promise<T>;
  js: <T = unknown>(expr: string) => Promise<T>;
  errors: unknown[];
  kill: () => void;
}
const cdp = (await import("../media/lib/cdp.mjs")) as {
  launch: (o: { width: number; height: number }) => Promise<Browser>;
  sleep: (ms: number) => Promise<void>;
  APP: string;
};
const { launch, sleep, APP } = cdp;
interface Wallet { pump: () => Promise<void> }
const SEED = process.env.SEED || "", KEY = process.env.KEY || "p1";
const stand = SEED
  ? ((await import("../media/gnomes/wallet.mjs")) as { seedEnv: (f: string) => Record<string, string>; fakeAdena: (b: Browser, env: Record<string, string>, key: string) => Promise<Wallet> })
  : null;
const env = stand ? stand.seedEnv(SEED) : null;
const LIMIT_MS = 5 * 60_000;
/** B6's budget for the starter path: Got it, Hole it, the address the hole is proved under (pasted: its field shown, then used), Publish. */
const BUDGET = { clicks: 5, typed: 1 };
const AUTHOR = env ? env[KEY] : "g1" + "q".repeat(38);

const t0 = Date.now();
const innerSize = () => `${Number(process.env.WIDTH) || 1280}x${Number(process.env.HEIGHT) || 800}`;
const said = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s  ${s}`);
const count = { clicks: 0, drags: 0, typed: 0, shots: 0 };
const c = await launch({ width: Number(process.env.WIDTH) || 1280, height: Number(process.env.HEIGHT) || 800 });
await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
const wallet = stand && env ? await stand.fakeAdena(c, env, KEY) : null;
// NOSUBTLE=1: the page as a plain-http one elsewhere has it, no crypto.subtle (lib/sha.ts's own digest then)
if (process.env.NOSUBTLE === "1") await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined })" });
const until = async (expr: string, what: string, ms = 60_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await c.ev<boolean>(expr)) return;
  throw new Error(`waited ${ms / 1000} s for ${what}`);
};
const click = async (expr: string, what: string) => {
  await until(`!!(${expr})`, what);
  await c.js(`(${expr}).click()`);
  count.clicks++;
  said(`click: ${what}`);
};
const button = (re: RegExp) => `[...document.querySelectorAll("button")].find((b) => ${re}.test(b.textContent))`;
/** A button on the hole-finished card. */
const onCard = (re: RegExp) => `[...document.querySelectorAll(".tmode__won button")].find((b) => ${re}.test(b.textContent))`;
const mouse = (type: string, x: number, y: number) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });

try {
  // open /build: the first run
  await c.send("Page.navigate", { url: `${APP}/build/?camlog` });
  await until(`!!document.querySelector(".bhint__ok")`, "the first run's hints");
  said(`opened on ${await c.js<string>(`document.querySelector(".bhead__hole input").value`)}`);
  // the first run's guidance, every part of it seen: in the window, on top, readable
  const unseen = await c.js<string[]>(`(() => {
    const lum = (rgb) => { const [r, g, b] = rgb.match(/[\\d.]+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ground = (el) => { for (let e = el; e; e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor; if (!/rgba\\(.*, 0\\)$/.test(bg) && bg !== "transparent") return bg; } return "rgb(255, 255, 255)"; };
    const parts = [...document.querySelectorAll(".bhint, .bhint__ok"), ...[...document.querySelectorAll(".stepper .step button")].map((b) => b.querySelector("span") || b)];
    const bad = [];
    if (parts.length < 7) bad.push("only " + parts.length + " parts (3 hints, Got it, 3 steps)");
    for (const el of parts) {
      const r = el.getBoundingClientRect(), name = (el.textContent || "").trim().slice(0, 30), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.display === "none" || cs.visibility !== "visible" || +cs.opacity < 0.9) { bad.push(name + ": not shown"); continue; }
      if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) { bad.push(name + ": out of the window"); continue; }
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || !(top === el || el.contains(top) || top.contains(el) || el.closest("button") === top.closest("button"))) bad.push(name + ": under " + (top ? String(top.className || top.tagName) : "nothing"));
      const [a, b] = [lum(cs.color), lum(ground(el))], ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) bad.push(name + ": contrast " + ratio.toFixed(1));
    }
    return bad;
  })()`);
  if (unseen.length) throw new Error(`the first run's guidance is not all seen at ${innerSize()}: ${unseen.join("; ")}`);
  said(`the hints, Got it and the steps' words all seen at ${innerSize()}`);
  await click(`document.querySelector(".bhint__ok")`, "Got it");

  // a Bumper dragged onto the starter, beside the tee (the pieces' count says where it held)
  const n0 = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
  // (the Bumper's tile: its picture, its name, what it does)
  const tile = await c.js<[number, number]>(`(() => { const b = [...document.querySelectorAll(".palette [data-tile]")].find((t) => t.querySelector(".piece__name")?.textContent === "Bumper"); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  for (const [dx, dy] of [[6, -2.5], [6, 2.5], [9, -2], [12, 2.5]]) {
    const to = await c.js<[number, number]>(`(() => { const m = document.querySelector(".board__plane").getScreenCTM(), r = document.querySelector("[data-end='tee'] circle").getBoundingClientRect(); const t = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(m.inverse()), s = new DOMPoint(t.x + ${dx}, t.y + ${dy}).matrixTransform(m); return [s.x, s.y]; })()`);
    await mouse("mousePressed", ...tile);
    for (let k = 1; k <= 8; k++) {
      await mouse("mouseMoved", tile[0] + ((to[0] - tile[0]) * k) / 8, tile[1] + ((to[1] - tile[1]) * k) / 8);
      await sleep(40);
    }
    await mouse("mouseReleased", ...to);
    count.drags++;
    await sleep(1200);
    if ((await c.js<number>(`document.querySelectorAll("[data-piece]").length`)) > n0) break;
    said(`the bumper did not hold there: ${await c.ev<string>(`document.querySelector(".board__said")?.textContent || ""`)}`);
  }
  if ((await c.js<number>(`document.querySelectorAll("[data-piece]").length`)) <= n0) throw new Error("no bumper placed");
  said("drag: a Bumper onto the board");

  // Hole it, under the author's address
  await until(`!document.querySelector(".bhead__end .btn[aria-disabled]")`, "Hole it on");
  await click(button(/^Next: Hole it →$/), "Next: Hole it →");
  // the step opens on its one line, over the weathers to hole, none ticked yet
  await until(`!!document.querySelector(".tmode--ask .tmode__intro")`, "the Hole it step's first page");
  const opens = await c.js<{ line: string; chips: number; done: number }>(`({ line: document.querySelector(".tmode--ask .tmode__intro").textContent, chips: document.querySelectorAll(".tmode--ask .tmode__chip").length, done: document.querySelectorAll(".tmode--ask .tmode__chip--done").length })`);
  if (!opens.line.startsWith("Before your hole goes on chain, you must sink it yourself") || opens.chips < 3 || opens.done) throw new Error(`the Hole it step's first page: ${JSON.stringify(opens)}`);
  await click(button(/^Or paste an address/), "Or paste an address");
  await until(`!!document.querySelector(".tmode__addr input")`, "the address step");
  await c.js(`(() => { const el = document.querySelector(".tmode__addr input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(AUTHOR)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  count.typed++;
  await click(button(/^Use this address$/), "Use this address");

  // each weather holed: a round found through the page's test chain, then played shot by shot
  for (let w = 0; w < 6; w++) {
    await until(`!!window.__g && !!document.querySelector(".tmode__chip--now:not(.tmode__chip--done)") && document.querySelector(".tmode__score strong")?.textContent === "0" && !document.querySelector(".tmode__won")`, "a weather to play", 90_000);
    const kind = await c.js<string>(`document.querySelector(".tmode__chip--now .weather__say").textContent`);
    await sleep(1500);
    const round = await c.js<[number, number][] | null>(`(async () => {
      const g = window.__g, id = g.current(), p = await g.chain.period(), s = await g.chain.state(id);
      const pin = s.cup, shots = [];
      let rest = s.start;
      const of = (a, pw) => a.toFixed(4) + "," + pw.toFixed(4);
      for (let k = 0; k < 6; k++) {
        let best = null;
        const toward = Math.atan2(pin[1] - rest[1], pin[0] - rest[0]) * 180 / Math.PI;
        for (let da = -40; da <= 40; da += 2) for (let pw = 0.5; pw <= 10; pw += 0.25) {
          const a = Math.round((toward + da) * 100) / 100;
          let r;
          try { r = k === 0 ? await g.chain.simulateRound(id, [of(a, pw)], p) : await g.chain.simulateFrom(id, rest, of(a, pw), k, p); } catch { continue; }
          if (r.holed) return [...shots, [a, pw]];
          const d = Math.hypot(r.rest[0] - pin[0], r.rest[1] - pin[1]);
          if (!best || d < best.d) best = { a, pw, rest: r.rest, d };
        }
        if (!best) return null;
        shots.push([best.a, best.pw]);
        rest = best.rest;
      }
      return null;
    })()`);
    if (!round) throw new Error(`no round found in ${kind}`);
    said(`${kind}: a round of ${round.length} found`);
    for (const [k, [a, pw]] of round.entries()) {
      await until(`document.querySelector(".tmode__score strong")?.textContent === "${k}"`, `stroke ${k} ready`, 30_000);
      await c.js(`window.__g.shoot(${a}, ${pw})`);
      count.drags++;
      count.shots++;
    }
    // proved: the next weather on its own, said in the HUD, or the summary
    await until(`[...document.querySelectorAll(".tmode__chip--done .weather__say")].some((x) => x.textContent === ${JSON.stringify(kind)})`, `${kind} proved`, 60_000);
    await until(`!!document.querySelector(".tmode__sum") || (document.querySelector(".tmode__done")?.textContent || "").startsWith(${JSON.stringify(`${kind} holed · next: `)})`, `${kind}: the summary or the next weather said`, 10_000);
    said(`${kind}: holed and proved · ${await c.js<string>(`document.querySelector(".tmode__sum") ? "the summary" : document.querySelector(".tmode__done").textContent`)}`);
    if (await c.ev<boolean>(`!!document.querySelector(".tmode__sum")`)) break;
  }
  await until(`!!${onCard(/^Publish →$/)}`, "every weather proved: Publish on the summary", 60_000);
  said(`the summary: ${await c.js<string>(`[...document.querySelectorAll(".tmode__sum tbody tr")].map((r) => r.textContent).join(" | ")`)}`);

  // Publish: the form, the name suggested
  await click(onCard(/^Publish →$/), "Publish →");
  await until(`!!document.querySelector(".pub")`, "the Publish form");
  await sleep(3000);
  const form = await c.js<{ name: string; note: string }>(`({ name: document.querySelector(".pub input")?.value || "", note: [...document.querySelectorAll(".pub__note, .pub__bad")].map((x) => x.textContent).join(" | ") })`);
  said(`on the Publish form: "${form.name}" · ${form.note || "ready"}${/could not be read/.test(form.note) ? " (chain unread: counts as reached, B6)" : ""}`);
  // the publish layout on a short wide window: the hole's card in sight
  const card = await c.js<{ b: number; h: number }>(`(() => { const r = document.querySelector(".pub__card")?.getBoundingClientRect(); return { b: r ? r.bottom : 1e9, h: innerHeight }; })()`);
  if (card.b > card.h) throw new Error(`the hole's card is cut off the Publish form (${card.b} > ${card.h})`);

  const ms = Date.now() - t0;
  console.log(JSON.stringify({ seconds: Math.round(ms / 1000), ...count }));
  if (ms > LIMIT_MS) throw new Error(`over 5 minutes: ${Math.round(ms / 1000)} s`);
  if (count.clicks > BUDGET.clicks || count.typed > BUDGET.typed) throw new Error(`over budget: ${count.clicks} clicks, ${count.typed} fields typed`);
  // past the path (not counted): a short wide window keeps the hole's card in sight; the Hole it step goes back to the test
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 650, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const short = await c.js<{ b: number; h: number }>(`(() => { const r = document.querySelector(".pub__card").getBoundingClientRect(); return { b: r.bottom, h: innerHeight }; })()`);
  if (short.b > short.h) throw new Error(`1366x650: the hole's card is cut off the Publish form (${short.b} > ${short.h})`);
  await c.js(`[...document.querySelectorAll(".step button")].find((b) => /Hole it/.test(b.textContent)).click()`);
  await until(`!!document.querySelector(".tmode")`, "the Hole it step from Publish: test mode", 10_000);
  if (wallet) {
    // published for real: back to Publish, Publish in Adena, signed by the stand-in, until the page says it landed
    await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await click(button(/^Publish →$/), "Publish → (again)");
    await until(`!!${button(/^Publish in Adena/)}`, "the chain's checks: Publish in Adena", 180_000);
    await click(button(/^Publish in Adena/), "Publish in Adena");
    for (const end = Date.now() + 120_000; Date.now() < end && !(await c.ev<boolean>(`!!document.querySelector(".pub--done")`)); await sleep(500)) await wallet.pump();
    if (!(await c.ev<boolean>(`!!document.querySelector(".pub--done")`))) throw new Error(`not published: ${await c.ev<string>(`document.querySelector(".pub")?.textContent.replace(/\\s+/g, " ").slice(-300) || ""`)}`);
    said(`published, signed by ${KEY}: ${await c.ev<string>(`document.querySelector(".pub--done").textContent.replace(/\\s+/g, " ").slice(0, 160)`)}`);
  }
  console.log("builderwalk: ok");
  c.kill();
  process.exit(0);
} catch (e) {
  console.error(`builderwalk: ${e instanceof Error ? e.message : String(e)}`, JSON.stringify(count), JSON.stringify(c.errors).slice(0, 800));
  console.error("state", JSON.stringify(await c.ev(`({ pub: document.querySelector(".pub")?.textContent.replace(/\\s+/g, " ").slice(-400), chips: [...document.querySelectorAll(".tmode__chip")].map((x) => x.className + " " + x.textContent), score: document.querySelector(".tmode__score")?.textContent, won: document.querySelector(".tmode__won")?.textContent, notes: [...document.querySelectorAll(".tmode__notes p")].map((x) => x.textContent), step: document.querySelector("[aria-current=step]")?.textContent })`)));
  c.kill();
  process.exit(1);
}
