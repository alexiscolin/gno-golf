"use client";
// The testnet's feedback sheet, answered as a PostHog API survey. No contact is
// asked: a reply goes through a GitHub issue (its link counted as any, by host).
import { useState } from "react";
import { Button, Segmented, Sheet } from "@/components/ui";
import { sound } from "@/lib/feel";
import { canFeedback, feedback, feedbackLocal } from "@/lib/analytics";
import { ISSUES } from "@/lib/site";

const HARD = ["Aiming", "The camera", "Controls on phone", "Saving on-chain / the wallet", "Finding my way in the menus", "Loading or speed", "Nothing"];
const FAMILIAR = [["New to it", "New to it"], ["A little", "A little"], ["Every day", "Every day"]] as const;
const RATES = [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]] as const;

export default function Feedback({ where, onClose }: { where: Record<string, string | number | boolean | null | undefined>; onClose: () => void }) {
  const [rating, setRating] = useState("");
  const [hard, setHard] = useState<string[]>([]);
  const [more, setMore] = useState("");
  const [familiar, setFamiliar] = useState("");
  const [sent, setSent] = useState<"" | "sending" | "sent" | "failed">("");
  const pick = (h: string) => setHard((a) => (a.includes(h) ? a.filter((x) => x !== h) : h === "Nothing" ? ["Nothing"] : [...a.filter((x) => x !== "Nothing"), h]));
  const send = () => {
    setSent("sending");
    void feedback({ rating: Number(rating), hard, more: more.trim(), familiar }, where).then((ok) => (ok && sound("select"), setSent(ok ? "sent" : "failed")));
  };
  return (
    <Sheet className="about feedback" label="Feedback" onClose={onClose}>
      <span className="eyebrow">Testnet feedback</span>
      {sent === "sent" ? (
        <>
          <h2>Thanks, it helps a lot!</h2>
          <p>{feedbackLocal() ? "Local: nothing sent (the answers are in the console)." : "Every answer is read. The gnomes are on it."}</p>
          <Button variant="primary" onClick={onClose}>Back to the game</Button>
        </>
      ) : sent === "failed" ? (
        <>
          <h2>It did not go through</h2>
          <p>Something on this page (a blocker, the network) kept it from leaving. Tell us on GitHub instead, it takes a minute.</p>
          <a className="btn btn--main" href={ISSUES} target="_blank" rel="noopener noreferrer">Open an issue ↗</a>
        </>
      ) : !canFeedback() ? (
        <>
          <h2>Tell us how it goes</h2>
          <p>This page sends nothing (visits not measured). Tell us on GitHub instead: what you liked, what broke, what to add.</p>
          <a className="btn btn--main" href={ISSUES} target="_blank" rel="noopener noreferrer">Open an issue ↗</a>
        </>
      ) : (
        <form className="feedback__form" onSubmit={(e) => (e.preventDefault(), rating && send())}>
          <h2>How is Gnogolf?</h2>
          <div className="feedback__q">
            <span className="aimset__label">How much are you enjoying Gnogolf?</span>
            <Segmented label="Your rating, 1 to 5" full value={rating} options={RATES} onChange={(v) => (sound("blip"), setRating(v))} />
            <span className="feedback__ends" aria-hidden="true"><span>Not at all</span><span>Love it</span></span>
          </div>
          <div className="feedback__q" role="group" aria-labelledby="fb-hard">
            <span className="aimset__label" id="fb-hard">What was hard or unclear?</span>
            <div className="feedback__picks">
              {HARD.map((h) => (
                <Button key={h} type="button" variant={hard.includes(h) ? "primary" : "secondary"} aria-pressed={hard.includes(h)} onClick={() => pick(h)}>{h}</Button>
              ))}
            </div>
          </div>
          <label className="feedback__q">
            <span className="aimset__label">Tell us more: what should we fix or add?</span>
            <textarea className="feedback__text" rows={3} maxLength={2000} value={more} onChange={(e) => setMore(e.target.value)} placeholder="Optional" />
          </label>
          <div className="feedback__q">
            <span className="aimset__label">How familiar are you with gno.land or crypto wallets?</span>
            <Segmented label="How familiar" full value={familiar} options={FAMILIAR} onChange={(v) => setFamiliar((x) => (x === v ? "" : v))} />
          </div>
          <Button variant="primary" type="submit" className="btn--wide" disabled={!rating || sent === "sending"}>{sent === "sending" ? "Sending…" : "Send"}</Button>
          <p className="real__fine">Anonymous. Want an answer, or to show a bug? <a href={ISSUES} target="_blank" rel="noopener noreferrer">Open an issue on GitHub ↗</a></p>
        </form>
      )}
    </Sheet>
  );
}
