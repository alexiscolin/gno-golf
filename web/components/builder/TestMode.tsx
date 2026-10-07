"use client";

// Test mode (the GUI spec's B3; the hole-builder design's "Test mode and
// par"): the game itself (lib/engine, as the page plays a hole) on the
// draft's hole, served by builder.wasm at one clock (localchain.ts), in one
// period of each weather that moves the ball. When the ball drops, the
// round is replayed as its save would be cut (proof.ts replay): that, not
// the live play, is the proof. A chip a weather: ticked once proved, red
// with why once for a round that does not count. The hole's id is fixed
// first (the author's address, the slug, the next version): its weather
// hangs on it.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { connect, hasAdena } from "@/lib/adena";
import { isAddress, makeChain, RULES } from "@/lib/chain";
import { createGame } from "@/lib/engine";
import { camlog } from "@/lib/testhooks";
import { AUTHOR_KEY, endpoints } from "@/lib/builder/holes";
import { makeLocalChain } from "@/lib/builder/localchain";
import { FIND_BACK, replay, suggestPar, unproven, type Proof } from "@/lib/builder/proof";
import { holeId, holeRow, plan, testChain } from "@/lib/builder/testmode";
import type { Draft } from "@/lib/builder/draft";
import type { BuilderHost } from "@/lib/builder/wasm";
import type { Snapshot } from "@/lib/engine/types";

/** A weather's chip: its sign and its name ("" is clear). */
const KINDS: Record<string, [string, string]> = { "": ["☀", "Clear"], wind: ["≋", "Wind"], rain: ["☂", "Rain"], storm: ["⚡", "Storm"], snow: ["❄", "Snow"] };
const chip = (k: string) => KINDS[k] ?? ["•", k];
/** How far back a weather is looked for (FIND_BACK periods), in days, for a sentence. */
const FIND_DAYS = Math.round((FIND_BACK * RULES.periodMs) / 86_400_000);

