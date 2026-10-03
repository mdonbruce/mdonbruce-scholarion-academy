import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { liveAdminVM, viewerOf } from "@/bff/views";
import { AdminLiveView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/live", "platform_admin");
  return <AdminLiveView viewer={viewerOf(user)!} vm={liveAdminVM()} flash={flashOf(await searchParams)} />;
}
