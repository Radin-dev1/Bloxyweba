import type { MetadataRoute } from "next";

const site = process.env.SITE_URL || "https://trybloxy.com";

/** Public pages for search engines. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/chat", "/studio", "/login"].map((path) => ({
    url: `${site}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
