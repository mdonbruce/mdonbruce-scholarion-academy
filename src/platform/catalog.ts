import { getDb } from "./store";
import type { Item, Level, Module, PathwayEdge, Product, ProductType, Track } from "./types";
import { editDistance, slugify } from "./util";

/** Catalog & Pathways (Integration Spec §5). Source of truth for every product page and rail. */

const SYNONYMS: Record<string, string[]> = {
  llm: ["large language models", "large language model", "language models"],
  ai: ["artificial intelligence"],
  ml: ["machine learning"],
  agentic: ["agents", "agent", "multi-agent"],
  genai: ["generative ai", "generative"],
  db: ["database", "databases", "sql"],
  sql: ["database", "databases"],
  python: ["programming", "py"],
  rag: ["retrieval", "retrieval augmented generation"],
  mlops: ["production", "deployment"],
};

export interface SearchFilters {
  q?: string;
  type?: ProductType[];
  level?: Level[];
  freeToAudit?: boolean;
  plusEligible?: boolean;
  format?: "self_paced" | "live";
  track?: Track[];
  language?: string;
  /** Any of these skills (OR). */
  skills?: string[];
  /** Any of these length buckets (see DURATION_BUCKETS). */
  duration?: DurationBucket[];
  /** Any of these subtitle languages. */
  subtitles?: string[];
  sort?: "relevance" | "newest" | "shortest";
}

export type DurationBucket = "short" | "medium" | "long";
/** Length buckets by total learning hours. */
export const DURATION_BUCKETS: Record<DurationBucket, { label: string; test: (hours: number) => boolean }> = {
  short: { label: "Under 5 hours", test: (h) => h < 5 },
  medium: { label: "5–40 hours", test: (h) => h >= 5 && h <= 40 },
  long: { label: "More than 40 hours", test: (h) => h > 40 },
};
export function durationBucket(hours: number): DurationBucket {
  return (Object.keys(DURATION_BUCKETS) as DurationBucket[]).find((k) => DURATION_BUCKETS[k].test(hours)) ?? "long";
}

/**
 * Educator profiles. Only confirmed facts go here; a profile without a record shows its
 * catalog-derived courses and nothing else. Individual instructors are added once confirmed.
 */
export const EDUCATOR_PROFILES: Record<string, { bio: string; qualifications?: string[] }> = {
  "Scholarion Academy": {
    bio: "Scholarion Academy is the training arm of the Scholarion platform. The courses and programs below are designed, built and maintained by the Scholarion Academy instructional team. Individual instructor profiles are listed here only once they are confirmed.",
  },
};

export interface SearchResult {
  items: Product[];
  total: number;
  facets: {
    type: Record<string, number>;
    level: Record<string, number>;
    format: Record<string, number>;
    track: Record<string, number>;
    freeToAudit: number;
    plusEligible: number;
    skills: Record<string, number>;
    duration: Record<string, number>;
    subtitles: Record<string, number>;
    language: Record<string, number>;
  };
  expandedTerms: string[];
  didYouMean?: string;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9#+ ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function haystack(p: Product): string {
  return [p.title, p.code ?? "", p.tagline, p.description, p.skills.join(" "), p.roles.join(" "), p.track ?? "", p.type.replace("_", " ")]
    .join(" ")
    .toLowerCase();
}

function expand(terms: string[]): string[] {
  const out = new Set(terms);
  for (const t of terms) {
    for (const [k, vs] of Object.entries(SYNONYMS)) {
      if (t === k || vs.includes(t)) {
        out.add(k);
        vs.forEach((v) => out.add(v));
      }
    }
  }
  return [...out];
}

function score(p: Product, terms: string[], vocab: Set<string>): number {
  if (terms.length === 0) return 1;
  const hay = haystack(p);
  const hayWords = new Set(tokenize(hay));
  let s = 0;
  for (const t of terms) {
    if (t.includes(" ")) {
      if (hay.includes(t)) s += 3;
      continue;
    }
    if (hayWords.has(t)) s += p.title.toLowerCase().includes(t) ? 4 : 2;
    else if (t.length >= 4 && [...hayWords].some((w) => w.startsWith(t))) s += 1;
    else if (t.length >= 4 && [...hayWords].some((w) => Math.abs(w.length - t.length) <= 1 && editDistance(w, t) <= 1)) s += 1;
  }
  void vocab;
  return s;
}

