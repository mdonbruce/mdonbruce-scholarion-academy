import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { teachCourseVM, viewerOf } from "@/bff/views";
import { TeachCourseView } from "@/ui/views/teach";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit course", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const user = await requireRole(`/teach/${id}`, "instructor");
  const vm = teachCourseVM(user.id, id);
  if (!vm) notFound();
  return <TeachCourseView viewer={viewerOf(user)!} vm={vm} flash={flashOf(await searchParams)} />;
}
