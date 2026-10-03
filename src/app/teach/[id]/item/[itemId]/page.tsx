import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { teachItemVM, viewerOf } from "@/bff/views";
import { TeachItemView } from "@/ui/views/teach";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit item", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; itemId: string }>; searchParams: SP }) {
  const { id, itemId } = await params;
  const user = await requireRole(`/teach/${id}/item/${itemId}`, "instructor");
  const vm = teachItemVM(user.id, itemId);
  if (!vm || vm.course.id !== id) notFound();
  return <TeachItemView viewer={viewerOf(user)!} vm={vm} flash={flashOf(await searchParams)} />;
}
