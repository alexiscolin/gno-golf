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
  const { scrub } = await import("../lib/analytics.ts"); // (the shared module: it reads no key)
  assert.equal(scrub(`https://gnogolf.xyz/?cup=garden&hole=3&gnome=gnorman&by=${ADDR}`), "https://gnogolf.xyz/?cup=garden&hole=3&gnome=gnorman");
  assert.equal(scrub(`https://gnogolf.xyz/h/garden-3/?friend=${ADDR}`), "https://gnogolf.xyz/h/garden-3/");
  assert.equal(scrub("https://x.com/intent/post?text=Beat%20nym-alice%27s%203&url=x"), "https://x.com/intent/post");
  assert.equal(scrub(`the chain has no round of ${ADDR} here`), "the chain has no round of g1… here");
  assert.equal(scrub(`panic: address("${ADDR}") is not\nregistered`), "panic: address(…)");
  assert.equal(scrub('golf: the name "nym-alice123" is taken'), 'golf: the name "nym-…" is taken');
  assert.equal(scrub("/h/garden-3/"), "/h/garden-3/");
  assert.equal(scrub(`https://gnogolf.xyz/h/garden-3/?by=${ADDR}&src=duel`), "https://gnogolf.xyz/h/garden-3/?src=duel", "where a link was shared from stays");
});

test("scrub: a key's hex or a recovery phrase never leaves, should one ever reach an error", async () => {
  const { scrub } = await import("../lib/analytics.ts"); // (the shared module: it reads no key)
  const hex = "a".repeat(32) + "0123456789abcdef".repeat(2);
  assert.equal(scrub(`bad key ${hex}`), "bad key hex…");
  assert.equal(scrub(`key 0x${hex}`), "key hex…");
  const phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
  assert.equal(scrub(`restore: ${phrase}: 12 words`), "restore: words…: 12 words");
  // what the game sends stays: a sentence of the realm, a tx hash's 64 hex aside
  assert.equal(scrub("golf: the weather of that round is over, play the hole again"), "golf: the weather of that round is over, play the hole again");
});

test("clean: every string of an event, nested ones and the person's first ones", async () => {
  const { clean } = await import("../lib/analytics.ts"); // (the shared module: it reads no key)
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
  const { failure } = await import("../lib/analytics.ts"); // (the shared module: it reads no key)
  assert.equal(failure(Object.assign(new Error("x"), { kind: "down" })), "down");
  assert.equal(failure(new Error("out of gas in location: ...")), "gas");
  assert.equal(failure(new Error("insufficient funds")), "funds");
  assert.equal(failure(new Error("Cancelled in Adena — nothing was sent.")), "cancelled");
  assert.equal(failure(new Error("Adena is not installed in this browser.")), "no_adena");
  assert.equal(failure("something else"), "other");
});

test("cardHoles: a card's size in four bands", async () => {
  const { cardHoles } = await import("../lib/analytics.ts");
  assert.deepEqual([0, 1, 3, 4, 9, 10, 40].map(cardHoles), ["0", "1-3", "1-3", "4-9", "4-9", "10+", "10+"]);
});