function visible(p: Product): boolean {
  // Degrees stay hidden until accredited partners sign (Spec §15).
  return p.status === "published" && p.type !== "degree";
}

export const catalog = {
  all(): Product[] {
    return getDb().products.filter(visible);
  },

  get(idOrSlug: string): Product | undefined {
    const p = getDb().products.find((x) => x.id === idOrSlug || x.slug === idOrSlug);
    // Drafts (course builder) stay private until a reviewer publishes them.
    if (!p || p.type === "degree" || p.status === "hidden" || p.status === "draft") return undefined;
    return p;
  },

  search(f: SearchFilters): SearchResult {
    const all = this.all().concat(getDb().products.filter((p) => p.status === "legacy"));
    const raw = tokenize(f.q ?? "");
    const terms = expand(raw);
    const vocab = new Set(all.flatMap((p) => tokenize(haystack(p))));

    let scored = all
      .map((p) => ({ p, s: score(p, terms, vocab) }))
      .filter((x) => (raw.length ? x.s > 0 : x.p.status !== "legacy"));

    // Facet counts are computed before the facet's own filter is applied.
    const facetBase = scored.map((x) => x.p);

    scored = scored.filter(({ p }) => {
      if (f.type?.length && !f.type.includes(p.type)) return false;
      if (f.level?.length && !f.level.includes(p.level)) return false;
      if (f.freeToAudit && !p.freeToAudit) return false;
      if (f.plusEligible && !p.plusEligible) return false;
      if (f.format && p.format !== f.format) return false;
      if (f.track?.length && (!p.track || !f.track.includes(p.track))) return false;
      if (f.language && p.language !== f.language) return false;
      if (f.skills?.length && !p.skills.some((s) => f.skills!.includes(s))) return false;
      if (f.duration?.length && !f.duration.includes(durationBucket(p.hours))) return false;
      if (f.subtitles?.length && !p.subtitles.some((s) => f.subtitles!.includes(s))) return false;
      return true;
    });

    if (f.sort === "newest") scored.sort((a, b) => b.p.createdAt.localeCompare(a.p.createdAt));
    else if (f.sort === "shortest") scored.sort((a, b) => a.p.hours - b.p.hours);
    else scored.sort((a, b) => b.s - a.s || a.p.title.localeCompare(b.p.title));

    const count = (key: (p: Product) => string | string[] | undefined) =>
      facetBase.reduce<Record<string, number>>((acc, p) => {
        const k = key(p);
        for (const v of Array.isArray(k) ? [...new Set(k)] : k ? [k] : []) acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {});
    const byCount = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

    let didYouMean: string | undefined;
    if (raw.length && scored.length === 0) {
      const fixed = raw.map((t) => {
        let best = t;
        let bestD = 3;
        for (const w of vocab) {
          const d = editDistance(w, t);
          if (d < bestD && d <= 2) {
            bestD = d;
            best = w;
          }
        }
        return best;
      });
      if (fixed.join(" ") !== raw.join(" ")) didYouMean = fixed.join(" ");
    }

    return {
      items: scored.map((x) => x.p),
      total: scored.length,
      facets: {
        type: count((p) => p.type),
        level: count((p) => p.level),
        format: count((p) => p.format),
        track: count((p) => p.track),
        freeToAudit: facetBase.filter((p) => p.freeToAudit).length,
        plusEligible: facetBase.filter((p) => p.plusEligible).length,
        skills: byCount(count((p) => p.skills)),
        duration: Object.fromEntries((Object.keys(DURATION_BUCKETS) as DurationBucket[]).map((b) => [b, facetBase.filter((p) => durationBucket(p.hours) === b).length]).filter(([, n]) => n)),
        subtitles: byCount(count((p) => p.subtitles)),
        language: byCount(count((p) => p.language)),
      },
      expandedTerms: terms.filter((t) => !raw.includes(t)),
      didYouMean,
    };
  },

  suggest(q: string, limit = 6): { title: string; slug: string; type: ProductType }[] {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return this.all()
      .filter((p) => p.title.toLowerCase().includes(t) || p.skills.some((s) => s.toLowerCase().includes(t)) || (p.code ?? "").toLowerCase().includes(t))
      .slice(0, limit)
      .map((p) => ({ title: p.title, slug: p.slug, type: p.type }));
  },

  rail(kind: "new" | "free" | "certificates" | "guided" | "agentic" | "live", limit = 8): Product[] {
    const all = this.all();
    const pick = {
      new: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      free: all.filter((p) => p.freeToAudit),
      certificates: all.filter((p) => p.type === "professional_certificate" || p.type === "specialization"),
      guided: all.filter((p) => p.type === "guided_project"),
      agentic: all.filter((p) => /agent/i.test(p.title) || p.skills.some((s) => /agent/i.test(s))),
      live: all.filter((p) => p.format === "live"),
    }[kind];
    return pick.slice(0, limit);
  },

  modules(courseId: string): Module[] {
    return getDb()
      .modules.filter((m) => m.courseId === courseId)
      .sort((a, b) => a.no - b.no);
  },

  module(courseId: string, no: number): Module | undefined {
    return getDb().modules.find((m) => m.courseId === courseId && m.no === no);
  },

  items(courseId: string, moduleNo?: number): Item[] {
    return getDb()
      .items.filter((i) => i.courseId === courseId && (moduleNo === undefined || i.moduleNo === moduleNo))
      .sort((a, b) => a.moduleNo - b.moduleNo || a.order - b.order);
  },

  item(itemId: string): Item | undefined {
    return getDb().items.find((i) => i.id === itemId);
  },

  courses(productId: string): Product[] {
    const p = this.get(productId);
    if (!p) return [];
    return p.courseIds.map((id) => getDb().products.find((x) => x.id === id)).filter((x): x is Product => !!x);
  },

  includedIn(productId: string): Product[] {
    return this.all().filter((p) => p.id !== productId && p.courseIds.includes(productId));
  },

  pathway(): { nodes: Product[]; edges: PathwayEdge[] } {
    const db = getDb();
    const nodeIds = new Set(db.pathway.flatMap((e) => [e.from, e.to]));
    const nodes = db.products.filter((p) => nodeIds.has(p.id) || (p.track && p.track !== "Core" && p.type !== "course"));
    return { nodes, edges: db.pathway };
  },

  /** "Recommended next" after a completion, from the pathway graph. */
  nextSteps(productId: string): Product[] {
    const db = getDb();
    const next = db.pathway
      .filter((e) => e.from === productId && (e.type === "stacks_into" || e.type === "credit_toward" || e.type === "prerequisite"))
      .map((e) => this.get(e.to))
      .filter((p): p is Product => !!p);
    if (next.length) return next;
    const self = this.get(productId);
    if (!self) return [];
    return this.all()
      .filter((p) => p.id !== productId && p.track === self.track && p.type !== "course")
      .slice(0, 3);
  },

  /** Pace estimate shown on program pages: "~X months at Y hrs/week". */
  pace(p: Product, hoursPerWeek = 6): string {
    const weeks = Math.max(1, Math.ceil(p.hours / hoursPerWeek));
    if (weeks < 6) return `~${weeks} weeks at ${hoursPerWeek} hrs/week`;
    return `~${Math.round(weeks / 4.3)} months at ${hoursPerWeek} hrs/week`;
  },

  /** Educators derived from the catalog (product.educator), with their published products. */
  educators(): { slug: string; name: string; products: Product[] }[] {
    const map = new Map<string, Product[]>();
    for (const p of this.all()) map.set(p.educator, [...(map.get(p.educator) ?? []), p]);
    return [...map.entries()].map(([name, products]) => ({ slug: slugify(name), name, products })).sort((a, b) => a.name.localeCompare(b.name));
  },

  educatorSlug(name: string): string {
    return slugify(name);
  },

  educator(slug: string) {
    const e = this.educators().find((x) => x.slug === slug);
    if (!e) return undefined;
    const profile = EDUCATOR_PROFILES[e.name];
    const credentials = [...new Map(e.products.map((p) => [p.credential.title, { title: p.credential.title, kind: p.credential.kind, productSlug: p.slug }])).values()];
    return { ...e, bio: profile?.bio ?? null, qualifications: profile?.qualifications ?? [], credentials };
  },

  skills(): string[] {
    return [...new Set(this.all().flatMap((p) => p.skills))].sort();
  },
  roles(): string[] {
    return [...new Set(this.all().flatMap((p) => p.roles))].sort();
  },
};
