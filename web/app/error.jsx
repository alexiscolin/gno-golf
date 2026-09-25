"use client";

// Next's error boundary: a render error anywhere shows this, not a blank page.
export default function Error({ error, reset }) {
  return (
    <div className="banner" role="alertdialog" aria-labelledby="crash-title">
      <div className="banner__in">
        <h2 id="crash-title">Something went wrong</h2>
        <p>The game hit an error in this browser. Your scores are safe; reloading usually fixes it.</p>
        <details className="details">
          <summary>Technical details</summary>
          <div className="details__box"><p className="mono">{String((error && error.message) || error)}</p></div>
        </details>
        <div className="banner__row">
          <button className="btn btn--ghost" onClick={() => reset()}>Try again</button>
          <button className="btn btn--main" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    </div>
  );
}
