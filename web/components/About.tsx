"use client";

import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ADENA_URL, FAUCET, NETWORK, OTHER_URL } from "@/lib/network";
import { Sheet } from "@/components/ui";
import { REALM_PATH, pkgsPath, storePath } from "@/lib/chain";
import { sound } from "@/lib/feel";
import { optedOut, optOut } from "@/lib/analytics";
import { courseCount, holesWord, plural } from "@/components/common";
import { sight } from "@/lib/scene/data";

// About: how it works, what is in it, where to go next, and who made it.
const GITHUB = "https://github.com/alexiscolin", REPO = `${GITHUB}/gno-golf`;
const out = { target: "_blank", rel: "noopener noreferrer" } as const;
const ANALYTICS = !!process.env.NEXT_PUBLIC_POSTHOG_KEY;

// the game's own inked icons (the title's facts): 32×32, .fi ink over
// paper, one touch of red each
export const ICON = {
  aim: (<><path d="M9 6 L16 16 L23 6" className="fi" /><path d="M16 16 V28" className="fi" /><path d="M9 6 Q16 24 23 6" className="fi fi--band" /><circle cx="16" cy="19" r="3.5" className="fi fi--paper" /></>),
  chain: (<><path d="M8 4 H21 L26 9 V28 H8 Z" className="fi fi--paper" /><path d="M21 4 V9 H26" className="fi" /><path d="M12 14 H22 M12 18 H22 M12 22 H17" className="fi" /><circle cx="22" cy="23" r="3.5" className="fi fi--red" /></>),
  keep: (<><path d="M10 5 H22 V12 Q22 19 16 19 Q10 19 10 12 Z" className="fi fi--paper" /><path d="M10 8 H6 Q6 14 10 14 M22 8 H26 Q26 14 22 14 M16 19 V24" className="fi" /><path d="M11 24 H21 V28 H11 Z" className="fi fi--red" /></>),
};
const STEPS: readonly { title: string; text: string; icon: ReactNode }[] = [
  {
    title: "You aim",
    text: "Pull back and let go. The game sends your decision, an angle and a power, to the golf realm.",
    icon: ICON.aim,
  },
  {
    title: "The chain plays it",
    text: "The realm runs the physics and sends back the ball's path. Every preview is a free read: no wallet needed to play.",
    icon: ICON.chain,
  },
  {
    title: "You keep it",
    text: "Adena or gnokey signs; the chain replays your shots and puts the round on the board. No score typed in.",
    icon: ICON.keep,
  },
];
// what gnoweb shows of the game, to check it plays as it says: the code, where the records are kept (and who may change the rules), the physics, the holes' format, the game as text
const VERIFY = [["The realm's code", `${REALM_PATH}$source`], ["Where the records are kept", storePath(REALM_PATH)], ["The physics", `${pkgsPath(REALM_PATH)}physics$source`], ["The hole data", `${pkgsPath(REALM_PATH)}course$source`], ["The game as text", REALM_PATH]] as const;
const FACTS = ["Weather that changes every 5 minutes", "Gnomes to unlock", "Assisted and Pro, ranked apart", "Open source"];
/** The course's fact, from the chain's holes per cup ("5 cups · 90 holes"); none before it has answered. */
function courseFact(counts: Readonly<Record<string, number>>) {
  const { cups, holes } = courseCount(counts);
  return cups ? [`${cups} ${plural("cup", cups)} · ${holesWord(holes)}`] : [];
}

/** The round corner button every screen has: back at the top left, about at the top right. */
function CornerButton({ side, label, onClick, children }: { side: "back" | "about"; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`round round--icon screen__${side}`} aria-label={label} title={label} onClick={(e) => (e.stopPropagation(), onClick())}>
      {children}
    </button>
  );
}
/** The inked (i) of About: the corner button's, the menu's. */
export const InfoIcon = () => (
  <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M10 9 V14 M10 6 V6.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
);
/** A screen's back button: an inked arrow in the top-left corner. */
export const BackButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <CornerButton side="back" label={label} onClick={onClick}>
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </CornerButton>
);
/** A screen's about button: an inked (i) in the top-right corner. */
export const AboutButton = ({ onClick }: { onClick: () => void }) => (
  <CornerButton side="about" label="About Gnogolf" onClick={onClick}>
    <InfoIcon />
  </CornerButton>
);

