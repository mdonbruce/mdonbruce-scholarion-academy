import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { studioVM, viewerOf } from "@/bff/views";
import { AdminStudioView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/studio", "instructor");
  return <AdminStudioView viewer={viewerOf(user)!} vm={studioVM()} flash={flashOf(await searchParams)} />;
}
