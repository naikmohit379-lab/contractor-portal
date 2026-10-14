import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Marketing pages are indexable; the authenticated portal and token pages are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/jobs", "/suppliers", "/waivers", "/payments", "/prices", "/settings", "/pay/", "/login", "/register", "/confirm/", "/sign/"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