/**
 * A front screen as the games, the rival, their ghosts and the cups have it:
 * its colours (tint), Back and About in its corners (and what else the
 * corner row holds: corner), its head (the pill, the title, the rival raced
 * under them: dare), then its own parts.
 */
interface FrontScreenProps {
  /** the screen's own classes, beside "screen worlds front" */
  className: string;
  tint?: string;
  /** the inner column's own class, beside "worlds__in" */
  inner?: string;
  back: string;
  onBack: () => void;
  onAbout: () => void;
  eyebrow: string;
  title: string;
  dare?: ReactNode;
  corner?: ReactNode;
  children?: ReactNode;
}
export function FrontScreen({ className, tint = "garden", inner = "", back, onBack, onAbout, eyebrow, title, dare, corner, children }: FrontScreenProps) {
  return (
    <div className={`screen worlds front ${className} tint--${tint}`}>
      <BackButton label={back} onClick={() => (sound("blip"), onBack())} />
      <AboutButton onClick={onAbout} />
      {corner}
      <div className={`worlds__in ${inner}`.trim()}>
        <div className="front__head">
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="worlds__title">{title}</h2>
          {dare}
        </div>
        {children}
      </div>
    </div>
  );
}

// the rules as the chain plays them (golf.gno, docs/golf.md) and the card keeps them (lib/card.ts)
const RULES: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  ["On the course", [
    ["Strokes", "Pull back and let go: every shot is a stroke. Hole out in as few as you can; par is the number to beat."],
    ["Water and falls", "In the water or the sea, in lava, a shaft or the void (the Crystal Mines), off a roof or off the board, the ball goes back where you shot from. The stroke counts, nothing more."],
    ["Moving pieces", "On a timed hole the pieces run on a clock: the moment you let go decides where they are."],
    ["Weather", "It changes every 5 minutes, the same for everyone: calm, wind, fog, rain, storm or snow, and the ball runs with it."],
    ["Underground", `The Crystal Mines never get a storm or snow, and name the rest as a mine does: still air (calm), a draught (the wind: it pushes the ball), dripping (the rain: the green and the crystal ice run a little faster, and puddles slow the ball), lights out (the fog: the aim dots stop ${sight(true, false)} units ahead). Two galleries are always dark: your lamp lights the dots ${sight(false, true)} units ahead, ${sight(true, true)} with the lights out.`],
    ["Aim", "Assisted shows the whole aim line, Pro shows none. Each is ranked on its own boards."],
    ["Limit", "A round stops at 60 strokes: start the hole again."],
  ]],
  ["Your card", [
    ["Your score", "The cup card keeps your latest score on each hole, in this browser: play a hole again and the new score replaces it. Your best stays on the boards once saved."],
    ["Cups and gnomes", "A cup is complete once its 18 holes are on your card. Finishing a cup, playing one at par or under and five holes-in-one unlock gnomes. The Crystal Mines are the expert cup: a few minutes a hole."],
  ]],
  ["On the boards", [
    ["Save on-chain", "To rank a round, save it on-chain (with Adena, or gnokey in a terminal) before the next weather is over (the card counts down). The chain plays your shots again: nobody can type in a score."],
    ["Ranked", "Players with a gno.land name are ranked: take yours with Adena, or gnokey in a terminal. A hole's board keeps each player's best; the course ranking counts holes first, then the score against par (a hole at par counts the same whatever its par)."],
    ["Duels", "Share a saved round and your link dares a friend: they race your best as a see-through ghost, stroke for stroke. It is your real round, replayed by the chain in the weather you had, so it can't be faked."],
  ]],
];

