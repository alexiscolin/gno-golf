// The Builder's mockups: one stand-in hole, drawn from above as the editor's
// board draws it (the lane's felt, its rails, the palette's pieces in their
// toon colours), for the editor, the test and the holes' cards alike.
(() => {
  // the hole, in board units (the editor's grid, 0.5 a cell); y down
  const LANE = [[4, 4], [30, 4], [30, 14], [42, 14], [42, 27], [22, 27], [22, 17], [4, 17]];
  const HOLE = {
    sand: { cx: 14, cy: 10.5, rx: 4.2, ry: 2.6 },
    water: [[34, 21], [39.5, 20.5], [40, 24.5], [35, 25]],
    hedge: { x: 19, y: 4, w: 1, h: 7.5 },
    gate: { x: 25.5, y: 4, w: 0.8, h: 10 }, // timed: on 3 substeps in 8
    slope: { x: 23.5, y: 18.5, w: 7, h: 7, dir: 0 },
    bumpers: [[27.5, 9], [33, 18], [29, 22.5]],
    tunnel: { from: [9, 14.5], to: [37.5, 16.5] },
    tee: [7.5, 8], cup: [38, 23],
  };
  const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(" ");

  /** The hole as an SVG: w×h units shown, select: a bumper's index, issue: the cup's error, small: a card's map (no grid, no labels). */
  function holeSVG({ w = 48, h = 31, select = -1, issue = false, small = false, ghost = false } = {}) {
    const grid = small ? "" : `<defs><pattern id="cell" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="rgba(20,65,52,.13)" stroke-width=".04"/></pattern>
      <pattern id="cell4" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="rgba(20,65,52,.28)" stroke-width=".06"/></pattern>
      <pattern id="hatch" width=".6" height=".6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V.6" stroke="#144134" stroke-width=".18"/></pattern></defs>
      <rect width="${w}" height="${h}" fill="url(#cell)"/><rect width="${w}" height="${h}" fill="url(#cell4)"/>`;
    const ticks = small ? "" : Array.from({ length: Math.floor(w / 4) }, (_, i) => `<text x="${i * 4 + .2}" y=".9" font-size=".7" font-weight="700" fill="rgba(253,246,233,.8)">${i * 4}</text>`).join("")
      + Array.from({ length: Math.floor(h / 4) }, (_, i) => i ? `<text x=".2" y="${i * 4 + .9}" font-size=".7" font-weight="700" fill="rgba(253,246,233,.8)">${i * 4}</text>` : "").join("");
    const s = HOLE, sw = small ? .5 : .16;
    const bumper = ([x, y], i) => `<g><circle cx="${x}" cy="${y}" r="1.2" fill="#e0524b" stroke="#144134" stroke-width="${sw}"/><circle cx="${x - .4}" cy="${y - .3}" r=".3" fill="#fdf6e9"/><circle cx="${x + .45}" cy="${y + .2}" r=".22" fill="#fdf6e9"/>
      ${i === select ? `<circle cx="${x}" cy="${y}" r="1.75" fill="none" stroke="#f2c14e" stroke-width=".22" stroke-dasharray=".5 .3"/><rect x="${x + 1.55}" y="${y - .2}" width=".45" height=".45" fill="#fdf6e9" stroke="#144134" stroke-width=".1"/><circle cx="${x}" cy="${y - 2.4}" r=".28" fill="#fdf6e9" stroke="#144134" stroke-width=".1"/><path d="M${x} ${y - 1.75}V${y - 2.1}" stroke="#144134" stroke-width=".08"/>` : ""}</g>`;
    return `<svg class="map" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The hole from above">
      ${grid}
      <polygon points="${pts(LANE)}" fill="#8fdcae" stroke="#c8874a" stroke-width="${small ? 1.1 : .8}" stroke-linejoin="round"/>
      <polygon points="${pts(LANE)}" fill="none" stroke="#144134" stroke-width="${small ? .35 : .12}" stroke-linejoin="round" transform=""/>
      <ellipse cx="${s.sand.cx}" cy="${s.sand.cy}" rx="${s.sand.rx}" ry="${s.sand.ry}" fill="#f0d9a0" stroke="#144134" stroke-width="${sw}"/>
      <polygon points="${pts(s.water)}" fill="#5fb3c9" stroke="#144134" stroke-width="${sw}" stroke-linejoin="round"/>
      <g opacity="${ghost ? .5 : 1}"><rect x="${s.slope.x}" y="${s.slope.y}" width="${s.slope.w}" height="${s.slope.h}" fill="rgba(63,154,114,.35)" stroke="#144134" stroke-width="${sw * .7}" stroke-dasharray="${small ? "" : ".4 .25"}"/>
      ${small ? "" : [0, 1, 2].map((k) => `<path d="M${s.slope.x + 1.4} ${s.slope.y + 1.6 + k * 2}h3.8m-1.1-.9 1.1.9-1.1.9" fill="none" stroke="#144134" stroke-width=".18" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</g>
      <rect x="${s.hedge.x}" y="${s.hedge.y}" width="${s.hedge.w}" height="${s.hedge.h}" rx=".4" fill="#2f6b53" stroke="#144134" stroke-width="${sw}"/>
      <rect x="${s.gate.x}" y="${s.gate.y}" width="${s.gate.w}" height="${s.gate.h}" fill="${small ? "#8a5a35" : "url(#hatch)"}" stroke="#144134" stroke-width="${sw}"/>
      ${small ? "" : `<rect x="${s.gate.x}" y="${s.gate.y}" width="${s.gate.w}" height="${s.gate.h}" fill="#8a5a35" opacity=".55"/><text x="${s.gate.x + 1.1}" y="${s.gate.y + 9.6}" font-size=".75" font-weight="700" fill="#144134">↻ 3 in 8</text>`}
      ${s.bumpers.map(bumper).join("")}
      <g><circle cx="${s.tunnel.from[0]}" cy="${s.tunnel.from[1]}" r="1.4" fill="#4b3a2a" stroke="#144134" stroke-width="${sw}"/><circle cx="${s.tunnel.from[0]}" cy="${s.tunnel.from[1]}" r=".8" fill="#1d1712"/>
      ${small ? "" : `<path d="M${s.tunnel.from[0] + 1.4} ${s.tunnel.from[1] + .4} C 20 31, 33 24, ${s.tunnel.to[0]} ${s.tunnel.to[1] + 1}" fill="none" stroke="#fdf6e9" stroke-width=".18" stroke-dasharray=".5 .35"/><circle cx="${s.tunnel.to[0]}" cy="${s.tunnel.to[1]}" r=".9" fill="none" stroke="#fdf6e9" stroke-width=".2" stroke-dasharray=".3 .2"/>`}</g>
      <g><circle cx="${s.tee[0]}" cy="${s.tee[1]}" r="1" fill="#fff" stroke="#144134" stroke-width="${sw}"/>${small ? "" : `<text x="${s.tee[0]}" y="${s.tee[1] + .32}" font-size=".9" font-weight="800" text-anchor="middle" fill="#144134">T</text>`}</g>
      <g><circle cx="${s.cup[0]}" cy="${s.cup[1]}" r="1.2" fill="#1d1712" stroke="#144134" stroke-width="${sw}"/><path d="M${s.cup[0]} ${s.cup[1]}V${s.cup[1] - 3.2}" stroke="#144134" stroke-width="${small ? .35 : .14}"/><path d="M${s.cup[0]} ${s.cup[1] - 3.2}l2 .7-2 .7z" fill="#e0524b" stroke="#144134" stroke-width="${small ? .2 : .08}"/>
      ${issue ? `<circle cx="${s.cup[0]}" cy="${s.cup[1]}" r="2.3" fill="none" stroke="#e0524b" stroke-width=".25"/><circle cx="${s.cup[0] + 2}" cy="${s.cup[1] - 1.8}" r=".7" fill="#e0524b" stroke="#144134" stroke-width=".1"/><text x="${s.cup[0] + 2}" y="${s.cup[1] - 1.55}" font-size=".9" font-weight="800" text-anchor="middle" fill="#fdf6e9">!</text>` : ""}</g>
      ${ticks}
    </svg>`;
  }

  // the palette's pieces, drawn small as the board draws them
  const PIECE = {
    rail: '<svg viewBox="0 0 40 30"><path d="M4 22 L36 8" stroke="#c8874a" stroke-width="6" stroke-linecap="round"/><path d="M4 22 L36 8" stroke="#144134" stroke-width="1.5" stroke-linecap="round" opacity=".7"/></svg>',
    hedge: '<svg viewBox="0 0 40 30"><rect x="4" y="11" width="32" height="8" rx="4" fill="#2f6b53" stroke="#144134" stroke-width="2"/></svg>',
    logs: '<svg viewBox="0 0 40 30"><rect x="5" y="10" width="30" height="10" rx="5" fill="#8a5a35" stroke="#144134" stroke-width="2"/><circle cx="31" cy="15" r="3" fill="#e3a877" stroke="#144134" stroke-width="1.5"/></svg>',
    bumper: '<svg viewBox="0 0 40 30"><circle cx="20" cy="15" r="10" fill="#e0524b" stroke="#144134" stroke-width="2"/><circle cx="16" cy="12" r="2.5" fill="#fdf6e9"/><circle cx="24" cy="17" r="2" fill="#fdf6e9"/></svg>',
    sunflower: '<svg viewBox="0 0 40 30"><circle cx="20" cy="15" r="10" fill="#f5b83d" stroke="#144134" stroke-width="2"/><circle cx="20" cy="15" r="4.5" fill="#8a5a35" stroke="#144134" stroke-width="1.5"/></svg>',
    stump: '<svg viewBox="0 0 40 30"><circle cx="20" cy="15" r="9" fill="#8a5a35" stroke="#144134" stroke-width="2"/><circle cx="20" cy="15" r="5" fill="none" stroke="#e3a877" stroke-width="1.5"/></svg>',
    sand: '<svg viewBox="0 0 40 30"><ellipse cx="20" cy="15" rx="16" ry="10" fill="#f0d9a0" stroke="#144134" stroke-width="2"/></svg>',
    water: '<svg viewBox="0 0 40 30"><path d="M5 9 L33 6 L36 22 L8 24 Z" fill="#5fb3c9" stroke="#144134" stroke-width="2" stroke-linejoin="round"/><path d="M12 15q3-2 6 0t6 0" fill="none" stroke="#fdf6e9" stroke-width="1.5"/></svg>',
    ice: '<svg viewBox="0 0 40 30"><rect x="5" y="6" width="30" height="18" rx="3" fill="#cfeaf5" stroke="#144134" stroke-width="2"/><path d="M11 20l6-9M19 21l8-11" stroke="#fff" stroke-width="2"/></svg>',
    flowerbed: '<svg viewBox="0 0 40 30"><rect x="5" y="7" width="30" height="16" rx="5" fill="#8a5a35" stroke="#144134" stroke-width="2"/><circle cx="13" cy="15" r="2.5" fill="#e98fb0"/><circle cx="21" cy="12" r="2.5" fill="#f5b83d"/><circle cx="28" cy="17" r="2.5" fill="#fdf6e9"/></svg>',
    slope: '<svg viewBox="0 0 40 30"><rect x="4" y="5" width="32" height="20" fill="rgba(63,154,114,.4)" stroke="#144134" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M11 15h16m-4-4 4 4-4 4" fill="none" stroke="#144134" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tunnel: '<svg viewBox="0 0 40 30"><circle cx="12" cy="17" r="7" fill="#4b3a2a" stroke="#144134" stroke-width="2"/><circle cx="12" cy="17" r="3.5" fill="#1d1712"/><path d="M19 13 C 26 4, 32 8, 34 14" fill="none" stroke="#144134" stroke-width="1.6" stroke-dasharray="2.5 2"/></svg>',
    gate: '<svg viewBox="0 0 40 30"><rect x="16" y="3" width="8" height="24" fill="#8a5a35" stroke="#144134" stroke-width="2"/><path d="M6 15a14 14 0 0 1 4-8m24 8a14 14 0 0 1-4 8" fill="none" stroke="#144134" stroke-width="1.8" stroke-linecap="round"/></svg>',
    seesaw: '<svg viewBox="0 0 40 30"><rect x="4" y="10" width="32" height="10" fill="rgba(63,154,114,.4)" stroke="#144134" stroke-width="1.5"/><path d="M8 15h10m14 0H22" stroke="#144134" stroke-width="2" stroke-linecap="round"/><path d="M15 12l3 3-3 3M25 12l-3 3 3 3" fill="none" stroke="#144134" stroke-width="1.8"/></svg>',
    molehill: '<svg viewBox="0 0 40 30"><path d="M6 23 Q20 0 34 23Z" fill="#8a5a35" stroke="#144134" stroke-width="2"/></svg>',
    tee: '<svg viewBox="0 0 40 30"><circle cx="20" cy="15" r="9" fill="#fff" stroke="#144134" stroke-width="2"/><text x="20" y="19.5" font-size="12" font-weight="800" text-anchor="middle" fill="#144134">T</text></svg>',
    cup: '<svg viewBox="0 0 40 30"><circle cx="16" cy="20" r="6" fill="#1d1712" stroke="#144134" stroke-width="2"/><path d="M16 20V4l10 3.5L16 11" fill="#e0524b" stroke="#144134" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };

  window.Builder = { holeSVG, PIECE };
})();
