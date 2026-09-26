import type { MetadataRoute } from "next";
import { PREVIEW, SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return PREVIEW ? { rules: { userAgent: "*", disallow: "/" } } : { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE}/sitemap.xml` };
}