/** The rules, on a sheet of their own (from the cup card and the about sheet). */
export function Rules({ onClose, onBadges }: { onClose: () => void; onBadges: () => void }) {
  return (
    <Sheet className="about" label="The rules" onClose={onClose}>
      <span className="eyebrow">How to play</span>
      <h2>The rules</h2>
      {RULES.map(([title, list]) => (
        <section key={title}>
          <h3 className="about__h">{title}</h3>
          <ul className="rules">
            {list.map(([b, text]) => <li key={b}><b>{b}</b> {text}</li>)}
          </ul>
        </section>
      ))}
      <p className="about__rules"><button className="linkish" onClick={onBadges}>The badges to earn →</button></p>
    </Sheet>
  );
}

// support: the tip, where the game offers one (components/Tip.tsx)
export default function About({ onClose, onRules, web, support = null, counts = {} }: { onClose: () => void; onRules: () => void; web: string; support?: ReactNode; counts?: Readonly<Record<string, number>> }) {
  const links: readonly [string, string, string][] = [
    ...(web ? [["The golf realm", `${web}${REALM_PATH}`, "its code and boards, on gnoweb"] as [string, string, string]] : []),
    ["gno.land", "https://gno.land", "the chain it runs on"],
    ["Adena", ADENA_URL, "the wallet that saves your rounds"],
    // the faucet feeds the testnet only; the other deployment, when there is one
    ...(NETWORK === "testnet" ? [["Faucet", FAUCET, "free test GNOT for the testnet"] as [string, string, string]] : []),
    ...(OTHER_URL ? [NETWORK === "testnet" ? ["Play on mainnet", OTHER_URL, "the real chain: scores for keeps"] : ["Play on the testnet", OTHER_URL, "free test GNOT, same course"]] as [string, string, string][] : []),
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
        {[...courseFact(counts), ...FACTS].map((f) => <li key={f}>{f}</li>)}
        {/* the rules, where the facts end: a link, not a tag */}
        <li className="about__more"><button className="linkish" onClick={onRules}>The rules of the game →</button></li>
      </ul>

      <h3 className="about__h">Go further</h3>
      <ul className="about__links">
        {links.map(([name, href, what]) => (
          <li key={name}>
            <a className="btn btn--ghost" href={href} {...out}><b>{name} ↗</b><span>{what}</span></a>
          </li>
        ))}
      </ul>
      {web && (<>
        <h3 className="about__h">Verify it yourself</h3>
        <p className="real__fine about__verify">
          {VERIFY.map(([name, path], i) => <span key={name}>{i > 0 && " · "}<a href={`${web}${path}`} {...out}>{name} ↗</a></span>)}
        </p>
      </>)}
      {support}

      <footer className="about__credit">
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
        <span>
          Made by <a href={GITHUB} {...out}><b>alexiscolin</b></a> · <a href={REPO} {...out}>the code on GitHub ↗</a>
          {/* (lib/analytics.ts: only with its key) */}
          {ANALYTICS && <><br />Audience measured anonymously (PostHog, EU): no cookie across sites, no recordings, no wallet addresses. <NoStats /></>}
        </span>
      </footer>
    </Sheet>
  );
}

// the visitor's objection to the measurement: one click, kept in this browser (lib/analytics.ts)
// (the button goes as it is clicked: the keyboard's focus goes on to what it says, not to the page)
function NoStats() {
  const [off, setOff] = useState(optedOut);
  const said = useRef<HTMLSpanElement>(null);
  const stop = () => (optOut(), flushSync(() => setOff(true)), said.current?.focus());
  return off ? <span ref={said} tabIndex={-1} role="status">Your visits are not measured in this browser.</span> : <button className="linkish" onClick={stop}>Don&apos;t measure my visits</button>;
}
