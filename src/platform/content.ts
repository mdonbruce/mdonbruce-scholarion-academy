import { publish } from "./bus";
import { catalog } from "./catalog";
import { commerce } from "./commerce";
import { identity } from "./identity";
import { checkClaims, type ClaimIssue } from "./partners";
import { getDb, nowIso, save } from "./store";
import type { Article, Product } from "./types";
import { newId, PlatformError, slugify, words } from "./util";

/**
 * Category hubs and the editorial blog. Hub copy and every article pass the claims
 * checker before they render or publish (no credit, salary, outcome, rating or
 * partner claims without a source on file).
 */

export interface Hub {
  slug: string;
  title: string;
  headline: string;
  intro: string;
  whoFor: string[];
  startHere: string; // product id
  match: (p: Product) => boolean;
  faq: { q: string; a: string }[];
}

const has = (p: Product, re: RegExp) => re.test(p.title) || p.skills.some((s) => re.test(s));

export const HUBS: Hub[] = [
  {
    slug: "agentic-ai",
    title: "Agentic AI",
    headline: "Build AI agents that plan, use tools and stay safe",
    intro: "Agents combine a language model with tools, memory and guardrails. These programs start with how the agent loop works and build up to retrieval, multi-agent design and production practices, with labs at every step.",
    whoFor: ["Developers who want to add agents to real products", "Engineers moving from prompt experiments to tested systems", "Technical leads planning agent projects"],
    startHere: "prd_agentic_foundations",
    match: (p) => has(p, /agent|tool use|\bRAG\b|retrieval|MCP/i),
    faq: [
      { q: "Do I need machine learning experience?", a: "No. You need basic Python. Agentic AI Foundations is free to audit and starts from the agent loop itself." },
      { q: "What's the difference between the self-paced certificates and the live programs?", a: "Self-paced certificates fit around your schedule and include labs and an AI Tutor. Live programs run in cohorts with scheduled sessions and need an application." },
      { q: "What kind of credential do I get?", a: "A non-credit professional training credential, digitally signed so anyone can verify it from its link or QR code." },
    ],
  },
  {
    slug: "generative-ai",
    title: "Generative AI & LLMs",
    headline: "Use large language models well, from prompts to products",
    intro: "Learn how large language models behave, how to prompt and evaluate them, and how to put them to work in products and teams. Programs range from a prompt engineering certificate to extended pathways that combine generative and agentic AI.",
    whoFor: ["Professionals using LLMs in daily work", "Developers building LLM features", "Teams standardising how they use generative AI"],
    startHere: "prd_p19",
    match: (p) => has(p, /generative|large language|prompt|\bLLM/i),
    faq: [
      { q: "Where should a beginner start?", a: "The LLM Prompt Engineering certificate is a practical first step. If you code, pair it with Agentic AI Foundations." },
      { q: "Are the pathways worth it over single certificates?", a: "Pathways bundle several certificates in a recommended order. Compare hours and topics below and choose what matches your goal." },
      { q: "Can I try before paying?", a: "Most courses can be audited for free. Graded work, labs and credentials need full access." },
    ],
  },
  {
    slug: "python-and-data",
    title: "Python, Data & Databases",
    headline: "The programming and data foundations AI work depends on",
    intro: "Write Python with confidence, design relational databases, and work with data the way AI teams do. Every course has hands-on labs graded by an autograder, so you practise rather than just watch.",
    whoFor: ["New programmers", "Analysts moving into code", "Anyone preparing for the AI certificates"],
    startHere: "prd_cop1047c",
    match: (p) => has(p, /python|sql|database|data science|data engineering|pandas/i),
    faq: [
      { q: "I've never programmed. Is this for me?", a: "Yes. Python Programming starts from variables and builds to functions, files and small projects." },
      { q: "Do labs run in my browser?", a: "Yes. Cloud Lab gives you a coding workspace with starter files and instant feedback from tests." },
      { q: "How long does it take?", a: "Each course lists its estimated hours. At about six hours a week, a 60-hour course takes around two to three months." },
    ],
  },
  {
    slug: "ai-for-leaders",
    title: "AI for Business & Leadership",
    headline: "Lead AI adoption with clear strategy and good governance",
    intro: "For managers, product people and executives who need to decide where AI fits, how to run AI products and how to govern them responsibly. No coding required.",
    whoFor: ["Managers and executives", "Product managers", "Transformation and operations leads"],
    startHere: "prd_p20",
    match: (p) => has(p, /business|leader|product manage|governance|strategy/i),
    faq: [
      { q: "Do I need technical skills?", a: "No. These programs focus on decisions, product practice and governance." },
      { q: "Can my team take these together?", a: "Yes. Scholarion for Teams gives your organisation seats, a curated academy and progress reports." },
      { q: "What do I receive?", a: "A verifiable, non-credit professional certificate when you complete the requirements." },
    ],
  },
];

function fromPrice(p: Product, region?: string | null): { price: number; currency: string; label: string } | null {
  try {
    const paid = commerce.offers(p.id, region).filter((o) => o.price && o.price > 0);
    if (!paid.length) return null;
    const o = paid.reduce((a, b) => ((a.price ?? 0) <= (b.price ?? 0) ? a : b));
    return { price: o.price!, currency: o.currency, label: o.interval === "month" ? "per month" : o.interval === "year" ? "per year" : "one time" };
  } catch {
    return null;
  }
}

