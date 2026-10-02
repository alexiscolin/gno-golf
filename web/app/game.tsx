"use client";

// The game, for the home page and every hole's page: a client module of its
// own, as a dynamic import with ssr:false can only be made from one.
import dynamic from "next/dynamic";
import { useEffect } from "react";
import Title from "@/components/Title";
import { start } from "@/lib/analytics";
import { watchClicks } from "@/lib/uitrack";

// WebGL has no business running during a build: the whole game mounts in the
// browser or not at all.
const Golf = dynamic(() => import("@/components/Golf"), {
  ssr: false,
  // the title screen shows while the game loads, so nothing appears under it
  loading: () => <Title loading />,
});

export default function Game() {
  // analytics, once the page is idle (nothing without its key)
  useEffect(() => (void start(), watchClicks()), []);
  return <Golf />;
}
