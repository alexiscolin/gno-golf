// The shot clip (ADR-003), the part a browser is not needed for: the format
// it is recorded in, the stretch of the holing stroke it shows, the sky
// behind it and its file's name. The recording is engine/clip.ts.

/** The MP4s a clip may be recorded as, best first: MP4 is the one video X takes. */
const MP4 = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4"];

/** The first MP4 this browser records (supported: MediaRecorder.isTypeSupported),
 *  or "": no clip is offered then, the image and the link are. */
export function clipMime(supported: (type: string) => boolean) {
  return MP4.find((t) => { try { return supported(t); } catch { return false; } }) || "";
}

/** How long a clip holds on each part, in ms: the gnome still before the
 *  release, the moment after the drop (the confetti), the whole at most. */
export const CLIP = { lead: 700, tail: 1500, max: 8000 };

/**
 * The stretch of the holing stroke a clip shows, from each path step's time
 * on screen (ms): from the release (from 0, after the lead) when the stroke,
 * the lead and the tail fit in max; else its last steps that do, with no
 * lead (a long putt opens mid-roll). length: the clip's expected ms.
 */
export function clipWindow(ms: readonly number[], { lead, tail, max } = CLIP) {
  const all = ms.reduce((a, b) => a + b, 0);
  if (lead + all + tail <= max) return { from: 0, lead, length: lead + all + tail };
  let from = ms.length - 1, run = ms[from] || 0;
  while (from > 0 && run + ms[from - 1] + tail <= max) run += ms[--from];
  return { from: Math.max(from, 0), lead: 0, length: run + tail };
}

/** The sky's colour stops (offset 0..1, colour) from its CSS background
 *  (getComputedStyle: "linear-gradient(178deg, rgb(…) 0%, …)"): the page's
 *  sky is CSS, the clip paints it behind the course. The day's when unreadable. */
export function skyStops(css: string): [number, string][] {
  const stops = [...css.matchAll(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(-?[\d.]+)%/gi)].map((m): [number, string] => [Math.min(1, Math.max(0, Number(m[2]) / 100)), m[1]]);
  return stops.length ? stops : [[0, "#fdebcf"], [1, "#bfd9cc"]];
}

/** The clip's file name, after its hole: gnogolf-garden-3.mp4 for a course
 *  hole (whatever its version), gnogolf-<slug>.mp4 for a community one. */
export function clipName(id: string) {
  const parts = id.replace(/\/v\d+$/, "").split("/");
  const last = parts[parts.length - 1] || "";
  const name = (/^\d+$/.test(last) ? parts.slice(-2).join("-") : last).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `gnogolf${name ? "-" + name : ""}.mp4`;
}
