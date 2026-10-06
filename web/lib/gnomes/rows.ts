// A series as the realm takes it (r/gnogolf/gnomes AddSeries): one row a
// gnome, "id|tier|name|traits", in id order, lines joined by "\n". Checked
// here before it is sent: the realm keeps a row's tier and its traits' tier
// byte apart, and nothing on chain checks that they agree.
import { decode } from "./codec";
import type { Catalogue } from "./catalogue";

/** What the realm accepts in a row's name and traits (catalogue.gno maxGnomeName, maxTraits). */
const MAX_NAME = 48, MAX_TRAITS = 256;

/** A series' rows, in id order. */
export function rowsOf(c: Catalogue, series: string): string {
  return c.gnomes.filter((g) => g.series === series).map((g) => `${g.id}|${g.tier}|${g.name}|${g.traits}`).join("\n");
}

/** What is wrong with a series' rows: ids not following on from first, a
 *  field the realm refuses, a tier other than its traits'. Empty: none. */
export function checkRows(rows: string, first: number): string[] {
  const errors: string[] = [];
  const plain = (s: string, max: number) => s.length >= 1 && s.length <= max && !/[\x00-\x1f\x7f|]/.test(s);
  rows.split("\n").forEach((row, i) => {
    const f = row.split("|"), at = `row ${i + 1}`;
    if (f.length !== 4) return void errors.push(`${at}: not id|tier|name|traits`);
    const [id, tier, name, traits] = f;
    if (id !== String(first + i)) errors.push(`${at}: id ${id}, not ${first + i}`);
    if (!plain(name, MAX_NAME)) errors.push(`${at}: name "${name}"`);
    if (!plain(traits, MAX_TRAITS)) errors.push(`${at}: traits too long or not printable`);
    const t = decode(traits);
    if (!t) errors.push(`${at}: traits do not decode`);
    else if (t.tier !== tier) errors.push(`${at}: tier ${tier}, its traits say ${t.tier}`);
  });
  return errors;
}
