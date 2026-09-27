// The game's name on what leaves the page (ADR-003): the shared picture and
// the shot clip carry the badge, the name and the site's address on a card at
// the bottom, and the clip ends on a card of its own that asks for a go. Drawn
// on a 2D canvas in the page's own colours and font (Fredoka, once loaded).
import { siteHost } from "./site";

const INK = "#144134", INK_SOFT = "#4f7a6c", PAPER = "#fdf6e9", HAT = "#e0524b";
const FONT = "Fredoka, ui-rounded, system-ui, sans-serif";

/** What the card says of the hole, as its link card does: its cup, number and
 *  par over its name, and the score; term, the clip's word for it (Birdie!). */
export interface Caption {
  eyebrow: string;
  title: string;
  score: string;
  term?: string;
}

// the badge (app/icon.svg, the favicon): fetched once, drawn when it is in;
// relative, as the game's other files, for a site served under a path
let badge: HTMLImageElement | null = null;
/** The badge, loaded (null if it can't be: the cards go without it). */
export function loadBadge(): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  const img = (badge ||= Object.assign(new Image(), { src: "icon.svg" }));
  return img.decode().then(() => img, () => null);
}
const ready = () => (badge && badge.complete && badge.naturalWidth ? badge : null);

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

/**
 * The result, large over the course once the ball is in ("Triple bogey!"), as
 * the card's own title: the hat's red, inked round. t (0..1) pops it in.
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
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `700 ${Math.min(140, (W * 0.85) / Math.max(term.length, 6) * 1.9) * s}px ${FONT}`;
  x.lineJoin = "round";
  x.lineWidth = 22 * s;
  x.strokeStyle = PAPER;
  x.strokeText(term, 0, 0);
  x.lineWidth = 10 * s;
  x.strokeStyle = INK;
  x.strokeText(term, 0, 0);
  x.fillStyle = HAT;
  x.fillText(term, 0, 0);
  x.restore();
}

/**
 * The clip's last card, faded in by a (0..1): the badge large, a dare, the
 * site's address, and what the game is, on the page's paper.
 */
export function drawOutro(x: CanvasRenderingContext2D, W: number, H: number, a: number) {
  const logo = ready(), s = H / 720;
  x.save();
  x.globalAlpha = Math.max(0, Math.min(1, a));
  x.fillStyle = PAPER;
  x.fillRect(0, 0, W, H);
  x.textAlign = "center";
  if (logo) x.drawImage(logo, W / 2 - 110 * s, 90 * s, 220 * s, 220 * s);
  x.fillStyle = INK;
  x.font = `700 ${76 * s}px ${FONT}`;
  x.fillText("Can you beat it?", W / 2, 400 * s);
  x.fillStyle = HAT;
  x.font = `700 ${58 * s}px ${FONT}`;
  x.fillText(siteHost(), W / 2, 490 * s);
  x.fillStyle = INK;
  x.font = `500 ${30 * s}px ${FONT}`;
  x.fillText("Play free in your browser · every shot computed on gno.land", W / 2, 560 * s);
  x.restore();
}
