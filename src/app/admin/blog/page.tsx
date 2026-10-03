import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { adminBlogVM, hubsVM, viewerOf } from "@/bff/views";
import { AdminBlogView } from "@/ui/views/content";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/blog", "instructor");
  return <AdminBlogView viewer={viewerOf(user)!} vm={adminBlogVM()} hubs={hubsVM().map((h) => ({ slug: h.slug, title: h.title }))} flash={flashOf(await searchParams)} />;
}
