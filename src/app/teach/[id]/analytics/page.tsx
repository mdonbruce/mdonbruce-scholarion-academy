import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/bff/session";
import { teachAnalyticsVM, viewerOf } from "@/bff/views";
import { TeachAnalyticsView } from "@/ui/views/teach";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Course analytics", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(`/teach/${id}/analytics`, "instructor");
  const vm = teachAnalyticsVM(user.id, id);
  if (!vm) notFound();
  return <TeachAnalyticsView viewer={viewerOf(user)!} vm={vm} />;
}
