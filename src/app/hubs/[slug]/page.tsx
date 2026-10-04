import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hubLd, ldScript } from "@/bff/seo";
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
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(hubLd(vm)) }} />
      <HubView viewer={viewerOf(user)} vm={vm} />
    </>
  );
}
