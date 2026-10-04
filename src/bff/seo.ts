import { publicUrl } from "@/platform/config";
import type { Product } from "@/platform/types";
import type { exploreVM, homeVM, hubVM, productVM } from "./views";

/**
 * schema.org JSON-LD builders for public pages. Only catalog facts go in: no invented
 * ratings or counts (aggregateRating appears only from published, verified reviews).
 */

type Ld = Record<string, unknown>;

const TYPE_CRUMB: Record<string, string> = {
  course: "Courses",
  guided_project: "Guided projects",
  specialization: "Specializations",
  professional_certificate: "Professional certificates",
  live_program: "Live programs",
  bundle: "Pathways",
};

export function abs(path: string): string {
  return `${publicUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** BreadcrumbList from [name, path] pairs (the last one is the current page). */
export function breadcrumbLd(items: [string, string][]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })),
  };
}

export function itemListLd(name: string, products: Pick<Product, "slug" | "title">[], limit = 20): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: Math.min(limit, products.length),
    itemListElement: products.slice(0, limit).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/learn/${p.slug}`), name: p.title })),
  };
}

export function productCrumbs(p: Pick<Product, "type" | "title" | "slug">): [string, string][] {
  return [
    ["Home", "/"],
    ["Explore", "/explore"],
    [TYPE_CRUMB[p.type] ?? "Catalog", `/explore?type=${p.type}`],
    [p.title, `/learn/${p.slug}`],
  ];
}

export function productLd(vm: NonNullable<ReturnType<typeof productVM>>): Ld[] {
  const p = vm.product;
  const rs = vm.reviews.summary;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Course",
      name: p.title,
      description: p.description,
      courseCode: p.code,
      url: abs(`/learn/${p.slug}`),
      provider: { "@type": "Organization", name: "Scholarion Academy" },
      educationalCredentialAwarded: p.credential.title,
      inLanguage: "en",
      isAccessibleForFree: p.freeToAudit,
      ...(rs.count > 0 && rs.average !== null ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rs.average, reviewCount: rs.count, bestRating: 5, worstRating: 1 } } : {}),
    },
    ...(p.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    breadcrumbLd(productCrumbs(p)),
  ];
}

export function hubLd(vm: NonNullable<ReturnType<typeof hubVM>>): Ld[] {
  return [
    itemListLd(`${vm.hub.title} at Scholarion Academy`, vm.products, 50),
    ...(vm.hub.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: vm.hub.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    breadcrumbLd([
      ["Home", "/"],
      ["Topics", "/hubs"],
      [vm.hub.title, `/hubs/${vm.hub.slug}`],
    ]),
  ];
}

export function exploreLd(vm: ReturnType<typeof exploreVM>): Ld[] {
  return [
    itemListLd(vm.filters.q ? `Results for ${vm.filters.q}` : "Scholarion Academy catalog", vm.result.items),
    breadcrumbLd([
      ["Home", "/"],
      ["Explore", "/explore"],
    ]),
  ];
}

export function homeLd(vm: ReturnType<typeof homeVM>): Ld[] {
  const featured = [...new Map([...vm.certificates, ...vm.free, ...vm.guided].map((p) => [p.id, p])).values()];
  return [
    { "@context": "https://schema.org", "@type": "Organization", name: "Scholarion Academy", url: abs("/"), logo: abs("/brand/scholarion-logo-full.png") },
    itemListLd("Featured programs and courses", featured),
  ];
}

/** Serialises JSON-LD safely for a <script> tag. */
export function ldScript(data: Ld | Ld[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Canonical path for explore: the catalog root (filters are not separate documents). */
export const EXPLORE_CANONICAL = "/explore";
