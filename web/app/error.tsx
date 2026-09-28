"use client";

// Next's error boundary: a render error anywhere shows this, not a blank page.
import { Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="banner" role="alertdialog" aria-labelledby="crash-title">
      <div className="banner__in">
        <h2 id="crash-title">Something went wrong</h2>
        <p>The game hit an error in this browser. Your scores are safe; reloading usually fixes it.</p>
        <details className="details">
          <summary>Technical details</summary>
          <div className="details__box"><p className="mono">{(error && error.message) || String(error)}</p></div>
        </details>
        {/* one way out; the other (the page kept, drawn again) a small word under it */}
        <div className="banner__row">
          <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
        </div>
        <button className="linkish crash__retry" onClick={() => reset()}>or try again without reloading</button>
      </div>
    </div>
  );
}
