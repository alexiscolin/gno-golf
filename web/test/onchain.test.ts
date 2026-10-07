// lib/gnomes/onchain.ts: a gnome as the chain draws him. The realm's answer
// in each form it gives it (TokenURI's data URI, its page's markdown,
// TokenMetadata's JSON), the SVG checked against what a portrait holds and
// refused for anything else (a script, a handler, a reference out, a
// foreign object), each id read once, four at a time, and null whenever it
// fails: the screen then shows his 3D portrait.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSvg, portraitOf, portraits, portraitsOf, savedLook, saveLook } from "../lib/gnomes/onchain.ts";
import { makeShop } from "../lib/gnomes/shop.ts";

// a portrait as svg.gno draws one, its shapes cut short
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>Juniper O&apos;Troutbridge</title>' +
  "<style>.i{stroke:#144134;stroke-width:2.8;stroke-linejoin:round}.d{opacity:0.12}.l{fill:#fff;opacity:.4}</style>" +
  '<rect width="256" height="256" fill="#fbf0d6"/><ellipse cx="128" cy="213.5" rx="78" ry="37.5" fill="#f0d79a"/>' +
  '<ellipse cx="128" cy="214.5" rx="87" ry="42" fill="none" stroke="#d9962b" stroke-width="5.5"/>' +
  '<path fill="#e0524b" fill-opacity=".9" d="M97 178l4 3 5 0-4 0-4-1z" class="i"/><path d="M97 178l4 3z" class="e" opacity=".5"/></svg>';
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const URI = "data:image/svg+xml;base64," + b64(SVG);
const svgOf = (url: string | null) => (url ? Buffer.from(url.slice(url.indexOf(",") + 1), "base64").toString("utf8") : null);

void test("onchain: each form the realm gives a portrait in is read to the same picture", () => {
  // TokenURI: the data URI itself
  assert.equal(svgOf(portraitOf(URI)), SVG);
  // Render("<id>"), a gnome not minted yet: his page, the picture in its markdown
  assert.equal(svgOf(portraitOf(`# Juniper\n\n![Juniper](${URI})\n\nGnome 5, common, of the genesis series.\n\nUnsold.\n`)), SVG);
  // TokenMetadata: the JSON, the picture its image
  assert.equal(svgOf(portraitOf(JSON.stringify({ name: "Juniper", description: "…", image: URI, attributes: [] }))), SVG);
  // a data URI not in base64, the SVG percent-encoded; the bare base64; the SVG itself
  assert.equal(svgOf(portraitOf("data:image/svg+xml;charset=utf-8," + encodeURIComponent(SVG))), SVG);
  assert.equal(svgOf(portraitOf(b64(SVG))), SVG);
  assert.equal(svgOf(portraitOf(SVG)), SVG);
  // what the page shows is a data URI of the SVG checked, in base64
  assert.match(portraitOf(URI)!, /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/);
});

void test("onchain: an answer with no portrait in it is null", () => {
  for (const a of ["", "   ", "# Not found\n", "data:image/png;base64,iVBORw0KGgo=", "data:image/svg+xml;base64,!!!", "data:image/svg+xml,%E0%A4%A", "{\"image\":42}", "{not json", "aGVsbG8=", '{"image":"{\\"image\\":\\"x\\"}"}'])
    assert.equal(portraitOf(a), null, JSON.stringify(a));
});

void test("onchain: the sanitiser keeps a portrait's shapes, and their local references", () => {
  assert.equal(cleanSvg(SVG), SVG);
  assert.equal(cleanSvg('<?xml version="1.0" encoding="UTF-8"?>\n' + SVG), SVG, "an XML declaration dropped");
  const local = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><defs><linearGradient id="a"><stop offset="0" stop-color="#fff"/></linearGradient><clipPath id="c"><circle cx="4" cy="4" r="4"/></clipPath></defs><g clip-path="url(#c)"><rect width="8" height="8" fill="url(#a)"/></g></svg>';
  assert.equal(cleanSvg(local), local);
});

