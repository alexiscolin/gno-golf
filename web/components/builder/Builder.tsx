"use client";

// The Builder on a computer (the GUI spec's B1, B2, B5): builder.wasm
// loaded, then the drafts this browser keeps (Start: open one, or start a
// new hole in a world), then the editor. Reached only through app/build/gate.tsx's
// dynamic import: nothing here loads on a phone.
import "@/app/title.css";
import "@/app/build/builder.css";
import "@/app/build/phone.css";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { loadDrafts, saveDrafts, type Draft } from "@/lib/builder/draft";
import { knownAuthor } from "@/lib/builder/holes";
import { canonicalHex, parAllowed, proofKey, provedAs } from "@/lib/builder/proof";
import { loadBuilder } from "@/lib/builder/load";
import type { BuilderHost } from "@/lib/builder/wasm";
import Editor from "./Editor";
import Header from "./Header";
import Publish from "./Publish";
import Start from "./Start";
import TestMode from "./TestMode";
import { firstRun, HINTS_KEY } from "@/lib/builder/templates";

export default function Builder() {
  const [host, setHost] = useState<BuilderHost | null>(null);
  const [failed, setFailed] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // the draft open (its place in the list), how many times opened (a fresh editor each), and the step
  const [open, setOpen] = useState<{ i: number; n: number; step: "edit" | "test" | "publish"; test?: { hex: string; key: string } } | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [unkept, setUnkept] = useState(false);
  const [hints, setHints] = useState(false);
  const [guess, setGuess] = useState(0); // the meter's par for the draft last edited, until its test rounds set one
  useEffect(() => {
    const list = loadDrafts();
    // a new player: straight onto the Garden's dogleg, with the three hints (templates.ts firstRun)
    let hinted = true;
    try { hinted = !!localStorage.getItem(HINTS_KEY); } catch {}
    const first = firstRun(list, hinted);
    if (first) {
      setUnkept(!saveDrafts([first]));
      setDrafts([first]);
      setOpen({ i: 0, n: 0, step: "edit" });
      setHints(true);
    } else setDrafts(list);
    setAuthor(knownAuthor());
    void loadBuilder().then(setHost, (e: Error) => setFailed(e.message));
  }, []);
  const keep = useCallback((list: Draft[]) => (setDrafts(list), setUnkept(!saveDrafts(list))), []);
  const at = open?.i ?? -1;
  const update = useCallback((f: (d: Draft) => Draft) => {
    if (at < 0) return;
    setDrafts((list) => {
      const next = list.map((x, k) => (k === at ? f(x) : x));
      setUnkept(!saveDrafts(next));
      return next;
    });
  }, [at]);
  const onSave = useCallback((d: Draft) => update(() => d), [update]);

  if (failed) return <main className="builder-off" role="alert"><h1>The Builder could not load.</h1><p>{failed}</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
  if (!host) return <main className="builder-off" aria-busy="true"><p>Loading the Builder…</p></main>;
  const unkeptNote = unkept && <p className="bench__unkept" role="status">This browser keeps nothing (a private window?): export your hole before you leave.</p>;
  if (open && drafts[open.i]) {
    const d = drafts[open.i], edit = () => setOpen({ ...open, n: open.n + 1, step: "edit", test: undefined });
    const publish = () => setOpen({ ...open, step: "publish" });
    if (open.step === "publish" && author) {
      return (
        <div className={`pbench tint--${d.world}`}>
          <Header title={d.title} slug={d.slug} author={author} world={d.world} worlds={[d.world]} step="publish"
            steps={{ edit: { locked: "", done: true }, test: { locked: "", done: true }, publish: { locked: "", done: false } }}
            action={null} history={null} onTitle={(t) => update((x) => ({ ...x, title: t }))} onSlug={() => {}} onWorld={() => {}}
            onStep={(s) => (s === "edit" ? edit() : s === "test" && setOpen(open.test ? { ...open, step: "test" } : { ...open, step: "edit" }))} onBack={edit} />
          <Publish host={host} draft={d} author={author} onDraft={(x) => update(() => x)} onRetest={edit} onDone={() => {}} />
          {unkeptNote}
        </div>
      );
    }
    if (open.step === "test" && open.test) {
      const { hex, key } = open.test, proved = !!author && !!provedAs(d.proofs, d.world, key, author, d.slug);
      return (
        <div className={`tbench tint--${d.world}`}>
          <Header title={d.title} slug={d.slug} author={author} world={d.world} worlds={[d.world]} step="test"
            steps={{ edit: { locked: "", done: true }, test: { locked: "", done: proved }, publish: { locked: proved ? "" : "Hole it in every weather first", done: false } }}
            action={proved ? { text: "Publish →", kind: "chain", onClick: publish } : { text: "Back to edit", kind: "ghost", onClick: edit }}
            history={null} onTitle={(t) => update((x) => ({ ...x, title: t }))} onSlug={() => {}} onWorld={() => {}} onStep={(s) => (s === "edit" ? edit() : s === "publish" && proved && publish())} onBack={edit} />
          <TestMode host={host} draft={d} hex={hex} proofKey={key} author={author} guess={guess} onAuthor={setAuthor}
            onProof={(p) => update((x) => ({ ...x, proofs: [...x.proofs.filter((q) => !(q.kind === p.kind && q.id === p.id && q.key === p.key)), p] }))}
            onPar={(par) => update((x) => (parAllowed(x.proofs.filter((q) => q.key === key), x.par) ? x : { ...x, par }))} />
          {unkeptNote}
        </div>
      );
    }
    return (
      <>
        <Editor key={`${open.i}/${open.n}`} host={host} first={d} author={author} onSave={onSave} onBack={() => setOpen(null)} onPublish={publish} onEstimate={setGuess}
          hints={hints} onHinted={() => { try { localStorage.setItem(HINTS_KEY, "1"); } catch {} setHints(false); }}
          onTest={(x) => {
            const hex = canonicalHex(x, host);
            if (hex == null) return;
            void proofKey(x, host).then((key) => key && setOpen({ ...open, step: "test", test: { hex, key } }));
          }} />
        {unkeptNote}
      </>
    );
  }
  return (
    <Start host={host} author={author} drafts={drafts}
      onOpen={(i) => setOpen({ i, n: 0, step: "edit" })}
      onAdd={(d) => { keep([...drafts, d]); setOpen({ i: drafts.length, n: 0, step: "edit" }); }}
      onDelete={(i) => keep(drafts.filter((_, k) => k !== i))} />
  );
}
