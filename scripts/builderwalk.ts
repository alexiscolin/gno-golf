#!/usr/bin/env -S node --experimental-strip-types
// The Builder's starter path, timed (the GUI spec's B6): a new player in a
// headless Chrome against a dev server with the Builder on, from /build to a
// proved hole on the Publish form. It opens /build (the first run: the
// Garden's dogleg and its hints), presses Got it, drags a Bumper onto the
// starter, presses Test it, gives the address the hole is proved under, holes
// each weather (each round found as scripts/starters.ts finds one, through
// the page's own test chain, builder.wasm; each shot fired as an aim would
// fire it, through the game's ?camlog hook, and counted as one drag), and
// presses Publish. It reports the wall time and the clicks, drags and fields
// typed in, and fails over 5 minutes or over B6's budget. Without a local
// chain the Publish form says the chain is unread: it still counts as
// reached (B6).
//
//   APP=http://localhost:3471 node --experimental-strip-types scripts/builderwalk.ts
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
/** B6's budget for the starter path: Got it, Test it, Publish, and the address the hole is proved under. */
const BUDGET = { clicks: 4, typed: 1 };
const AUTHOR = env ? env[KEY] : "g1" + "q".repeat(38);

const t0 = Date.now();
const said = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s  ${s}`);
const count = { clicks: 0, drags: 0, typed: 0, shots: 0 };
const c = await launch({ width: 1280, height: 800 });
await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
const wallet = stand && env ? await stand.fakeAdena(c, env, KEY) : null;
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
const mouse = (type: string, x: number, y: number) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });

try {
  // open /build: the first run
  await c.send("Page.navigate", { url: `${APP}/build/?camlog` });
  await until(`!!document.querySelector(".bhint__ok")`, "the first run's hints");
  said(`opened on ${await c.js<string>(`document.querySelector(".bhead__hole input").value`)}`);
  await click(`document.querySelector(".bhint__ok")`, "Got it");

  // a Bumper dragged onto the starter, beside the tee (the pieces' count says where it held)
  const n0 = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
  const tile = await c.js<[number, number]>(`(() => { const b = ${button(/^.*Bumper$/)}; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  for (const [dx, dy] of [[6, -2.5], [6, 2.5], [9, -2], [12, 2.5]]) {
    const to = await c.js<[number, number]>(`(() => { const svg = document.querySelector(".board__map"), t = document.querySelector("[data-end='tee'] circle"); const p = svg.createSVGPoint(); p.x = +t.getAttribute("cx") + ${dx}; p.y = +t.getAttribute("cy") + ${dy}; const s = p.matrixTransform(svg.getScreenCTM()); return [s.x, s.y]; })()`);
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

  // Test it, under the author's address
  await until(`!document.querySelector(".bhead__end .btn[aria-disabled]")`, "Test it on");
  await click(button(/^Test it$/), "Test it");
  await until(`!!document.querySelector(".tmode__addr input")`, "the address step");
  await c.js(`(() => { const el = document.querySelector(".tmode__addr input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(AUTHOR)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  count.typed++;
  await click(button(/Test with this address/), "Test with this address");

  // each weather holed: a round found through the page's test chain, then played shot by shot
  for (let w = 0; w < 6; w++) {
    await until(`!!document.querySelector(".tmode__done") || (!!window.__g && !!document.querySelector(".tmode__chip--now"))`, "a weather to play", 90_000);
    if (await c.ev<boolean>(`!!document.querySelector(".tmode__done")`)) break;
    const kind = await c.js<string>(`document.querySelector(".tmode__chip--now").textContent`);
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
      await until(`document.querySelector(".tmode__card")?.textContent === "Stroke ${k}"`, `stroke ${k} ready`, 30_000);
      await c.js(`window.__g.shoot(${a}, ${pw})`);
      count.drags++;
      count.shots++;
    }
    await until(`![...document.querySelectorAll(".tmode__chip--now")].some((x) => x.textContent === ${JSON.stringify(kind)})`, `${kind} proved`, 60_000);
    said(`${kind}: holed and proved`);
  }
  await until(`!!document.querySelector(".tmode__done")`, "every weather proved", 60_000);

  // Publish: the form, the name suggested
  await click(button(/^Publish →$/), "Publish →");
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
  // past the path (not counted): a short wide window keeps the hole's card in sight; the Test step goes back to the test
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 650, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const short = await c.js<{ b: number; h: number }>(`(() => { const r = document.querySelector(".pub__card").getBoundingClientRect(); return { b: r.bottom, h: innerHeight }; })()`);
  if (short.b > short.h) throw new Error(`1366x650: the hole's card is cut off the Publish form (${short.b} > ${short.h})`);
  await c.js(`[...document.querySelectorAll(".step button")].find((b) => /Test/.test(b.textContent)).click()`);
  await until(`!!document.querySelector(".tmode")`, "the Test step from Publish: test mode", 10_000);
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
  console.error("state", JSON.stringify(await c.ev(`({ pub: document.querySelector(".pub")?.textContent.replace(/\\s+/g, " ").slice(-400), chips: [...document.querySelectorAll(".tmode__chip")].map((x) => x.className + " " + x.textContent), card: document.querySelector(".tmode__card")?.textContent, notes: [...document.querySelectorAll(".tmode__notes p")].map((x) => x.textContent), step: document.querySelector("[aria-current=step]")?.textContent })`)));
  c.kill();
  process.exit(1);
}
