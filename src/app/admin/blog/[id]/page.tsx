import { notFound } from "next/navigation";
import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { adminArticleVM, viewerOf } from "@/bff/views";
import { AdminArticleView } from "@/ui/views/content";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const user = await requireRole(`/admin/blog/${id}`, "instructor");
  const vm = adminArticleVM(id);
  if (!vm) notFound();
  return <AdminArticleView viewer={viewerOf(user)!} vm={vm} flash={flashOf(await searchParams)} />;
}
