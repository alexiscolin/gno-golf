// @ts-check
// The trailers' titles (media/promo/render.mjs, media/builder/promo.mjs): the logo as the title
// screen draws it, and a title's markup from its shot entry (big, pill, cta, logo or raw). Their
// look is web/lib/promo.ts's (#promo .big, .sub, .cta, .logo).
const burst = (n, r0, r1, cx = 100, cy = 100) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r1 : r0; // a dip at the top: the hat's tip stands clear, no ray behind it
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
// the title screen's own logo (components/Title.tsx), with its classes (app/globals.css): keep the two alike
export const LOGO = (w = 900) => `<svg class="logo" style="width:${w}px" viewBox="0 0 600 505">
<defs>
<path id="arc" d="M 70 330 A 230 230 0 0 1 530 330" />
<linearGradient id="title-word" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#5fe0a8" />
<stop offset=".55" stop-color="#2a9d74" />
<stop offset="1" stop-color="#1c7a5a" />
</linearGradient>
<polygon id="badge" points="${burst(18, 86, 104)}" />
<g id="gnome">
<rect id="gnome-face" x="40" y="100" width="120" height="44" rx="6" />
<path id="gnome-beard" d="M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z" />
<path id="gnome-hat" d="M 28 95 Q 40 91 48.7 76 L 96.5 7 Q 100 -1.5 103.5 7 L 151.3 76 Q 160 91 172 95 Z" />
<rect id="gnome-brim" x="26" y="90" width="148" height="20" rx="10" />
</g>
<clipPath id="clip-hat"><use href="#gnome-hat" /></clipPath>
<clipPath id="clip-brim"><use href="#gnome-brim" /></clipPath>
<clipPath id="clip-face"><use href="#gnome-face" /></clipPath>
<clipPath id="clip-ball"><circle cx="300" cy="462" r="17" /></clipPath>
<clipPath id="clip-beard"><use href="#gnome-beard" /></clipPath>
  <g id="iron">
    <rect x="293" y="118" width="14" height="360" rx="7" class="title__shaft" />
    <rect x="289" y="118" width="22" height="62" rx="9" class="title__grip" />
    <path d="M 293 460 L 307 460 L 311 477 L 348 466 Q 362 462 362 474 L 361 489 Q 359 499 348 499 L 299 500 Q 290 500 291 491 Z" class="title__head" />
    <rect x="316" y="480" width="34" height="2.6" rx="1.3" class="title__grip" />
    <rect x="314" y="486" width="38" height="2.6" rx="1.3" class="title__grip" />
    <rect x="312" y="492" width="40" height="2.6" rx="1.3" class="title__grip" />
  </g>
</defs>
<text class="title__word">
<textPath href="#arc" startOffset="50%" text-anchor="middle">GNOGOLF</textPath>
</text>
<g class="title__clubs">
  <use href="#iron" transform="rotate(-44 300 330)" />
  <use href="#iron" transform="rotate(44 300 330) translate(600 0) scale(-1 1)" />
</g>
<g transform="translate(0 5)">
<path d="M 288 476 Q 300 483 312 476 L 305 483 L 302 496 Q 300 500 298 496 L 295 483 Z" class="title__hat title__inked" />
<circle cx="300" cy="462" r="17" class="title__beard title__inked" />
<path d="M 305 441 A 21 21 0 0 1 305 483 A 13 21 0 0 0 305 441 Z" clip-path="url(#clip-ball)" class="title__beardshade" />
<circle cx="292" cy="457" r="2.2" class="title__beardshade" />
<circle cx="301" cy="453" r="2.2" class="title__beardshade" />
<circle cx="296" cy="465" r="2.2" class="title__beardshade" />
</g>
<g transform="translate(300 298) scale(1.25) translate(-100 -110)">
<use href="#badge" y="8" class="title__outline" />
<use href="#badge" class="title__outline" />
<use href="#badge" class="title__burst" />
<circle cx="100" cy="100" r="78" class="title__disc" />
<use href="#gnome" y="8" class="title__outline" />
<use href="#gnome" class="title__outline" />
<use href="#gnome-face" class="title__face" />
<path d="M 20 90 H 180 V 119 C 150 119 120 117 100 116 C 70 115 45 113 20 113 Z" clip-path="url(#clip-face)" class="title__faceshade" />
<use href="#gnome-beard" class="title__beard" />
<path d="M 20 100 H 180 V 230 H 100 Q 136 192 129 162 Q 124 150 106 151 C 82 153 60 150 40 136 L 20 128 Z" clip-path="url(#clip-beard)" class="title__beardshade" />
<use href="#gnome-hat" class="title__hat" />
<path d="M 100 -8 C 118.4 35.5 125.3 68.1 127 100 L 127 120 L 200 120 L 200 -8 Z" clip-path="url(#clip-hat)" class="title__shade" />
<path d="M 101 -5 L 200 -5 L 200 120 L 172 120 L 163 90 Q 149.2 88 146 80 C 135.2 53.3 120.8 28.7 103 6 Z" clip-path="url(#clip-hat)" class="title__hatink" />
<use href="#gnome-brim" class="title__shade" />
<path d="M 126 85 L 126 90 A 16 10 0 0 0 126 110 L 126 115 L 200 115 L 200 85 Z" clip-path="url(#clip-brim)" class="title__hatink" />
<path d="M 86 30 L 64 62" class="title__glint" />
<circle cx="80" cy="120" r="7" class="title__ink" />
<circle cx="120" cy="120" r="7" class="title__ink" />
<circle cx="100" cy="134" r="9" class="title__nose" />
</g>
</svg>`;
const big = (html, size) => `<div class="big"${size ? ` style="font-size:${size}px"` : ""}>${html}</div>`;
export const title = (t) => t.raw ? t.raw : t.logo ? LOGO(t.logo) : t.pill ? `<div class="sub"${t.size ? ` style="font-size:${t.size}px"` : ""}>${t.pill}</div>` : t.cta ? `<div class="cta"${t.size ? ` style="font-size:${t.size}px"` : ""}>${t.cta}</div>` : big(t.big, t.size);
