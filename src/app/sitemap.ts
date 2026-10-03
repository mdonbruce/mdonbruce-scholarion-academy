import type { MetadataRoute } from "next";
import { catalog, content, ensurePlatform } from "@/platform";

export default function sitemap(): MetadataRoute.Sitemap {
  ensurePlatform();
  const base = process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000";
  const statics = ["", "/explore", "/programs", "/plus", "/pricing", "/financial-aid", "/teams", "/help", "/verify", "/hubs", "/blog"].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const }));
  return [
    ...statics,
    ...catalog.all().map((p) => ({ url: `${base}/learn/${p.slug}`, lastModified: p.createdAt, changeFrequency: "weekly" as const })),
    ...content.hubs().map((h) => ({ url: `${base}/hubs/${h.slug}`, changeFrequency: "weekly" as const })),
    ...content.articles().map((a) => ({ url: `${base}/blog/${a.slug}`, lastModified: a.updatedAt ?? a.publishedAt, changeFrequency: "monthly" as const })),
  ];
}
