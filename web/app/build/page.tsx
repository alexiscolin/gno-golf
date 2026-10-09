// /build: the hole Builder (docs/superpowers/specs/2026-10-06-hole-builder-design.md),
// behind NEXT_PUBLIC_BUILDER. A static shell: the page decides in the
// browser between the editor (a computer) and the phone's one screen, and
// imports only the one it shows (gate.tsx).
import type { Metadata } from "next";
import Gate from "@/app/build/gate";

export const metadata: Metadata = {
  title: "The Builder · Gnogolf",
  description: "Draw a mini-golf hole, hole it in every weather, and publish it on gno.land for anyone to play.",
  alternates: { canonical: "/build/" },
};

export default function Page() {
  return <Gate />;
}
