import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { generateStaticParams } from "./h/[slot]/page";

export const dynamic = "force-static";

// the home page and every hole's and cup's own page
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE}/`, priority: 1 }, ...generateStaticParams().map(({ slot }) => ({ url: `${SITE}/h/${slot}/`, priority: slot.includes("-") ? 0.6 : 0.8 }))];
}
