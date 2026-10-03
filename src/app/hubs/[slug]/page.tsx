import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/bff/session";
import { hubVM, viewerOf } from "@/bff/views";
import { HubView } from "@/ui/views/content";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const vm = hubVM((await params).slug);
  if (!vm) return {};
  return { title: `${vm.hub.title} courses and programs`, description: vm.hub.intro, alternates: { canonical: `/hubs/${vm.hub.slug}` }, openGraph: { title: vm.hub.headline, description: vm.hub.intro } };
}

export default async function Page({ params }: P) {
  const [{ slug }, user] = await Promise.all([params, getUser()]);
  const vm = hubVM(slug);
  if (!vm) notFound();
  const base = process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000";
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "ItemList", name: `${vm.hub.title} at Scholarion Academy`, itemListElement: vm.products.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/learn/${p.slug}`, name: p.title })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: vm.hub.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <HubView viewer={viewerOf(user)} vm={vm} />
    </>
  );
}
