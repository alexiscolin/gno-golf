// Analytics: nothing loads nor goes without the key; with it, PostHog is
// loaded with what is on and off, what was said meanwhile follows, and no
// event leaves with an address or a share's text in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import type * as Analytics from "../lib/analytics.ts";
import type { PostHog } from "posthog-js";

// analytics.ts reads the key at import time: a fresh instance per variant
let n = 0;
const load = () => import(`../lib/analytics.ts?v=${n++}`) as Promise<typeof Analytics>;
const ADDR = "g1" + "q".repeat(38);
type Captured = { event: string; props: unknown };
// a stand-in for posthog-js: what init was given, and what was captured and registered
// (since: the day its id was first seen, as its cookie keeps it)
function fake(since?: number) {
  const got = { init: null as null | { key: string; options: Record<string, unknown> }, events: [] as Captured[], registered: {} as Record<string, unknown>, errors: [] as unknown[], resets: [] as unknown[], optedOut: false };
  const p = {
    init: (key: string, options: Record<string, unknown>) => {
      got.init = { key, options };
      (options.loaded as ((p: unknown) => void) | undefined)?.(p);
    },
    capture: (event: string, props: unknown) => void (!got.optedOut && got.events.push({ event, props })),
    register: (props: Record<string, unknown>) => void Object.assign(got.registered, props),
    register_once: (props: Record<string, unknown>) => void Object.assign(got.registered, props),
    get_property: (k: string) => (k === "since_day" ? since : undefined),
    reset: (device?: boolean) => void got.resets.push(device),
    opt_out_capturing: () => void (got.optedOut = true),
    captureException: (e: unknown) => void got.errors.push(e),
  };
  let asked = 0;
  return { got, asked: () => asked, loader: () => (asked++, Promise.resolve({ default: p as unknown as PostHog })) };
}

test("no key: nothing is imported, nothing queued, track is a no-op", async () => {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const a = await load(), f = fake();
  assert.equal(a.start(f.loader), undefined);
  a.track("wallet", { adena: true, connected: false });
  a.register({ gnome: "gnorman" });
  a.trackError("rpc", new Error("down"));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.asked(), 0);
  assert.equal(f.got.init, null);
});

test("scrub: a URL keeps where in the game, never by=, friend= nor a share's text", async () => {
  const { scrub } = await load();
  assert.equal(scrub(`https://gnogolf.xyz/?cup=garden&hole=3&gnome=gnorman&by=${ADDR}`), "https://gnogolf.xyz/?cup=garden&hole=3&gnome=gnorman");
  assert.equal(scrub(`https://gnogolf.xyz/h/garden-3/?friend=${ADDR}`), "https://gnogolf.xyz/h/garden-3/");
  assert.equal(scrub("https://x.com/intent/post?text=Beat%20nym-alice%27s%203&url=x"), "https://x.com/intent/post");
  assert.equal(scrub(`the chain has no round of ${ADDR} here`), "the chain has no round of g1… here");
  assert.equal(scrub(`panic: address("${ADDR}") is not\nregistered`), "panic: address(…)");
  assert.equal(scrub('golf: the name "nym-alice123" is taken'), 'golf: the name "nym-…" is taken');
  assert.equal(scrub("/h/garden-3/"), "/h/garden-3/");
});

test("clean: every string of an event, nested ones and the person's first ones", async () => {
  const { clean } = await load();
  const e = clean({
    uuid: "u", event: "$pageview",
    properties: { $current_url: `http://localhost:3311/?by=${ADDR}`, $pathname: "/", $referrer: `https://t.co/x?by=${ADDR}`, $exception_list: [{ value: `refused for ${ADDR}` }], n: 3 },
    $set_once: { $initial_current_url: `https://gnogolf.xyz/?cup=town&by=${ADDR}` },
  });
  const out = JSON.stringify(e);
  assert.ok(!out.includes(ADDR) && !out.includes("by="), out);
  assert.equal(e!.properties.$current_url, "http://localhost:3311/");
  assert.equal(e!.properties.n, 3);
  assert.equal((e!.$set_once as Record<string, unknown>).$initial_current_url, "https://gnogolf.xyz/?cup=town");
  assert.equal(clean(null), null);
});

test("failure: a word per kind of failure", async () => {
  const { failure } = await load();
  assert.equal(failure(Object.assign(new Error("x"), { kind: "down" })), "down");
  assert.equal(failure(new Error("out of gas in location: ...")), "gas");
  assert.equal(failure(new Error("insufficient funds")), "funds");
  assert.equal(failure("something else"), "other");
});

test("with a key: loaded with replay and heatmaps off, the text masked, then what waited", async () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  Object.assign(globalThis, { devicePixelRatio: 2, innerWidth: 390 });
  try {
    const a = await load(), f = fake();
    a.track("share", { target: "x", what: "hole" });
    await a.start(f.loader);
    assert.equal(f.asked(), 1);
    assert.equal(f.got.init!.key, "phc_test");
    const o = f.got.init!.options;
    assert.equal(o.api_host, "https://eu.i.posthog.com");
    assert.equal(o.disable_session_recording, true);
    assert.equal(o.enable_heatmaps, false);
    assert.equal(o.mask_all_text, true);
    assert.equal(o.mask_all_element_attributes, true);
    assert.equal(o.person_profiles, "identified_only");
    assert.ok((o.cookie_expiration as number) <= 390);
    assert.equal(o.before_send, a.clean);
    assert.deepEqual(f.got.events, [{ event: "share", props: { target: "x", what: "hole" } }]);
    assert.equal(f.got.registered.viewport, "phone");
    // once loaded, straight through; the same failure said 3 times at most
    a.track("badge_earned", { id: "ace" });
    for (let i = 0; i < 5; i++) a.trackError("rpc", new Error("down"));
    assert.equal(f.got.events.length, 2);
    assert.equal(f.got.errors.length, 3);
    assert.equal(a.start(f.loader), undefined); // (once a page)
  } finally {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  }
});

test("an id past 13 months starts again, its device id too; a younger one stays", async () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: 1280 });
  try {
    const today = Math.floor(Date.now() / 864e5);
    const old = fake(today - 391);
    await (await load()).start(old.loader);
    assert.deepEqual(old.got.resets, [true]);
    const young = fake(today - 30);
    await (await load()).start(young.loader);
    assert.deepEqual(young.got.resets, []);
  } finally {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  }
});

test("a visitor who objects: nothing more goes, and on a later page nothing loads", async () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: 1280 });
  try {
    const a = await load(), f = fake();
    await a.start(f.loader);
    a.track("badge_earned", { id: "ace" });
    assert.equal(a.optedOut(), false);
    a.optOut();
    assert.equal(f.got.optedOut, true);
    a.track("badge_earned", { id: "eagle" });
    assert.equal(f.got.events.length, 1);
    // a later page: kept in this browser
    const b = await load(), g = fake();
    assert.equal(b.optedOut(), true);
    b.track("share", { target: "x", what: "hole" });
    assert.equal(b.start(g.loader), undefined);
    assert.equal(g.asked(), 0);
  } finally {
    localStorage.removeItem("gnogolf.noStats");
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  }
});
