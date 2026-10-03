import { one, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { claimsVM, viewerOf } from "@/bff/views";
import { AdminClaimsView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/claims", "platform_admin");
  return <AdminClaimsView viewer={viewerOf(user)!} vm={claimsVM(one((await searchParams).text) ?? "")} />;
}
