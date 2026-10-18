// A series as the realm takes it (r/gnogolf/gnomes AddSeries): one row a
// gnome, "id|tier|name|traits", in id order, lines joined by "\n". Checked
// here before it is sent: the realm keeps a row's tier and its traits' tier
// byte apart, and nothing on chain checks that they agree.
import { utf8Bytes as bytes } from "../chain";
import { decode } from "./codec";
import type { Catalogue } from "./catalogue";

/** What the realm accepts in a row's name and traits (catalogue.gno maxGnomeName, maxTraits; rows.gno plainName,
 *  printable, the same cases held by both: rowcases_test.gno): a name 1 to 48 bytes of letters (a-z, A-Z, the
 *  accented Latin ones of Latin-1 and Latin Extended-A), digits, spaces and - ' . alone; traits 1 to 256 bytes of
 *  printable ASCII (a "|" in them makes the row's fields more than four: refused as a row). */
const MAX_NAME = 48, MAX_TRAITS = 256;
const NAME = /^[A-Za-z0-9 '.\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u017f-]+$/u, PRINTABLE = /^[\x20-\x7e]+$/;
/** A name as the realm's plainName takes it. */
export const plainName = (s: string) => NAME.test(s) && bytes(s) <= MAX_NAME;
/** Traits as the realm's printable takes them. */
export const printable = (s: string) => PRINTABLE.test(s) && s.length <= MAX_TRAITS;

/** A series' rows, in id order. */
export function rowsOf(c: Catalogue, series: string): string {
  return c.gnomes.filter((g) => g.series === series).map((g) => `${g.id}|${g.tier}|${g.name}|${g.traits}`).join("\n");
}

/** What is wrong with a series' rows: ids not following on from first, a
 *  field the realm refuses, a tier other than its traits'. Empty: none. */
export function checkRows(rows: string, first: number): string[] {
  const errors: string[] = [];
  rows.split("\n").forEach((row, i) => {
    const f = row.split("|"), at = `row ${i + 1}`;
    if (f.length !== 4) return void errors.push(`${at}: not id|tier|name|traits`);
    const [id, tier, name, traits] = f;
    if (id !== String(first + i)) errors.push(`${at}: id ${id}, not ${first + i}`);
    if (!plainName(name)) errors.push(`${at}: name "${name}": 1 to 48 bytes of letters, digits, spaces and - ' .`);
    if (!printable(traits)) errors.push(`${at}: traits too long or not printable ASCII`);
    const t = decode(traits);
    if (!t) errors.push(`${at}: traits do not decode`);
    else if (t.tier !== tier) errors.push(`${at}: tier ${tier}, its traits say ${t.tier}`);
  });
  return errors;
}
