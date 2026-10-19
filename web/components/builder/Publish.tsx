"use client";

// The publish step (the GUI spec's B4; the hole-builder design's "The
// publish flow"): the hole as players will see it (the editor's board), and the form (its right column): its name
// (edited in the header, the one place) and its note as the chain will keep
// them (builder.wasm's check, PublishMine's own cleaning, its link check
// live), its address, the permanence said before anything else, the total
// on the button and the bill under "What publishing costs" before any signature, then
// Adena (or the gnokey command behind a tap), and the chain read until it
// names the new version; published, the author's own score is the hole's
// "Beat the builder" line (proof.ts builderScore). Before it opens, the chain is read (publishing open,
// the Builder's checks the realm's own, no successor, the alias's versions)
// and the hole judged once more as it will be published: the Builder's rules
// and the census, the proofs replayed in their strokes, the par (publish.ts
// holeHolds, publishSteps).
import { useEffect, useMemo, useRef, useState } from "react";
import { shortAddr, useCopied } from "@/components/common";
import { Button, InfoTip } from "@/components/ui";
import { buttonClass } from "@/components/button";
import Share from "@/components/Share";
import { aboutGnot, connect, hasAdena, publishHole, PRICE } from "@/lib/adena";
import { BYTE_PRICE, makeChain, wait } from "@/lib/chain";
import { explain } from "@/lib/builder/explain";
import { endpoints, playLink } from "@/lib/builder/holes";
import { bill, finalHex, gasFor, gnokeyPublish, holeHolds, parLine, publishSteps, type Readings } from "@/lib/builder/publish";
import { census } from "@/lib/builder/drawn";
import { loadPalette } from "@/lib/builder/palette";
import { builderScore, proofKey, provedAt, shaOf } from "@/lib/builder/proof";
import { holeId, holeRow, slugOf } from "@/lib/builder/testmode";
import { ISSUES } from "@/lib/site";
import { loadTakedown, takenDown } from "@/lib/takedown";
import { sameSources } from "@/lib/sim/sources";
import type { Draft } from "@/lib/builder/draft";
import type { BuilderHost, Cost } from "@/lib/builder/wasm";
import type { Hole } from "@/lib/scene/data";
import Preview from "./Preview";
import { beatLine, cardLines, holeShare, saveFile as download, shareCard } from "./share";
import { MAX_NOTE } from "@/lib/builder/draft";
import { worldName } from "@/lib/builder/rules";

/** How long the chain is read for the new version after a signature (it lands within a few blocks). */
const LAND_MS = 90_000;

