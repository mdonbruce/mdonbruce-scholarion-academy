import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { flashOf, type SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { applyVM, viewerOf } from "@/bff/views";
import { ApplyView } from "@/ui/views/admissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Apply", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const user = await getUser();
  const vm = applyVM(slug, user?.id ?? null);
  if (!vm) notFound();
  return <ApplyView viewer={viewerOf(user)} vm={vm} flash={flashOf(await searchParams)} />;
}
