import type { MetadataRoute } from "next";

const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site =
  process.env.NEXT_PUBLIC_SITE_URL ?? (productionDomain ? `https://${productionDomain}` : "http://localhost:3000");

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: site, changeFrequency: "monthly", priority: 1 }];
}
