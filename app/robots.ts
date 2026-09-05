import type { MetadataRoute } from "next";

const siteUrl = "https://www.goxlally.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/ally-platform.html", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