const sanitizeSources = (xs: string[]) => xs.map((s) => s.trim()).filter((s) => /^https:\/\/\S+$/.test(s)).slice(0, 10);

export const content = {
  HUBS,

  hubs(): Hub[] {
    return HUBS;
  },

  hub(slug: string, region?: string | null) {
    const h = HUBS.find((x) => x.slug === slug);
    if (!h) return null;
    const products = catalog.all().filter(h.match);
    const order = ["course", "guided_project", "professional_certificate", "specialization", "live_program", "bundle"];
    products.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.hours - b.hours);
    return {
      hub: h,
      startHere: catalog.get(h.startHere) ?? products[0] ?? null,
      products,
      compare: products
        .filter((p) => p.type !== "guided_project")
        .map((p) => ({ product: p, from: fromPrice(p, region) })),
      articles: this.articles().filter((a) => a.hubSlugs.includes(h.slug)).slice(0, 3),
    };
  },

  /** Every piece of hub copy, for the claims test. */
  hubCopy(h: Hub): string {
    return [h.title, h.headline, h.intro, ...h.whoFor, ...h.faq.flatMap((f) => [f.q, f.a])].join("\n");
  },

  /* ---------------- Blog ---------------- */

  articles(): Article[] {
    return getDb()
      .articles.filter((a) => a.status === "published")
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  },

  article(slug: string): Article | undefined {
    return getDb().articles.find((a) => a.slug === slug && a.status === "published");
  },

  allArticles(): Article[] {
    return [...getDb().articles].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  },

  draft(id: string): Article | undefined {
    return getDb().articles.find((a) => a.id === id);
  },

  readingMinutes(a: Pick<Article, "body">): number {
    return Math.max(1, Math.round(words(a.body) / 220));
  },

  checkArticle(a: Pick<Article, "title" | "summary" | "body" | "sources">): ClaimIssue[] {
    return checkClaims([a.title, a.summary, a.body].join("\n"), { citedSources: a.sources });
  },

  saveArticle(editorId: string, input: { id?: string; title: string; summary: string; body: string; tags?: string; hubs?: string[]; sources?: string }): Article {
    const ed = identity.getUser(editorId);
    if (!ed || !identity.hasRole(ed, "support_agent", "instructor")) throw new PlatformError("forbidden", "Only staff can edit the blog.", 403);
    const title = input.title.trim();
    if (title.length < 8) throw new PlatformError("title_required", "Give the article a title of at least 8 characters.");
    const summary = input.summary.trim();
    if (summary.length < 30 || summary.length > 300) throw new PlatformError("summary_length", "Write a 30–300 character summary for listings and search results.");
    const body = input.body.replace(/\r\n/g, "\n").trim();
    if (words(body) < 80) throw new PlatformError("too_short", "Articles need at least 80 words.");
    const db = getDb();
    const fields = {
      title,
      summary,
      body,
      tags: (input.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
      hubSlugs: (input.hubs ?? []).filter((h) => HUBS.some((x) => x.slug === h)),
      sources: sanitizeSources((input.sources ?? "").split(/\s+/)),
      updatedAt: nowIso(),
    };
    if (input.id) {
      const a = db.articles.find((x) => x.id === input.id);
      if (!a) throw new PlatformError("not_found", "Article not found", 404);
      Object.assign(a, fields);
      if (a.status === "published" && this.checkArticle(a).length) {
        a.status = "draft";
        save();
        throw new PlatformError("claims", "Saved, but the article was moved back to draft: the claims check found issues.", 409);
      }
      save();
      return a;
    }
    const taken = new Set(db.articles.map((a) => a.slug));
    let slug = slugify(title) || "article";
    for (let n = 2; taken.has(slug); n++) slug = `${slugify(title)}-${n}`;
    const a: Article = { id: newId("art"), slug, status: "draft", authorId: editorId, authorName: "Scholarion Academy editorial team", createdAt: nowIso(), ...fields };
    db.articles.push(a);
    save();
    return a;
  },

  publishArticle(editorId: string, id: string): Article {
    const ed = identity.getUser(editorId);
    if (!ed || !identity.hasRole(ed, "support_agent", "instructor")) throw new PlatformError("forbidden", "Only staff can publish.", 403);
    const a = getDb().articles.find((x) => x.id === id);
    if (!a) throw new PlatformError("not_found", "Article not found", 404);
    const issues = this.checkArticle(a);
    if (issues.length) throw new PlatformError("claims", `The claims check found ${issues.length} issue${issues.length === 1 ? "" : "s"}: ${issues.map((i) => `“${i.match}”`).join(", ")}.`, 409);
    a.status = "published";
    a.publishedAt = a.publishedAt ?? nowIso();
    save();
    publish("content.article.published", "content", `article/${a.id}`, { articleId: a.id });
    return a;
  },

  unpublishArticle(editorId: string, id: string): Article {
    const ed = identity.getUser(editorId);
    if (!ed || !identity.hasRole(ed, "support_agent", "instructor")) throw new PlatformError("forbidden", "Only staff can unpublish.", 403);
    const a = getDb().articles.find((x) => x.id === id);
    if (!a) throw new PlatformError("not_found", "Article not found", 404);
    a.status = "draft";
    save();
    return a;
  },
};
