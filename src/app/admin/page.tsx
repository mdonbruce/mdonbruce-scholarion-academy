import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { adminVM, viewerOf } from "@/bff/views";
import { AdminHomeView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin", "platform_admin", "instructor", "reviewer", "support_agent");
  return <AdminHomeView viewer={viewerOf(user)!} vm={adminVM()} flash={flashOf(await searchParams)} />;
}
