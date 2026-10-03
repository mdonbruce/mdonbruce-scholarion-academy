import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { aidQueueVM, viewerOf } from "@/bff/views";
import { AdminAidView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/aid", "reviewer");
  return <AdminAidView viewer={viewerOf(user)!} vm={aidQueueVM()} flash={flashOf(await searchParams)} />;
}
