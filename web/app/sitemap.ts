import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { generateStaticParams } from "./h/[slot]/page";
import { PAGES } from "./g/pages";

export const dynamic = "force-static";

// the home page, every hole's and cup's own page, and the shop's when it is on
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, priority: 1 },
    ...generateStaticParams().map(({ slot }) => ({ url: `${SITE}/h/${slot}/`, priority: slot.includes("-") ? 0.6 : 0.8 })),
    ...(PAGES.length ? [{ url: `${SITE}/g/`, priority: 0.7 }, ...PAGES.map((p) => ({ url: `${SITE}/g/${p.slug}/`, priority: 0.4 }))] : []),
  ];
}
