import type { MetadataRoute } from "next";

const siteUrl = "https://join.goxlally.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/about.html` },
    { url: `${siteUrl}/pricing.html` },
    { url: `${siteUrl}/privacy.html` },
    { url: `${siteUrl}/terms.html` },
  ];
}
