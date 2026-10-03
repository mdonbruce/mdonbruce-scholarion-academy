import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000";
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/checkout", "/verify/"] }], sitemap: `${base}/sitemap.xml` };
}
