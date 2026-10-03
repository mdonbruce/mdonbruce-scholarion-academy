import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000";
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/teach", "/org", "/join", "/api", "/checkout", "/verify/", "/offline"] }], sitemap: `${base}/sitemap.xml` };
}
