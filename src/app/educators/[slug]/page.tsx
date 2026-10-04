import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { breadcrumbLd, ldScript } from "@/bff/seo";
import { getUser } from "@/bff/session";
import { educatorVM, viewerOf } from "@/bff/views";
import { EducatorView } from "@/ui/views/public";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const vm = educatorVM((await params).slug);
  if (!vm) return {};
  return { title: `${vm.name} — educator`, description: vm.bio ?? `Courses and programs by ${vm.name}.`, alternates: { canonical: `/educators/${vm.slug}` } };
}

export default async function Page({ params }: P) {
  const [{ slug }, user] = await Promise.all([params, getUser()]);
  const vm = educatorVM(slug);
  if (!vm) notFound();
  const ld = [
    { "@context": "https://schema.org", "@type": "Organization", name: vm.name, ...(vm.bio ? { description: vm.bio } : {}) },
    breadcrumbLd([
      ["Home", "/"],
      ["Explore", "/explore"],
      [vm.name, `/educators/${vm.slug}`],
    ]),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(ld) }} />
      <EducatorView viewer={viewerOf(user)} vm={vm} />
    </>
  );
}
