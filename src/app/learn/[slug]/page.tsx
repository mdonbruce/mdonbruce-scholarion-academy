import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { flashOf, one, type SP } from "@/bff/page";
import { ldScript, productLd } from "@/bff/seo";
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
  // schema.org Course, FAQ and BreadcrumbList. Ratings appear only from published, verified reviews.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(productLd(vm)) }} />
      <ProductView viewer={viewerOf(user)} vm={vm} flash={flashOf(sp)} openEnroll={one(sp.enroll) === "1"} />
    </>
  );
}
