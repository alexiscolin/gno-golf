// The course's slots as data/holes.txt has them, read once at build time
// (from web/, next build's working directory): the holes' and the cups'
// pages, the sitemap and the home page's links are made of them.
import fs from "node:fs";
import { CUPS } from "@/lib/site";

export const SLOTS = fs.readFileSync("../data/holes.txt", "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
/** The cups that have holes in the data, in order (the Crystal Mines once their lines are in). */
export const COURSE_CUPS = CUPS.filter((c) => SLOTS.some((s) => s.startsWith(c + "/")));
