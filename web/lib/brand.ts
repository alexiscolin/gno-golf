// The game's name on what leaves the page (ADR-003): the shared picture and
// the shot clip carry the badge, the name and the site's address on a card at
// the bottom, and the clip ends on a card of its own that asks for a go. Drawn
// on a 2D canvas in the page's own colours and font (Fredoka, once loaded).
import { siteHost } from "./site";

const INK = "#144134", INK_SOFT = "#4f7a6c", GREEN = "#226c57", PAPER = "#fdf6e9", HAT = "#e0524b";
const FONT = "Fredoka, ui-rounded, system-ui, sans-serif";

/** What the card says of the hole, as its link card does: its cup, number and
 *  par over its name, and the score; term, the clip's word for it (Birdie!). */
export interface Caption {
  eyebrow: string;
  title: string;
  score: string;
  term?: string;
  /** the clip's closing ask, when not the hole and the score (a duel: the ghost to race) */
  challenge?: string;
}

// the badge (app/icon.svg, the favicon; its PNG, apple-icon.png, where a
// browser won't draw the SVG): fetched once, drawn when it is in; relative,
// as the game's other files, for a site served under a path
let badge: Promise<HTMLImageElement | null> | null = null;
let drawn: HTMLImageElement | null = null;
const fetchImg = (src: string) => {
  const img = Object.assign(new Image(), { src });
  return img.decode().then(() => (img.naturalWidth ? img : null), () => null);
};
/** The badge, loaded (null if it can't be: the cards go without it). */
export function loadBadge(): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return (badge ||= fetchImg("icon.svg").then((img) => img || fetchImg("apple-icon.png")).then((img) => (drawn = img)));
}
const ready = () => drawn;

/**
 * The card at the bottom: the badge, "Gnogolf" and the site's address on the
 * left; on the right the hole as its link card has it (cup, number and par
 * over its name) and the score. k scales it (the clip's is smaller than the
 * picture's).
 */
export function drawCard(x: CanvasRenderingContext2D, W: number, H: number, { eyebrow, title, score }: Caption, k = 1) {
  const w = W / k, logo = ready();
  x.save();
  x.translate(0, H);
  x.scale(k, k);
  x.fillStyle = PAPER;
  x.strokeStyle = INK;
  x.lineWidth = 5;
  x.beginPath();
  x.roundRect(32, -140, w - 64, 108, 22);
  x.fill();
  x.stroke();
  const left = logo ? 146 : 64;
  if (logo) x.drawImage(logo, 54, -130, 88, 88);
  x.fillStyle = INK;
  x.font = `700 44px ${FONT}`;
  x.fillText("Gnogolf", left, -84);
  x.font = `600 26px ${FONT}`;
  x.fillStyle = HAT;
  x.fillText(siteHost(), left, -50);
  x.textAlign = "right";
  x.fillStyle = INK_SOFT;
  x.font = `700 22px ${FONT}`;
  x.fillText(eyebrow.toUpperCase(), w - 64, -96);
  x.fillStyle = HAT;
  x.font = `700 38px ${FONT}`;
  x.fillText(score, w - 64, -52);
  const room = x.measureText(score).width + 24;
  x.fillStyle = INK;
  x.fillText(title, w - 64 - room, -52);
  x.restore();
}

/** A word shouted over the picture, as the win card's title: filled, inked
 *  round, and a paper halo so it reads on any ground. Centred at (0, 0). */
function shout(x: CanvasRenderingContext2D, text: string, px: number, fill: string) {
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `700 ${px}px ${FONT}`;
  x.lineJoin = "round";
  x.lineWidth = px * 0.17;
  x.strokeStyle = PAPER;
  x.strokeText(text, 0, 0);
  x.lineWidth = px * 0.08;
  x.strokeStyle = INK;
  x.strokeText(text, 0, 0);
  x.fillStyle = fill;
  x.fillText(text, 0, 0);
}

