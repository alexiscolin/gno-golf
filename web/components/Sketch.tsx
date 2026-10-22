// The Builder's sketch, drawn in its own module: the game's choice's Builder panel (Modes.tsx) and the
// community's band under the cups (Worlds.tsx) both show it.

/** The Builder's sketch: a blueprint, its lane, flag and pencil. */
export const Sketch = () => (
  <svg className="mode__sketch" viewBox="0 0 120 96" aria-hidden="true">
    <g transform="rotate(-6 60 56)">
      <rect x="12" y="26" width="96" height="64" rx="5" className="mode__sketch-sheet" />
      <path d="M12 42h96M12 58h96M12 74h96M28 26v64M44 26v64M60 26v64M76 26v64M92 26v64" className="mode__sketch-grid" />
      <path d="M26 78Q34 50 60 56T92 40" className="mode__sketch-lane" />
      <circle cx="26" cy="78" r="4.5" className="mode__sketch-ball" />
      <path d="M92 42V6" className="mode__sketch-pole" />
      <path d="M92 6l16 6-16 6z" className="mode__sketch-flag" />
      <rect x="12" y="26" width="96" height="64" rx="5" className="mode__sketch-ink" />
    </g>
    <path d="M2 70l20-26 7 5-20 26-9 4z" className="mode__sketch-pencil" />
  </svg>
);