test("saveBlock: the first step a save is missing, a shortfall with Adena elsewhere its network's", async () => {
  const { saveBlock } = await import("../lib/analytics.ts");
  const at = (o: Partial<Parameters<typeof saveBlock>[0]>) => saveBlock({ adena: true, account: true, lack: 0, elsewhere: false, ...o });
  assert.equal(at({ adena: false, account: false }), "no_adena");
  assert.equal(at({ account: false, lack: 3 }), "no_account");
  assert.equal(at({ lack: 0.5 }), "no_funds");
  assert.equal(at({ lack: 0.5, elsewhere: true }), "wrong_node");
  assert.equal(at({ lack: null, elsewhere: true }), null); // (a balance not read is no step missing)
  assert.equal(at({}), null);
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
    // this browser's cookies: PostHog's (its id, its opt-out) and another's
    const jar = new Map([["ph_phc_test_posthog", "{id}"], ["__ph_opt_in_out_phc_test", "0"], ["theme", "dark"]]);
    Object.assign(globalThis, {
      document: {
        get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
        set cookie(c: string) { const [kv] = c.split(";"), [k, v] = kv.split("="); if (/max-age=0/i.test(c)) jar.delete(k.trim()); else jar.set(k.trim(), v); },
      },
    });
    const a = await load(), f = fake();
    await a.start(f.loader);
    a.track("badge_earned", { id: "ace" });
    assert.equal(a.optedOut(), false);
    assert.equal(f.got.init!.options.opt_out_persistence_by_default, true);
    a.optOut();
    assert.equal(f.got.optedOut, true);
    assert.deepEqual(f.got.resets, [true]); // its id forgotten, its device id too
    assert.deepEqual([...jar.keys()], ["theme"]); // its cookies gone, no one else's
    a.track("badge_earned", { id: "eagle" });
    assert.equal(f.got.events.length, 1);
    // a later page: kept in this browser
    const b = await load(), g = fake();
    assert.equal(b.optedOut(), true);
    b.track("share", { target: "x", what: "hole" });
    assert.equal(b.start(g.loader), undefined);
    assert.equal(g.asked(), 0);
  } finally {
    delete (globalThis as { document?: unknown }).document;
    localStorage.removeItem("gnogolf.noStats");
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  }
});

test("the feedback's own words keep their sentences: addresses and names go, the nets for keys stay off", async () => {
  const { clean } = await import("../lib/analytics.ts"); // (the shared module: scrubbing reads no key)
  const words = "the camera turns too fast when I aim near the wall and then the ball goes the wrong way every time";
  const e = clean({ event: "survey sent", properties: { $survey_response_2: `${words} g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 nym-alexis000`, other: words } } as never) as { properties: Record<string, string> };
  assert.equal(e.properties.$survey_response_2, `${words} g1… nym-…`);
  assert.equal(e.properties.other, "the camera turns too fast when I words…", "elsewhere the net stays");
  const phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
  const f = clean({ event: "survey sent", properties: { $survey_response_2: `  ${phrase} `, $survey_response_1: ["hex " + "ab".repeat(32)] } } as never) as { properties: Record<string, unknown> };
  assert.equal(f.properties.$survey_response_2, "words…", "a recovery phrase pasted alone still never leaves");
  assert.deepEqual(f.properties.$survey_response_1, ["hex hex…"], "nor a key's hex, anywhere in the words");
});

test("feedback: straight to PostHog's capture on a one-off id, scrubbed, true only when it went; blocked, false; objected to, nothing", async () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  process.env.NEXT_PUBLIC_POSTHOG_SURVEY = "survey-1";
  const fetch0 = globalThis.fetch, sent: { url: string; body: Record<string, unknown> }[] = [];
  try {
    const a = await load();
    const answers = { rating: 4, hard: ["The camera"], more: `my address ${ADDR} and the camera spins`, familiar: "A little" };
    const survey = { surveys: [{ id: "survey-1", questions: ["q1", "q2", "q3", "q4"].map((id) => ({ id, question: `about ${id}`, type: "open" })) }] };
    globalThis.fetch = ((url: string, init?: { body: string }) =>
      url.includes("/api/surveys/?token=phc_test") ? Promise.resolve(new Response(JSON.stringify(survey)))
        : (sent.push({ url, body: JSON.parse(init!.body) as Record<string, unknown> }), Promise.resolve(new Response("{}")))) as unknown as typeof fetch;
    assert.equal(a.canFeedback(), true);
    assert.equal(await a.feedback(answers, { hole: "garden/1" }), true);
    const [{ url, body }] = sent, p = body.properties as Record<string, unknown>;
    assert.equal(url, "https://eu.i.posthog.com/i/v0/e/");
    assert.deepEqual([body.api_key, body.event, p.$survey_id, p.$survey_response, p.$survey_response_1, p.$survey_response_3, p.hole], ["phc_test", "survey sent", "survey-1", 4, ["The camera"], "A little", "garden/1"]);
    assert.equal(p.$survey_response_2, "my address g1… and the camera spins", "the words kept, the address gone");
    assert.match(String(p.distinct_id), /^[0-9a-f-]{36}$/, "a one-off id, not the visit's");
    assert.deepEqual([p.build, typeof p.viewport, typeof p.touch], ["dev", "string", "boolean"], "the build and the device, coarsely (the super properties don't go with it)");
    assert.deepEqual([p.$survey_response_q1, p.$survey_response_q2, p.$survey_response_q4, p.$survey_completed], [4, ["The camera"], "A little", true], "each answer by its question's id, as the responses tab reads it");
    assert.deepEqual((p.$survey_questions as { id: string; response: unknown }[]).map((q) => [q.id, q.response]), [["q1", 4], ["q2", ["The camera"]], ["q3", "my address g1… and the camera spins"], ["q4", "A little"]]);
    globalThis.fetch = () => Promise.reject(new TypeError("blocked"));
    assert.equal(await a.feedback(answers, {}), false, "blocked: not said sent");
    globalThis.fetch = () => Promise.resolve(new Response("", { status: 401 }));
    assert.equal(await a.feedback(answers, {}), false, "refused: not said sent");
    a.optOut();
    assert.equal(a.canFeedback(), false);
    assert.equal(await a.feedback(answers, {}), false, "objected to: nothing goes");
  } finally {
    globalThis.fetch = fetch0;
    localStorage.removeItem("gnogolf.noStats");
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_SURVEY;
  }
});

