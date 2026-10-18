// A published hole shared from the Builder: as the game shares
// (components/Share.tsx), its link the game's own (components/common.ts
// holeLink: a community hole by its id), and its card is the 3D preview
// with its name, world, par and author over it, and the author's own score
// to beat (proof.ts builderScore).
import { holeLink, strokesWord } from "@/components/common";
import { MAX_TITLE } from "@/lib/builder/draft";
import { holeByline } from "@/lib/builder/holes";

/** A file saved through a link the author clicked (a computer's download). */
export function saveFile(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The author's score as a dare: "Beat the builder: 2 strokes" ("" with none). */
export const beatLine = (strokes: number) => (strokes ? `Beat the builder: ${strokesWord(strokes)}` : "");

/** What the game's Share (components/Share.tsx) sends for a published hole: its words (a dare, with the author's score), and its link (Share puts it on the site's address). */
export const holeShare = (name: string, id: string, strokes = 0) => ({ text: `${name}, a mini-golf hole on gno.land${strokes ? `. ${beatLine(strokes)}` : ""}`, link: holeLink({ id, place: 0 }, "", "", "hole") });

/** The card's three lines: the name (cut at 40 with an ellipsis), its byline (holeByline), and the author's score to beat (else where it was built). */
export function cardLines({ name, world, par, author, strokes = 0 }: { name: string; world: string; par: number; author: string; strokes?: number }): [string, string, string] {
  const n = [...name];
  return [n.length > MAX_TITLE ? `${n.slice(0, MAX_TITLE - 1).join("")}…` : name, holeByline({ author, world, par }), strokes ? `${beatLine(strokes)} · on gno.land` : "Built on gno.land"];
}

/** The card: the preview's picture (a canvas just drawn) with a paper strip of cardLines under it, as a PNG. */
export function shareCard(from: HTMLCanvasElement, lines: [string, string, string]): Promise<Blob | null> {
  const W = 1200, pic = Math.round((W * from.height) / Math.max(1, from.width)), strip = 180;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = pic + strip;
  const x = c.getContext("2d");
  if (!x) return Promise.resolve(null);
  x.drawImage(from, 0, 0, W, pic);
  x.fillStyle = "#fdf6e9";
  x.fillRect(0, pic, W, strip);
  x.fillStyle = "#144134";
  x.font = "700 56px Fredoka, ui-rounded, system-ui, sans-serif";
  x.fillText(lines[0], 48, pic + 72);
  x.font = "600 32px Fredoka, ui-rounded, system-ui, sans-serif";
  x.fillText(lines[1], 48, pic + 120);
  x.fillStyle = "#226c57";
  x.fillText(lines[2], 48, pic + 160);
  return new Promise((r) => c.toBlob(r, "image/png"));
}
