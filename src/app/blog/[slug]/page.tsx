import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/bff/session";
import { articleVM, viewerOf } from "@/bff/views";
import { ArticleView } from "@/ui/views/content";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const vm = articleVM((await params).slug);
  if (!vm) return {};
  const a = vm.article;
  return { title: a.title, description: a.summary, alternates: { canonical: `/blog/${a.slug}` }, openGraph: { type: "article", title: a.title, description: a.summary, publishedTime: a.publishedAt, modifiedTime: a.updatedAt } };
}

export default async function Page({ params }: P) {
  const [{ slug }, user] = await Promise.all([params, getUser()]);
  const vm = articleVM(slug);
  if (!vm) notFound();
  const a = vm.article;
  const base = process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000";
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.summary, datePublished: a.publishedAt, dateModified: a.updatedAt ?? a.publishedAt, author: { "@type": "Organization", name: "Scholarion Academy" }, publisher: { "@type": "Organization", name: "Scholarion Academy", logo: { "@type": "ImageObject", url: `${base}/brand/scholarion-logo-full.png` } }, mainEntityOfPage: `${base}/blog/${a.slug}`, keywords: a.tags.join(", ") };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ArticleView viewer={viewerOf(user)} vm={vm} />
    </>
  );
}
