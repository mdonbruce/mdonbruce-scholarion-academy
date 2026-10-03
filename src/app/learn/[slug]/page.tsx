import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { flashOf, one, type SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { productVM, viewerOf } from "@/bff/views";
import { ProductView } from "@/ui/views/public";

type P = { params: Promise<{ slug: string }>; searchParams: SP };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const vm = productVM((await params).slug, null);
  if (!vm) return {};
  return { title: vm.product.title, description: vm.product.description, alternates: { canonical: `/learn/${vm.product.slug}` }, openGraph: { title: vm.product.title, description: vm.product.tagline } };
}

export default async function Page({ params, searchParams }: P) {
  const [{ slug }, sp, user] = await Promise.all([params, searchParams, getUser()]);
  const vm = productVM(slug, user?.id ?? null);
  if (!vm) notFound();
  const p = vm.product;
  // schema.org Course / FAQ structured data. Ratings appear only from published, verified reviews.
  const rs = vm.reviews.summary;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Course",
      name: p.title,
      description: p.description,
      courseCode: p.code,
      provider: { "@type": "Organization", name: "Scholarion Academy" },
      educationalCredentialAwarded: p.credential.title,
      inLanguage: "en",
      isAccessibleForFree: p.freeToAudit,
      ...(rs.count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rs.average, reviewCount: rs.count, bestRating: 5, worstRating: 1 } } : {}),
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ProductView viewer={viewerOf(user)} vm={vm} flash={flashOf(sp)} openEnroll={one(sp.enroll) === "1"} />
    </>
  );
}