test("a production build: PostHog through the site's own /e (netlify.toml), the feedback too", async () => {
  const env0 = process.env.NODE_ENV, fetch0 = globalThis.fetch, sent: string[] = [];
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  globalThis.fetch = ((url: string) => (sent.push(url), Promise.resolve(new Response("{}")))) as unknown as typeof fetch;
  try {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const a = await load();
    assert.equal(a.OPTIONS.api_host, "/e");
    assert.equal(await a.feedback({ rating: 3, hard: [], more: "", familiar: "" }, {}), true);
    assert.deepEqual(sent, ["/e/i/v0/e/"]);
  } finally {
    if (env0 === undefined) delete process.env.NODE_ENV; else (process.env as Record<string, string>).NODE_ENV = env0;
    globalThis.fetch = fetch0;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  }
});

test("the module every other one imports (no key in the tests): feedback offered in a dev build and logged, nothing sent", async () => {
  const a = await import("../lib/analytics.ts"), env0 = process.env.NODE_ENV, info0 = console.info;
  let logged = 0;
  console.info = () => void logged++;
  try {
    (process.env as Record<string, string>).NODE_ENV = "development";
    assert.equal(a.feedbackLocal(), true);
    assert.equal(a.canFeedback(), true);
    assert.equal(await a.feedback({ rating: 3, hard: ["Nothing"], more: "", familiar: "New to it" }, { screen: "play" }), true);
    assert.equal(logged, 1);
    (process.env as Record<string, string>).NODE_ENV = "production";
    assert.equal(await a.feedback({ rating: 3, hard: [], more: "", familiar: "" }, {}), false, "no key, a production build: nothing, not even logged");
    assert.equal(logged, 1);
  } finally {
    if (env0 === undefined) delete process.env.NODE_ENV; else (process.env as Record<string, string>).NODE_ENV = env0;
    console.info = info0;
  }
});

// (last in this file: it objects for the module every other one imports, as a visitor would in About)
test("the shared module with no key: every call a no-op, once() once a session, a failure named, and the objection kept", async () => {
  const a = await import("../lib/analytics.ts");
  a.track("wallet", { adena: false, connected: false });
  a.register({ gnome: "classic" });
  a.trackError("test", new Error("x"));
  assert.equal(a.once("shared-test"), true);
  assert.equal(a.once("shared-test"), false);
  assert.equal(a.failure(Object.assign(new Error("node down"), { kind: "down" })), "down");
  assert.equal(a.failure(new Error("out of gas")), "gas");
  assert.equal(a.optedOut(), false);
  a.optOut();
  assert.equal(a.optedOut(), true);
  assert.equal(a.canFeedback(), false, "objected to: the GitHub issue alone");
  localStorage.removeItem("gnogolf.noStats");
});
