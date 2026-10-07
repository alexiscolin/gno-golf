"use client";

// The publish step (the GUI spec's B4; the hole-builder design's "The
// publish flow"): the hole as players will see it, and the form: its name and
// its note as the chain will keep them (builder.wasm's check, PublishMine's
// own cleaning, its link check live), its address fixed at the test, the
// permanence said before anything else, the bill before any signature, then
// Adena (or the gnokey command behind a tap), and the chain read until it
// names the new version. Before it opens, the chain is read (publishing open,
// the Builder's checks the realm's own, no successor, the alias's versions)
// and the hole judged once more as it will be published: the Builder's rules
// and the census, the proofs replayed in their strokes, the par (publish.ts
// holeHolds, publishSteps).
import { useEffect, useMemo, useRef, useState } from "react";
import { useCopied } from "@/components/common";
import { Button, buttonClass } from "@/components/ui";
import Share from "@/components/Share";
import { connect, hasAdena, publishHole, PRICE } from "@/lib/adena";
import { makeChain, wait } from "@/lib/chain";
import { explain } from "@/lib/builder/explain";
import { endpoints, playLink } from "@/lib/builder/holes";
import { bill, finalHex, gasFor, gnokeyPublish, holeHolds, parLine, publishSteps, type Readings } from "@/lib/builder/publish";
import { census } from "@/lib/builder/drawn";
import { loadPalette } from "@/lib/builder/palette";
import { proofKey, provedAs, shaOf } from "@/lib/builder/proof";
import { holeId, holeRow } from "@/lib/builder/testmode";
import { ISSUES } from "@/lib/site";
import { loadTakedown, takenDown } from "@/lib/takedown";
import { sameSources } from "@/lib/sim/sources";
import type { Draft } from "@/lib/builder/draft";
import type { BuilderHost, Cost } from "@/lib/builder/wasm";
import type { Hole } from "@/lib/scene/data";
import Preview from "./Preview";
import { cardLines, holeShare, saveFile as download, shareCard } from "./share";
import { MAX_NOTE, MAX_TITLE as MAX_NAME } from "@/lib/builder/draft";
import { worldName } from "@/lib/builder/rules";

const gnot = (ugnot: number) => (ugnot / 1e6).toFixed(2);
/** How long the chain is read for the new version after a signature (it lands within a few blocks). */
const LAND_MS = 90_000;

