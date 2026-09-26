"use client";

import type { ReactNode } from "react";
import { Sheet } from "@/components/ui";
import { REALM_PATH } from "@/lib/chain";

// About: how it works, what is in it, where to go next, and who made it.
const GITHUB = "https://github.com/alexiscolin", REPO = `${GITHUB}/gno-golf`;
const out = { target: "_blank", rel: "noopener noreferrer" } as const;

// the game's own inked icons (the title's facts): 32×32, .fi strokes
const STEPS: readonly { title: string; text: string; icon: ReactNode }[] = [
  {
    title: "You aim",
    text: "Pull back and let go. The game sends your decision, an angle and a power, to the golf realm.",
    icon: (<><path d="M9 6 L16 16 L23 6" className="fi" /><path d="M16 16 V28" className="fi" /><path d="M9 6 Q16 24 23 6" className="fi fi--band" /><circle cx="16" cy="19" r="3.5" className="fi fi--paper" /></>),
  },
  {
    title: "The chain plays it",
    text: "The realm runs the physics and sends back the ball's path. Every preview is a free read: no wallet needed to play.",
    icon: (<><path d="M8 4 H21 L26 9 V28 H8 Z" className="fi fi--paper" /><path d="M21 4 V9 H26" className="fi" /><path d="M12 14 H22 M12 18 H22 M12 22 H17" className="fi" /><circle cx="22" cy="23" r="3.5" className="fi fi--red" /></>),
  },
  {
    title: "You keep it",
    text: "Adena signs one transaction, the chain replays your shots and the round goes on the board. Nobody can type in a score.",
    icon: (<><path d="M10 5 H22 V12 Q22 19 16 19 Q10 19 10 12 Z" className="fi fi--gold" /><path d="M10 8 H6 Q6 14 10 14 M22 8 H26 Q26 14 22 14" className="fi" /><path d="M16 19 V24 M11 28 H21 V24 H11 Z" className="fi" /></>),
  },
];
const FACTS = ["4 cups · 72 holes", "Weather that changes every 5 minutes", "Gnomes to unlock", "Assisted and Pro, ranked apart", "Open source"];

export default function About({ onClose, web }: { onClose: () => void; web: string }) {
  const links: readonly [string, string, string][] = [
    ...(web ? [["The golf realm", `${web}${REALM_PATH}`, "its code and boards, on gnoweb"] as [string, string, string]] : []),
    ["gno.land", "https://gno.land", "the chain it runs on"],
    ["Adena", "https://adena.app", "the wallet that saves your rounds"],
    ["Faucet", "https://faucet.gno.land", "free test GNOT, for pearl-1"],
    ["Gno docs", "https://docs.gno.land", "write a realm of your own"],
  ];
  return (
    <Sheet className="about" label="About Gnogolf" onClose={onClose}>
      <span className="eyebrow">About</span>
      <h2>Gnogolf</h2>
      <p className="about__lead">Mini-golf where a smart contract rolls the ball. Every hole lives on <b>gno.land</b>, and the chain computes every shot.</p>

      <ol className="about__steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <svg viewBox="0 0 32 32" aria-hidden="true">{s.icon}</svg>
            <b><span className="about__n">{i + 1}</span>{s.title}</b>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      <ul className="about__facts" aria-label="In the game">
        {FACTS.map((f) => <li key={f}>{f}</li>)}
      </ul>

      <h3 className="about__h">Go further</h3>
      <ul className="about__links">
        {links.map(([name, href, what]) => (
          <li key={name}>
            <a href={href} {...out}><b>{name} ↗</b><span>{what}</span></a>
          </li>
        ))}
      </ul>

      <footer className="about__credit">
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
        <span>Made by <a href={GITHUB} {...out}><b>alexiscolin</b></a> · <a href={REPO} {...out}>the code on GitHub ↗</a></span>
      </footer>
    </Sheet>
  );
}
