"use client";

// The Builder on a computer (the GUI spec's B1, B2, B5): builder.wasm
// loaded, then the drafts this browser keeps (Start: open one, or start a
// new hole in a world), then the editor; a community hole remixed from the
// game (?remix=, Community.tsx) opens as a new draft. Reached only through
// app/build/gate.tsx's dynamic import: nothing here loads on a phone.
import "@/app/title.css";
import "@/app/build/builder.css";
import "@/app/build/phone.css";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { DRAFT_PREFIX, dropDraft, loadDrafts, newKey, saveDraft, type Draft, type Kept } from "@/lib/builder/draft";
import { endpoints, knownAuthor, remixId } from "@/lib/builder/holes";
import { remixFrom } from "@/lib/builder/importing";
import { census } from "@/lib/builder/drawn";
import { makeChain } from "@/lib/chain";
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
  const [drafts, setDrafts] = useState<Kept[]>([]);
  // the draft open (its key), how many times opened (a fresh editor each), and the step
  const [open, setOpen] = useState<{ at: string; n: number; step: "edit" | "test" | "publish"; test?: { hex: string; key: string } } | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [unkept, setUnkept] = useState(false);
  const [hints, setHints] = useState(false);
  const [guess, setGuess] = useState(0); // the meter's par for the draft last edited, until its test rounds set one
  const [said, setSaid] = useState(""); // why a remix asked for did not open
  const [opened, setOpened] = useState(""); // why a file opened as it is is broken ("" none)
  // a draft added (a new hole, a file, a remix) under a key of its own, and opened
  const add = useCallback((draft: Draft) => {
    const key = newKey();
    setUnkept(!saveDraft(key, draft));
    setDrafts((list) => [...list, { key, draft }]);
    setOpen({ at: key, n: 0, step: "edit" });
  }, []);
  useEffect(() => {
    const list = loadDrafts();
    // a remix asked for (taken from the address at once: a reload does not make another)
    const remix = remixId(window.location.search), url = new URL(window.location.href);
    if (remix) url.searchParams.delete("remix"), window.history.replaceState(window.history.state, "", url);
    // a new player: straight onto the Garden's dogleg, with the three hints (templates.ts firstRun); not on a remix
    let hinted = true;
    try { hinted = !!localStorage.getItem(HINTS_KEY); } catch {}
    const first = remix ? null : firstRun(list.map((k) => k.draft), hinted);
    setDrafts(list);
    if (first) add(first), setHints(true);
    setAuthor(knownAuthor());
    void loadBuilder().then((h) => {
      setHost(h);
      if (!remix) return;
      const { rpc, web } = endpoints(window.location.search);
      void remixFrom(makeChain({ rpc, web }), h, census, remix).then((d) => {
        if (typeof d === "string") return setSaid(d);
        add(d);
      });
    }, (e: Error) => setFailed(e.message));
  }, [add]);
  const at = open?.at;
  const update = useCallback((f: (d: Draft) => Draft) => {
    if (!at) return;
    setDrafts((list) => list.map((k) => {
      if (k.key !== at) return k;
      const draft = f(k.draft);
      setUnkept(!saveDraft(at, draft));
      return { key: at, draft };
    }));
  }, [at]);
  // while this tab keeps every draft, its list follows what the other tabs keep (each saves only its own drafts)
  const home = !open && !unkept;
  useEffect(() => {
    if (!home) return;
    const on = (e: StorageEvent) => (e.key === null || e.key.startsWith(DRAFT_PREFIX)) && setDrafts(loadDrafts());
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, [home]);
  const onSave = useCallback((d: Draft) => update(() => d), [update]);

  if (failed) return <main className="builder-off" role="alert"><h1>The Builder could not load.</h1><p>{failed}</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
  if (!host) return <main className="builder-off" aria-busy="true"><p>Loading the Builder…</p></main>;
  const unkeptNote = unkept && <p className="bench__unkept" role="status">This browser keeps nothing (a private window?): export your hole before you leave.</p>;
  const d = open && drafts.find((k) => k.key === open.at)?.draft;
  if (open && d) {
    const edit = () => setOpen({ ...open, n: open.n + 1, step: "edit", test: undefined });
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
            action={proved ? { text: "Publish →", kind: "chain", pulse: true, onClick: publish } : { text: "Back to edit", kind: "secondary", onClick: edit }}
            history={null} onTitle={(t) => update((x) => ({ ...x, title: t }))} onSlug={() => {}} onWorld={() => {}} onStep={(s) => (s === "edit" ? edit() : s === "publish" && proved && publish())} onBack={edit} />
          <TestMode host={host} draft={d} hex={hex} proofKey={key} author={author} guess={guess} onAuthor={setAuthor} onLeave={edit} onPublish={publish}
            onProof={(p) => update((x) => ({ ...x, proofs: [...x.proofs.filter((q) => !(q.kind === p.kind && q.id === p.id && q.key === p.key)), p] }))}
            onPar={(par) => update((x) => (parAllowed(x.proofs.filter((q) => q.key === key), x.par) ? x : { ...x, par }))} />
          {unkeptNote}
        </div>
      );
    }
    return (
      <>
        <Editor key={`${open.at}/${open.n}`} host={host} first={d} author={author} onSave={onSave} onBack={() => (setOpened(""), setOpen(null), unkept || setDrafts(loadDrafts()))} onPublish={publish} opened={opened} onEstimate={setGuess}
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
    <Start host={host} author={author} drafts={drafts.map((k) => k.draft)} said={said}
      onOpen={(i) => setOpen({ at: drafts[i].key, n: 0, step: "edit" })}
      onAdd={(d, broken = "") => { add(d); setOpened(broken); }}
      onDelete={(i) => { dropDraft(drafts[i].key); setDrafts(drafts.filter((_, k) => k !== i)); }} />
  );
}