export default function Publish({ host, draft, author, onDraft, onRetest, onDone }: {
  host: BuilderHost;
  draft: Draft;
  author: string;
  /** the name or the note changed: kept in the draft (neither moves a ball) */
  onDraft: (d: Draft) => void;
  /** back to the test (a newer version elsewhere: new weather) */
  onRetest: () => void;
  onDone: (id: string) => void;
}) {
  const { rpc, web } = useMemo(() => endpoints(window.location.search), []);
  const chain = useMemo(() => makeChain({ rpc, web }), [rpc, web]);
  const alias = `${author}/${draft.slug}`;
  const [readings, setReadings] = useState<Readings>({ publishing: undefined, rules: undefined, writer: undefined, taken: undefined, versions: undefined, hole: undefined, name: "" });
  const [prices, setPrices] = useState({ gas: PRICE, byte: 100 });
  const [chainId, setChainId] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [sha, setSha] = useState("");
  const [sent, setSent] = useState<"" | "signing" | "landing" | "done">("");
  const [why, setWhy] = useState("");
  const [copied, copy] = useCopied();
  const live = useRef(true);
  const capture = useRef<(() => HTMLCanvasElement | null) | null>(null);
  useEffect(() => ((live.current = true), () => void (live.current = false)), []); // (true again on a remount: dev's StrictMode mounts twice)

  // the name and note as the chain will keep them, and what the data will be with that name in it
  const first = host.check(draft.slug, finalHex(draft, host, draft.title) ?? "", draft.note);
  const name = first.ok ? first.cost.name : draft.title, note = first.ok ? first.cost.note : draft.note;
  const hex = finalHex(draft, host, name) ?? "";
  const checked = host.check(draft.slug, hex, note);
  const cost: Cost | null = checked.ok ? checked.cost : null;
  const nameWhy = checked.ok ? "" : explain(checked.why);
  const proved = key ? provedAs(draft.proofs, draft.world, key, author, draft.slug) : null;
  const par = proved ? parLine(draft.proofs.filter((p) => p.key === key && p.id === proved), draft.par) : "";

  // the chain's state (read again on "Try again": a read that fails is said, never waited on); the proofs on the final data, and its sha, as it changes
  const [tries, setTries] = useState(0);
  useEffect(() => {
    setReadings((r) => ({ ...r, publishing: undefined, rules: undefined, writer: undefined, taken: undefined, versions: undefined }));
    void Promise.all([
      chain.publishing().catch(() => null),
      Promise.all([chain.successor(), sameSources(chain, host.sources(), "builder")]).then(([s, same]) => same && s === "", () => null),
      chain.writer().catch(() => null),
      loadTakedown(chain).then((t) => takenDown(t, alias), () => null),
      chain.versions(alias).catch(() => null),
    ]).then(([publishing, rules, writer, taken, versions]) => live.current && setReadings((r) => ({ ...r, publishing, rules, writer, taken, versions })));
    void chain.gasPrice().then((gas) => live.current && setPrices((p) => ({ ...p, gas })), () => {});
    void chain.storagePrice().then((byte) => live.current && setPrices((p) => ({ ...p, byte })), () => {});
    void chain.chainId().then((c) => live.current && setChainId(c), () => {});
  }, [chain, alias, host, tries]);
  useEffect(() => void proofKey(draft, host).then((k) => live.current && setKey(k)), [draft, host]);
  useEffect(() => {
    const untested = "The rounds that proved it no longer play out the same on its final data: test it again.";
    if (!hex || !key || !proved) return setReadings((r) => ({ ...r, hole: key && !proved ? untested : undefined }));
    setReadings((r) => ({ ...r, hole: undefined }));
    const judged = loadPalette(draft.world).then((palette) => holeHolds({ ...draft, title: name }, hex, key, proved, { host, palette, census }));
    void Promise.all([judged, shaOf(hex)]).then(([hole, s]) => {
      if (!live.current) return;
      setReadings((r) => ({ ...r, hole }));
      setSha(s);
    }, (e: unknown) => live.current && setReadings((r) => ({ ...r, hole: e instanceof Error ? e.message : String(e) })));
  }, [hex, key, proved, draft, host, name]);

  const step = publishSteps({ ...readings, name: nameWhy }, { author, slug: draft.slug, proved: proved ?? "", sha, realm: chain.realm });
  const id = readings.versions ? holeId(author, draft.slug, readings.versions) : "";
  const v = Number(id.slice(id.lastIndexOf("/v") + 2)) || 1;
  const sizes = { bytes: cost?.bytes ?? hex.length / 2, name, note, v, newAuthor: true };
  const b = bill({ ...sizes, gasPrice: prices.gas, bytePrice: prices.byte });
  const gas = gasFor(sizes), deposit = Math.round(b.deposit * 1e6);

  // after a signature: the chain read until it names the new version
  const land = async () => {
    setSent("landing");
    for (const t0 = Date.now(); Date.now() - t0 < LAND_MS && live.current; await wait(3000)) {
      if ((await chain.current(alias).catch(() => "")) === id) return (setSent("done"), onDone(id));
    }
    if (live.current) (setSent(""), setWhy("The chain does not show it yet. If you signed, give it a minute and look again."));
  };
  const adena = async () => {
    setWhy("");
    try {
      const { address } = await connect({ chainId, rpc });
      if (address !== author) return setWhy(`Adena is on ${address}, not ${author}: the hole's address, and its weather, are that one's. Switch accounts in Adena.`);
      setSent("signing");
      await publishHole({ address, realm: chain.realm, slug: draft.slug, hex, note, gas, deposit, price: prices.gas, chainId, rpc });
      await land();
    } catch (e) {
      setSent("");
      setWhy(e instanceof Error ? e.message : String(e));
    }
  };
  const command = gnokeyPublish({ realm: chain.realm, slug: draft.slug, hex, note, gas, price: prices.gas, deposit, chainId, rpc, author });
  // the 3D: the final data as a player's client reads it (no weather in it: any id will do until the chain says which)
  const state: Hole | null = useMemo(() => {
    if (!hex) return null;
    const shown = `${alias}/v1`;
    host.load(shown, hex);
    host.setperiod(1);
    try { return JSON.parse(host.state(shown)) as Hole; } catch { return null; }
  }, [hex, alias, host]);

  if (sent === "done") {
    const lines = cardLines({ name, world: draft.world, par: draft.par, author });
    const card = () => {
      const c = capture.current?.();
      if (c) void shareCard(c, lines).then((blob) => blob && download(blob, `${draft.slug}.png`));
    };
    return (
      <main className="pub pub--done">
        <section className="pub__hole" aria-label="Your hole">
          <Preview state={state} fresh capture={capture} />
          <div className="pub__card"><b>{lines[0]}</b><small>{lines[1]}</small></div>
        </section>
        <section className="pub__doneform">
          <h2>{name} is on gno.land!</h2>
          <p>Play it for real: your best becomes the ghost your friends race.</p>
          <a className={buttonClass({ variant: "gold" })} href={playLink(holeRow(id, draft))}>Play it for real</a>
          <Share {...holeShare(name, id)} label="Share it" />
          <button type="button" className="linkish" onClick={card}>Save its card</button>
        </section>
      </main>
    );
  }
  const off = step.at !== "ready" || !cost;
  return (
    <main className="pub">
      <section className="pub__hole" aria-label="The hole as players will see it">
        <Preview state={state} fresh />
        <div className="pub__card"><b>{name}</b><small>{worldName(draft.world)} · par {draft.par || "–"}</small></div>
      </section>
      <section className="pub__form" aria-label="Publish">
        <div className="pub__scroll">
          <p className="pub__forever">Your hole, its name and its note are public and stay on the chain for good: nothing published can be deleted, by you or by anyone. The site&apos;s owner can hide a hole from the lists and from this site. <a href={ISSUES} target="_blank" rel="noreferrer">Report a hole</a></p>
          <label className="pub__field">
            <span>Name <em>{[...draft.title].length}/{MAX_NAME}</em></span>
            <input value={draft.title} maxLength={MAX_NAME * 2} aria-invalid={step.at === "name"} onChange={(e) => onDraft({ ...draft, title: [...e.target.value].slice(0, MAX_NAME).join("") })} disabled={!!sent} />
            {name !== draft.title && <small>Kept as: {name}</small>}
          </label>
          <div className="pub__field"><span>Address</span><code>{id || `${alias}/v…`}</code><small>Fixed at the test: the weather comes from it.</small></div>
          {/* the par, explained by the rounds that proved it */}
          {par && <div className="pub__field"><span>Par</span><code>{draft.par}</code><small>{par}</small></div>}
          <label className="pub__field">
            <span>A line for players <em>{[...draft.note].length}/{MAX_NOTE}</em></span>
            <textarea value={draft.note} rows={2} aria-invalid={step.at === "name"} onChange={(e) => onDraft({ ...draft, note: [...e.target.value.replace(/\n/g, " ")].slice(0, MAX_NOTE).join("") })} disabled={!!sent} />
            {note !== draft.note && <small>Kept as: {note}</small>}
          </label>
          {step.at === "unread" && <Button onClick={() => setTries((n) => n + 1)}>Try again</Button>}
          {step.at === "reading" ? <p className="pub__note" role="status">Checking with the chain…</p>
            : step.why && <p className={step.at === "name" ? "pub__bad" : "pub__note"} role={step.at === "name" ? "alert" : "status"}>{step.why}</p>}
          <dl className="pub__bill">
            <dt>Storage deposit</dt><dd>{gnot(deposit)} GNOT</dd>
            <dt>Network fee</dt><dd>{b.fee.toFixed(2)} GNOT</dd>
            <dt>At most</dt><dd><b>{b.total.toFixed(2)} GNOT</b></dd>
          </dl>
          <p className="pub__small">The chain&apos;s price for keeping and checking the hole. Nothing goes to the game.</p>
          <details className="pub__gnokey">
            <summary>Publish with gnokey instead</summary>
            {command && !off ? (
              <>
                <p className="pub__small">Run it where gnokey holds the key of {author}: the hole was proved under that address.</p>
                <pre>{command}</pre>
                <div className="pub__row">
                  <Button onClick={() => void copy(command)}>{copied ? "Copied" : "Copy the command"}</Button>
                  <Button onClick={() => void land()} disabled={!!sent}>I ran it</Button>
                </div>
              </>
            ) : <p className="pub__small">Once the checks pass.</p>}
          </details>
          {why && <p className="pub__bad" role="alert">{why}</p>}
        </div>
        <div className="pub__foot">
          {step.at === "newer" || step.at === "hole" ? <Button variant="gold" className="btn--wide" onClick={onRetest}>{step.at === "hole" && !/^The rounds/.test(step.why) ? "Back to Edit" : "Test again (free)"}</Button>
            : sent === "signing" ? <p className="pub__note" role="status">Check the window Adena opened, and sign there.</p>
              : sent === "landing" ? <p className="pub__note" role="status">Signed: the chain is taking it…</p>
                : hasAdena() ? <Button variant="chain" type="button" className="btn--wide" disabled={off} onClick={() => void adena()}>{step.at === "reading" ? "Checking with the chain…" : `Publish in Adena · ${b.total.toFixed(2)} GNOT`}</Button>
                  : <p className="pub__note">Adena is not in this browser: publish with gnokey above.</p>}
        </div>
      </section>
    </main>
  );
}
