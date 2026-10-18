"use client";

// The Builder's one decision before anything of it loads (the GUI spec's
// B0): on a computer the editor; on a phone, a touch screen or under 900 px
// the phone's screen, and the editor's code and builder.wasm are never
// downloaded (each is a chunk of its own, reached only here, by
// next/dynamic). A window narrowed past 900 px later swaps the editor out
// (its draft is kept in the browser as it goes).
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { builderOn, onComputer, PHONE_QUERY } from "@/lib/builder/route";

const Builder = dynamic(() => import("@/components/builder/Builder"), { ssr: false });
const PhoneBuilder = dynamic(() => import("@/components/builder/PhoneBuilder"), { ssr: false });

export default function Gate() {
  const [where, setWhere] = useState<"computer" | "phone" | null>(null);
  useEffect(() => {
    const m = window.matchMedia(PHONE_QUERY);
    const say = () => setWhere(onComputer((q) => window.matchMedia(q).matches) ? "computer" : "phone");
    say();
    m.addEventListener("change", say);
    return () => m.removeEventListener("change", say);
  }, []);
  if (!builderOn()) {
    return (
      <main className="builder-off">
        <h1>The Builder isn&apos;t open yet.</h1>
        <p><a href="/">Play the course</a></p>
      </main>
    );
  }
  // the page's name, off screen (a screen's title is its h2, as the game's: app/intro.tsx)
  return (
    <>
      <h1 className="sr-only">The Builder</h1>
      {where === "computer" ? <Builder /> : where === "phone" ? <PhoneBuilder /> : null}
    </>
  );
}
