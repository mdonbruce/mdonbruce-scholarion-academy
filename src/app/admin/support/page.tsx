import { requireRole } from "@/bff/session";
import { supportVM, viewerOf } from "@/bff/views";
import { AdminSupportView } from "@/ui/views/admin";

export default async function Page() {
  const user = await requireRole("/admin/support", "support_agent");
  return <AdminSupportView viewer={viewerOf(user)!} vm={supportVM()} />;
}
