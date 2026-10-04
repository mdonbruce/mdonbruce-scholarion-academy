import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { commerceAdminVM, viewerOf } from "@/bff/views";
import { AdminCommerceView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/commerce", "platform_admin");
  return <AdminCommerceView viewer={viewerOf(user)!} vm={commerceAdminVM()} flash={flashOf(await searchParams)} />;
}