export default function Publish({ host, draft, author, next, onDraft, onRetest, onBuild, onDone }: {
  host: BuilderHost;
  draft: Draft;
  author: string;
  /** the id the editor found it proved under (testmode.ts nextId: the alias's next version as it read it) */
  next: string;
  /** the name or the note changed: kept in the draft (neither moves a ball) */
  onDraft: (d: Draft) => void;
  /** back to play it again (a newer version elsewhere, another address: new weather) */
  onRetest: () => void;
  /** back to Build only (the hole no longer holds: its errors to fix, nothing played unasked) */
  onBuild: () => void;
  onDone: (id: string) => void;
}) {
  const { rpc, web } = useMemo(() => endpoints(window.location.search), []);
  const chain = useMemo(() => makeChain({ rpc, web }), [rpc, web]);
  const alias = `${author}/${draft.slug}`;
  const [readings, setReadings] = useState<Readings>({ publishing: undefined, rules: undefined, writer: undefined, taken: undefined, versions: undefined, hole: undefined, name: "", funds: undefined });
  const [prices, setPrices] = useState({ gas: PRICE, byte: BYTE_PRICE });
  const [chainId, setChainId] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [sha, setSha] = useState("");
  const [sent, setSent] = useState<"" | "signing" | "landing" | "done">("");
  const [why, setWhy] = useState("");
  const [copied, copy] = useCopied();
  const live = useRef(true);
  const capture = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const gnokey = useRef<HTMLDetailsElement>(null);
  useEffect(() => ((live.current = true), () => void (live.current = false)), []); // (true again on a remount: dev's StrictMode mounts twice)

  // the name and note as the chain will keep them, and what the data will be with that name in it
  const first = host.check(draft.slug, finalHex(draft, host, draft.title) ?? "", draft.note);
  const name = first.ok ? first.cost.name : draft.title, note = first.ok ? first.cost.note : draft.note;
  const hex = finalHex(draft, host, name) ?? "";
  const checked = host.check(draft.slug, hex, note);
  const cost: Cost | null = checked.ok ? checked.cost : null;
  const nameWhy = checked.ok ? "" : explain(checked.why);
  // proved under the id the editor read, as Play and the stepper go by (proof.ts provedAt); one published since, publishSteps says
  const proved = key && next ? provedAt(draft.proofs, draft.world, key, next) : null;
  const mine = proved ? draft.proofs.filter((p) => p.key === key && p.id === proved) : [];
  const par = proved ? parLine(mine, draft.par) : "", strokes = builderScore(mine);

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
    // (what the author's account holds: one that can't pay told before Adena)
    void chain.balance(author).then((funds) => live.current && setReadings((r) => ({ ...r, funds })), () => {});
    void chain.storagePrice().then((byte) => live.current && setPrices((p) => ({ ...p, byte })), () => {});
    void chain.chainId().then((c) => live.current && setChainId(c), () => {});
  }, [chain, alias, host, tries, author]);
  useEffect(() => void proofKey(draft, host).then((k) => live.current && setKey(k)), [draft, host]);
  useEffect(() => {
    // (another address: its rounds were played under the one before, its weather another)
    const untested = draft.proofs.some((p) => p.key === key && slugOf(p.id) !== draft.slug)
      ? "The rounds that proved it were played under another address: play it again under this one."
      : "The rounds that proved it no longer play out the same on its final data: play it again.";
    if (!hex || !key || !proved) return setReadings((r) => ({ ...r, hole: key && !proved ? untested : undefined }));
    setReadings((r) => ({ ...r, hole: undefined }));
    const judged = loadPalette(draft.world).then((palette) => holeHolds({ ...draft, title: name }, hex, key, proved, { host, palette, census }));
    void Promise.all([judged, shaOf(hex)]).then(([hole, s]) => {
      if (!live.current) return;
      setReadings((r) => ({ ...r, hole }));
      setSha(s);
    }, (e: unknown) => live.current && setReadings((r) => ({ ...r, hole: e instanceof Error ? e.message : String(e) })));
  }, [hex, key, proved, draft, host, name]);

  const id = readings.versions ? holeId(author, draft.slug, readings.versions) : "";
  const v = Number(id.slice(id.lastIndexOf("/v") + 2)) || 1;
  const sizes = { bytes: cost?.bytes ?? hex.length / 2, name, note, v, newAuthor: true };
  const b = bill({ ...sizes, gasPrice: prices.gas, bytePrice: prices.byte });
  const gas = gasFor(sizes), deposit = b.deposit;
  const step = publishSteps({ ...readings, name: nameWhy }, { author, slug: draft.slug, proved: proved ?? "", sha, realm: chain.realm, pay: { gas, price: prices.gas, deposit, most: b.most } });

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
    const lines = cardLines({ name, world: draft.world, par: draft.par, author, strokes });
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
        <section className="col pub__doneform">
          <h2>{name} is on gno.land!</h2>
          {strokes > 0 && <p className="pub__beat">{beatLine(strokes)}: your own round is the one to beat.</p>}
          <p>Play it for real: your best becomes the ghost your friends race.</p>
          <a className={buttonClass({ variant: "gold" })} href={playLink(holeRow(id, draft))}>Play it for real</a>
          <Share {...holeShare(name, id, strokes)} label="Share it" />
          <button type="button" className="linkish" onClick={card}>Save its card</button>
        </section>
      </main>
    );
  }
  const off = step.at !== "ready" || !cost;
  // no Adena: the footer's way to gnokey, its section (above it, in the form's scroll) opened and brought into view
  const toGnokey = () => {
    const d = gnokey.current;
    if (d) (d.open = true, d.scrollIntoView({ block: "nearest", behavior: "smooth" }), d.querySelector("summary")?.focus({ preventScroll: true }));
  };
  return (
    <main className="pub">
      <section className="pub__hole" aria-label="The hole as players will see it">
        <Preview state={state} fresh />
      </section>
      <section className="col pub__form" aria-labelledby="pub-head">
        <h2 className="col__head" id="pub-head">Publish on gno.land</h2>
        <div className="pub__scroll">
          <p className="pub__forever">Your hole, its name and its note are public and stay on the chain for good: nothing published can be deleted, by you or by anyone. The site&apos;s owner can hide a hole from the lists and from this site. <a href={ISSUES} target="_blank" rel="noreferrer">Report a hole</a></p>
          {/* its name, typed here as in the header (one title, both places), as the chain will keep it said under it */}
          <label className="pub__field">
            <span className="h-sub">Name</span>
            <small>{name !== draft.title ? `Kept as: ${name || "–"}` : "Shown on the course and in the holes' lists."}</small>
            <input value={draft.title} maxLength={40} placeholder="Name your hole" aria-invalid={step.at === "name"} disabled={!!sent} onChange={(e) => onDraft({ ...draft, title: e.target.value })} />
          </label>
          {/* what is read, not typed: its world, the par explained by the rounds that proved it, its address */}
          <div className="pub__field">
            <span className="h-sub">Already set</span>
            <dl className="review pub__review">
              <dt>World</dt><dd><b>{worldName(draft.world)}</b></dd>
              <dt>Par</dt><dd><b>{draft.par || "–"}</b>{par && <small>{par}</small>}</dd>
              {/* its address: the one its rounds were played at, read, not typed (another would have weathers not played:
                  never a Publish locked by a change here); a version after the first says it is one */}
              <dt>Address</dt><dd><b className="pub__link"><span title={author}>{shortAddr(author)}/</span>{draft.slug}<span>/v{id ? v : "…"}</span></b>
                <small>{v > 1 ? "A new version of your hole at this address." : "Its link on gno.land, set as you played it: it stays for good."}</small></dd>
            </dl>
          </div>
          <div className="pub__field">
            <span className="h-sub"><label htmlFor="pub-note">A line for players</label> <small>· optional</small> <InfoTip label="What is a line for players?" note="A tip or a dare from you, in a sentence: players read it under your hole's name in the community holes and on its card as they play it." /></span>
            <textarea id="pub-note" value={draft.note} rows={2} placeholder="Bank it off the left wall." aria-invalid={step.at === "name"} onChange={(e) => onDraft({ ...draft, note: [...e.target.value.replace(/\n/g, " ")].slice(0, MAX_NOTE).join("") })} disabled={!!sent} />
            <small className="pub__help"><span>{note !== draft.note && `Kept as: ${note}`}</span><span>{[...draft.note].length}/{MAX_NOTE}</span></small>
          </div>
          {/* what went wrong, then its Try again */}
          {step.at === "reading" ? <p className="pub__note" role="status">Checking with the chain…</p>
            : step.why && <p className={step.at === "name" || step.at === "funds" ? "pub__bad" : "pub__note"} role={step.at === "name" ? "alert" : "status"}>{step.why}</p>}
          {step.at === "unread" && <Button onClick={() => setTries((n) => n + 1)}>Try again</Button>}
          {/* the total on the button; what it is made of a tap away, before any signature */}
          <details className="pub__bill">
            <summary>What publishing costs</summary>
            <dl>
              <dt>Storage deposit</dt><dd>{aboutGnot(b.deposit)} GNOT</dd>
              <dt>Network fee</dt><dd>{aboutGnot(b.fee)} GNOT</dd>
              <dt>At most, in all</dt><dd>{aboutGnot(b.most)} GNOT</dd>
            </dl>
            <p className="pub__small">The chain&apos;s price for keeping and checking the hole. Nothing goes to the game.</p>
          </details>
          <details className="pub__gnokey" ref={gnokey}>
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
          {step.at === "newer" || step.at === "hole" ? (step.at === "hole" && !/^The rounds/.test(step.why) ? <Button variant="gold" className="btn--wide" onClick={onBuild}>Back to Build</Button>
            : <Button variant="gold" className="btn--wide" onClick={onRetest}>Play it again (free)</Button>)
            : sent === "signing" ? <p className="pub__note" role="status">Check the window Adena opened, and sign there.</p>
              : sent === "landing" ? <p className="pub__note" role="status">Signed: the chain is taking it…</p>
                : hasAdena() ? <Button variant="chain" type="button" className="btn--wide" disabled={off} onClick={() => void adena()}>{step.at === "reading" ? "Checking with the chain…" : `Publish in Adena · ${aboutGnot(b.most)} GNOT`}</Button>
                  : <button type="button" className="linkish" onClick={toGnokey}>No Adena here: publish with gnokey above</button>}
        </div>
      </section>
    </main>
  );
}
