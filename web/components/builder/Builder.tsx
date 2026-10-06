"use client";

// The Builder on a computer (the GUI spec's B1 and B2): builder.wasm loaded,
// then the editor. Reached only through app/build/gate.tsx's dynamic import.
import { useEffect, useState } from "react";
import { loadBuilder } from "@/lib/builder/load";
import type { BuilderHost } from "@/lib/builder/wasm";

export default function Builder() {
  const [host, setHost] = useState<BuilderHost | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => void loadBuilder().then(setHost, (e: Error) => setFailed(e.message)), []);
  if (failed) return <main className="builder-off" role="alert"><h1>The Builder could not load.</h1><p>{failed}</p></main>;
  if (!host) return <main className="builder-off" aria-busy="true"><p>Loading the Builder…</p></main>;
  return <main className="builder-off"><p>The Builder</p></main>;
}
