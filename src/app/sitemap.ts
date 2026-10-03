import type { MetadataRoute } from "next";
import { catalog, ensurePlatform } from "@/platform";

export default function sitemap(): MetadataRoute.Sitemap {
  ensurePlatform();
  const base = process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000";
  const statics = ["", "/explore", "/programs", "/plus", "/pricing", "/financial-aid", "/teams", "/help", "/verify"].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const }));
  return [...statics, ...catalog.all().map((p) => ({ url: `${base}/learn/${p.slug}`, lastModified: p.createdAt, changeFrequency: "weekly" as const }))];
}