void test("onchain: the sanitiser refuses scripts, handlers, references out and foreign objects", () => {
  const wrap = (inner: string, open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">') => open + inner + "</svg>";
  const bad: [string, string][] = [
    ["a script", wrap("<script>alert(1)</script>")],
    ["a script, its name in capitals", wrap("<SCRIPT>alert(1)</SCRIPT>")],
    ["a handler on the root", wrap("", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">')],
    ["a handler on a shape", wrap('<path d="M0 0" onclick="alert(1)"/>')],
    ["a handler in other case", wrap('<rect width="8" height="8" OnMouseOver="x()"/>')],
    ["a foreign object", wrap('<foreignObject width="8" height="8"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>')],
    ["an image from elsewhere", wrap('<image href="https://example.com/x.png" width="8" height="8"/>')],
    ["a link", wrap('<a href="javascript:alert(1)"><rect width="8" height="8"/></a>')],
    ["a use of another file", wrap('<use href="https://example.com/x.svg#a"/>')],
    ["an xlink out", wrap('<rect xlink:href="https://example.com/" width="8" height="8"/>', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">')],
    ["a paint from elsewhere", wrap('<rect width="8" height="8" fill="url(https://example.com/p.svg#a)"/>')],
    ["a paint from elsewhere, quoted", wrap("<rect width=\"8\" height=\"8\" fill=\"url( 'https://example.com/p.svg#a')\"/>")],
    ["a style attribute reaching out", wrap('<rect width="8" height="8" style="fill:url(//example.com/a)"/>')],
    ["a style sheet importing", wrap("<style>@import url(https://example.com/a.css);</style>")],
    ["a style sheet fetching", wrap("<style>.a{background:url(https://example.com/a.png)}</style>")],
    ["a style sheet's escapes", wrap("<style>.a{fill:u\\72l(https://example.com/a)}</style>")],
    ["a javascript: value", wrap('<rect width="8" height="8" fill="javascript:alert(1)"/>')],
    ["an animation", wrap('<set attributeName="fill" to="red"/>')],
    ["a doctype with an entity", '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + wrap("<title>&x;</title>")],
    ["an entity not XML's own", wrap("<title>&nbsp;</title>")],
    ["a CDATA section", wrap("<style><![CDATA[.a{}]]></style>")],
    ["a comment", wrap("<!-- x -->")],
    ["a processing instruction", wrap('<?xml-stylesheet href="https://example.com/a.css"?>')],
    ["another namespace", wrap("", '<svg xmlns="http://www.w3.org/1999/xhtml">')],
    ["no namespace", "<svg><rect/></svg>"],
    ["a tag left open", '<svg xmlns="http://www.w3.org/2000/svg"><g><rect/></svg>'],
    ["two roots", wrap("") + wrap("")],
    ["text outside the root", wrap("") + "<script>x</script>"],
    ["not an svg", "<html><body/></html>"],
    ["an attribute with no quotes", wrap("<rect width=8/>")],
    ["an attribute twice", wrap('<rect fill="#fff" fill="#000"/>')],
    ["text in a shape", wrap("<rect>hi</rect>")],
    ["too big", wrap(`<path d="${"M0 0".repeat(40000)}"/>`)],
  ];
  for (const [what, svg] of bad) assert.equal(cleanSvg(svg), null, what);
  // and a portrait holding one never reaches the page, whatever form it came in
  const evil = wrap('<path d="M0 0" onclick="alert(1)"/>');
  assert.equal(portraitOf("data:image/svg+xml;base64," + b64(evil)), null);
  assert.equal(portraitOf(JSON.stringify({ image: "data:image/svg+xml;base64," + b64(evil) })), null);
});

/** A read the test answers by hand: each call waits for its turn; counts what is in flight. */
function slowRead() {
  const waiting: { id: number; ok: (s: string) => void; no: (e: Error) => void }[] = [];
  let inFlight = 0, most = 0, calls = 0;
  const read = (id: number) => {
    calls++;
    inFlight++;
    most = Math.max(most, inFlight);
    return new Promise<string>((ok, no) => waiting.push({ id, ok: (s) => (inFlight--, ok(s)), no: (e) => (inFlight--, no(e)) }));
  };
  return { read, waiting, most: () => most, calls: () => calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

void test("onchain: a gnome's portrait is read once and kept, the next asks answered from it", async () => {
  const r = slowRead(), p = portraits(r.read);
  assert.equal(p.known(7), undefined, "not read yet");
  const a = p.get(7), b = p.get(7);
  await tick();
  assert.equal(r.calls(), 1, "asked twice, read once");
  r.waiting[0].ok(URI);
  assert.equal(svgOf(await a), SVG);
  assert.equal(await b, await a);
  assert.equal(svgOf(p.known(7) ?? null), SVG, "kept: the screen draws it at once");
  assert.equal(svgOf(await p.get(7)), SVG);
  assert.equal(r.calls(), 1);
});

void test("onchain: at most four portraits are read at a time, the rest in turn", async () => {
  const r = slowRead(), p = portraits(r.read);
  const all = Array.from({ length: 10 }, (_, i) => p.get(i + 1));
  await tick();
  assert.equal(r.waiting.length, 4, "four asked");
  while (r.waiting.length) {
    r.waiting.shift()!.ok(URI);
    await tick();
    await tick();
  }
  assert.equal(r.most(), 4, "never more than four at once");
  assert.equal(r.calls(), 10);
  assert.ok((await Promise.all(all)).every((u) => svgOf(u) === SVG));
  const one = slowRead(), q = portraits(one.read, 0);
  void q.get(1), void q.get(2);
  await tick();
  assert.equal(one.waiting.length, 1, "a cap of nothing reads one at a time, not none");
});

void test("onchain: any failure is null (the 3D portrait shows), and a failed read is asked again later", async () => {
  const r = slowRead(), p = portraits(r.read);
  const down = p.get(1), bad = p.get(2), evil = p.get(3);
  await tick();
  r.waiting[0].no(new Error("down"));
  r.waiting[1].ok("# Not found\n");
  r.waiting[2].ok("data:image/svg+xml;base64," + b64('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'));
  assert.deepEqual(await Promise.all([down, bad, evil]), [null, null, null]);
  assert.equal(p.known(2), null, "an answer that is no portrait is kept as none");
  assert.equal(p.known(1), undefined, "a read that failed is not kept");
  const again = p.get(1);
  await tick();
  r.waiting[3].ok(URI);
  assert.equal(svgOf(await again), SVG);
});

void test("onchain: the shop asks the realm for a gnome's TokenURI, his page when he is not minted", async () => {
  const asked: string[] = [];
  const chain = { qjson: () => Promise.reject(new Error("not asked")), qstr: (_: string, expr: string) => (asked.push(expr), Promise.resolve(URI)) };
  const shop = makeShop(chain, "gno.land/r/x/gnogolf/gnomes");
  assert.equal(await shop.portrait(5), URI);
  assert.deepEqual(asked, ['func() string { if u, err := TokenURI("5"); err == nil { return u }; return Render("5") }()']);
  await assert.rejects(shop.portrait(0), /number/);
  // one store a chain: the gallery and the sheet read a gnome once between them
  const store = portraitsOf(chain);
  assert.equal(portraitsOf(chain), store);
  assert.equal(svgOf(await store.get(5)), SVG);
  assert.equal(svgOf(await portraitsOf(chain).get(5)), SVG);
  assert.equal(asked.length, 2, "read once more, for the store");
});

void test("onchain: the look a viewer picked is remembered, 3D when none or the storage is shut", () => {
  localStorage.clear();
  assert.equal(savedLook(), "3d");
  saveLook("chain");
  assert.equal(savedLook(), "chain");
  saveLook("3d");
  assert.equal(savedLook(), "3d");
  localStorage.setItem("gnogolf.gnomes.look", "<img>");
  assert.equal(savedLook(), "3d");
  const get = localStorage.getItem.bind(localStorage), set = localStorage.setItem.bind(localStorage);
  localStorage.getItem = () => { throw new Error("blocked"); };
  localStorage.setItem = () => { throw new Error("blocked"); };
  try {
    assert.equal(savedLook(), "3d");
    assert.doesNotThrow(() => saveLook("chain"));
  } finally {
    localStorage.getItem = get;
    localStorage.setItem = set;
  }
});