/** A pill, centred at (cx, cy), as the game's buttons: ink edge, a hard shadow under it. */
function pill(x: CanvasRenderingContext2D, cx: number, cy: number, parts: readonly [string, string][], px: number, bg: string) {
  x.font = `700 ${px}px ${FONT}`;
  const widths = parts.map(([t]) => x.measureText(t).width), w = widths.reduce((a, b) => a + b, 0) + px * 1.6, h = px * 1.9;
  x.fillStyle = INK;
  x.beginPath();
  x.roundRect(cx - w / 2, cy - h / 2 + px * 0.22, w, h, h / 2);
  x.fill();
  x.fillStyle = bg;
  x.strokeStyle = INK;
  x.lineWidth = px * 0.12;
  x.beginPath();
  x.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  x.fill();
  x.stroke();
  x.textAlign = "left";
  x.textBaseline = "middle";
  let at = cx - w / 2 + px * 0.8;
  parts.forEach(([t, c], i) => {
    x.fillStyle = c;
    x.fillText(t, at, cy + px * 0.04);
    at += widths[i];
  });
}

/**
 * The result, large over the course once the ball is in ("Triple bogey!"), as
 * the card's own title. t (0..1) pops it in.
 */
export function drawTerm(x: CanvasRenderingContext2D, W: number, H: number, term: string, t: number) {
  const p = Math.max(0, Math.min(1, t)), s = H / 720;
  // an ease out that overshoots a little, then settles
  const k = 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
  x.save();
  x.globalAlpha = p;
  x.translate(W / 2, H * 0.42);
  x.scale(k, k);
  x.rotate(-0.04);
  shout(x, term, Math.min(190, ((W * 0.85) / Math.max(term.length, 5)) * 1.9) * s, HAT);
  x.restore();
}

/**
 * The clip's last card, faded in by a (0..1), as the site's link card: the
 * course's last moment blurred under the sky's light and its dots, an inked
 * frame, the badge, the dare, the shot to beat, and where to play.
 */
export function drawOutro(x: CanvasRenderingContext2D, W: number, H: number, a: number, still: CanvasImageSource | null, challenge: string) {
  const logo = ready(), s = H / 720, p = Math.max(0, Math.min(1, a));
  x.save();
  x.globalAlpha = p;
  if (still) {
    x.filter = `blur(${14 * s}px)`;
    x.drawImage(still, -30 * s, -30 * s, W + 60 * s, H + 60 * s);
    x.filter = "none";
  }
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "rgba(120, 190, 235, .55)");
  sky.addColorStop(0.55, "rgba(253, 246, 233, .5)");
  sky.addColorStop(1, "rgba(240, 190, 120, .45)");
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);
  x.fillStyle = "rgba(255, 255, 255, .35)";
  for (let yy = 12 * s; yy < H; yy += 22 * s) for (let xx = 12 * s; xx < W; xx += 22 * s) x.fillRect(xx, yy, 2.5 * s, 2.5 * s);
  x.strokeStyle = INK;
  x.lineWidth = 3 * s;
  x.beginPath();
  x.roundRect(24 * s, 24 * s, W - 48 * s, H - 48 * s, 18 * s);
  x.stroke();
  // pops in a little behind the fade
  const k = 0.9 + 0.1 * Math.min(1, p * 1.4);
  x.translate(W / 2, H / 2);
  x.scale(k, k);
  x.translate(-W / 2, -H / 2);
  if (logo) {
    x.fillStyle = "rgba(253, 246, 233, .9)";
    x.beginPath();
    x.arc(W / 2, 175 * s, 118 * s, 0, Math.PI * 2);
    x.fill();
    x.drawImage(logo, W / 2 - 105 * s, 70 * s, 210 * s, 210 * s);
  }
  x.save();
  x.translate(W / 2, 360 * s);
  x.rotate(-0.03);
  shout(x, "Can you beat it?", 92 * s, GREEN); // green, as the logo's letters
  x.restore();
  pill(x, W / 2, 478 * s, [[challenge.toUpperCase(), PAPER]], 36 * s, GREEN);
  pill(x, W / 2, 585 * s, [["Play free at ", INK], [siteHost(), HAT]], 44 * s, PAPER);
  x.fillStyle = INK;
  x.textAlign = "center";
  x.font = `600 ${27 * s}px ${FONT}`;
  x.fillText("Every shot computed by the chain on gno.land", W / 2, 668 * s);
  x.restore();
}
