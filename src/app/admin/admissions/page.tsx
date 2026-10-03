import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { admissionsVM, viewerOf } from "@/bff/views";
import { AdminAdmissionsView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/admissions", "reviewer");
  return <AdminAdmissionsView viewer={viewerOf(user)!} vm={admissionsVM()} flash={flashOf(await searchParams)} />;
}
