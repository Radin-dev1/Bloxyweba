import type { MetadataRoute } from "next";

const site = process.env.SITE_URL || "https://trybloxy.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/billing"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