/** The address step: Adena's account, or one typed (kept in this browser). */
function AddressStep({ onAddress }: { onAddress: (a: string) => void }) {
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");
  const ok = isAddress(typed.trim());
  const adena = async () => {
    try {
      const { rpc } = endpoints(window.location.search);
      onAddress((await connect({ rpc })).address);
    } catch (e) {
      setWhy(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="tmode__ask">
      <h2>Whose hole is it?</h2>
      <p>The hole&apos;s address starts with yours, and its weather comes from that address. Nothing is signed now.</p>
      {hasAdena() && <Button variant="primary" onClick={() => void adena()}>Use my Adena address</Button>}
      <label className="tmode__addr">
        <span>Or type it</span>
        <input value={typed} placeholder="g1…" spellCheck={false} autoCapitalize="off" aria-invalid={!!typed && !ok} onChange={(e) => setTyped(e.target.value)} />
      </label>
      <Button variant="gold" disabled={!ok} onClick={() => onAddress(typed.trim())}>Test with this address</Button>
      {why && <p role="alert" className="tmode__why">{why}</p>}
    </div>
  );
}

export default function TestMode({ host, draft, hex, proofKey, author, guess = 0, onAuthor, onProof, onPar }: {
  host: BuilderHost;
  draft: Draft;
  /** its canonical bytes (fit) */
  hex: string;
  /** proof.ts proofKey of the draft */
  proofKey: string;
  author: string | null;
  /** the difficulty meter's par (0: none): shown, as a guess, until the rounds set it */
  guess?: number;
  onAuthor: (a: string) => void;
  onProof: (p: Proof) => void;
  /** the proofs' suggested par, once every weather is proved */
  onPar: (par: number) => void;
}) {
  const [id, setId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [why, setWhy] = useState<Record<string, string>>({});
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [checking, setChecking] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  // the game's canvas, one each visit (React mounts twice in development, on the same element), its
  // WebGL context freed when the visit ends (a browser holds about sixteen); each weather's game reuses it
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!stage.current) return;
    const el = document.createElement("canvas");
    el.id = "stage";
    stage.current.append(el);
    setCanvas(el);
    return () => {
      (el.getContext("webgl2") ?? el.getContext("webgl"))?.getExtension("WEBGL_lose_context")?.loseContext();
      el.remove();
    };
  }, [!author]); // eslint-disable-line react-hooks/exhaustive-deps -- (the stage is there once an address is)
  const game = useRef<ReturnType<typeof createGame> | null>(null);

  // the hole's id: the author's alias's next version, as the chain says (v1 if it cannot be read)
  useEffect(() => {
    if (!author || !draft.slug) return;
    const { rpc, web } = endpoints(window.location.search), alias = `${author}/${draft.slug}`;
    makeChain({ rpc, web }).versions(alias).then(
      (v) => setId(holeId(author, draft.slug, v)),
      () => (setId(holeId(author, draft.slug, null)), setNote("The chain could not be read: tested as a new hole (v1). If it has versions already, test again once it can be.")),
    );
  }, [author, draft.slug]);

  const left = id ? unproven(draft.proofs, draft.world, proofKey, id) : [];
  const [kinds, setKinds] = useState<{ kind: string; period: number }[]>([]);
  useEffect(() => {
    if (!id) return;
    host.load(id, hex);
    setKinds(plan(host, id, draft.world, Math.floor(Date.now() / RULES.periodMs)));
  }, [id, hex, host, draft.world]);
  const now = kinds.find((k) => left.includes(k.kind)) ?? null;

  // the game on the current weather's period; a new one for the next weather
  useEffect(() => {
    if (!id || !now || !canvas) return;
    if (now.period < 0) return setNote(`No ${chip(now.kind)[1].toLowerCase()} came in the last ${FIND_DAYS} days of this hole's weather: it cannot be proved in it.`);
    const { rpc, web } = endpoints(window.location.search);
    const local = makeLocalChain(host, holeRow(id, draft), hex, now.period);
    const g = (game.current = createGame(canvas, {
      chain: testChain(makeChain({ rpc, web }), local, hex),
      onChange: setSnap,
      onHoled: ({ shots }) => {
        setChecking(true);
        void replay(local, { key: proofKey, id, kind: now.kind, period: now.period, shots: [...shots] }).then((p) => {
          setChecking(false);
          if (typeof p === "string") return setWhy((w) => ({ ...w, [now.kind]: p }));
          setWhy((w) => ({ ...w, [now.kind]: "" }));
          onProof(p);
        });
      },
    }));
    if (camlog()) window.__g = g; // (the rigs' hook, as the game's: ?camlog in a dev or test build only)
    void g.start(id).then(() => g.play(true), (e: unknown) => setNote(e instanceof Error ? e.message : String(e)));
    return () => {
      if (window.__g === g) delete window.__g;
      game.current = null;
      g.destroy();
    };
    // (one game per weather: a proof of this one moves to the next)
  }, [id, now?.kind, now?.period, canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  // every weather proved: the par they suggest
  const proved = !!id && kinds.length > 0 && !left.length;
  useEffect(() => {
    if (proved) onPar(suggestPar(draft.proofs.filter((p) => p.key === proofKey && p.id === id)));
  }, [proved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!author) return <main className="tmode tmode--ask"><AddressStep onAddress={(a) => { try { localStorage.setItem(AUTHOR_KEY, a); } catch {} onAuthor(a); }} /></main>;
  const par = proved ? suggestPar(draft.proofs.filter((p) => p.key === proofKey && p.id === id)) : 0;
  const failed = now && why[now.kind];
  return (
    <main className="tmode">
      <div ref={stage} className="tmode__stage" />
      <div className="tmode__strip" aria-label="The weathers to beat">
        {kinds.map(({ kind }) => {
          const done = !left.includes(kind), on = now?.kind === kind, bad = !!why[kind] && !done;
          const best = draft.proofs.find((p) => p.kind === kind && p.key === proofKey && p.id === id);
          return <span key={kind} className={`tmode__chip${done ? " tmode__chip--done" : on ? " tmode__chip--now" : ""}${bad ? " tmode__chip--bad" : ""}`}>{chip(kind)[0]} {chip(kind)[1]}{done ? ` ✓ ${best?.strokes ?? ""}` : on ? ", now" : ""}</span>;
        })}
        <span className="tmode__par" title={par ? "Par, from your rounds" : guess ? "Par, the difficulty meter's guess until your rounds set it" : undefined}>{par ? `Par ${par}` : guess ? `Par ${guess}?` : "Par –"}</span>
      </div>
      <div className="tmode__card" aria-live="polite">{checking ? "The chain's code replays your round…" : `Stroke ${snap ? snap.strokes : 0}`}</div>
      <div className="tmode__notes">
        {failed && <p className="tmode__why" role="alert">That {chip(now.kind)[1].toLowerCase()} round doesn&apos;t count: {failed} Play it again.</p>}
        {snap?.error && <p className="tmode__why" role="alert">{snap.error}</p>}
        {note && <p className="tmode__note" role="status">{note}</p>}
        {proved && <p className="tmode__done" role="status">Holed in every weather: publish it.</p>}
      </div>
      {!proved && <Button className="tmode__again" onClick={() => (setWhy((w) => (now ? { ...w, [now.kind]: "" } : w)), game.current?.reset())}>Play it again</Button>}
    </main>
  );
}
