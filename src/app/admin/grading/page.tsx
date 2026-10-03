import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { gradingVM, viewerOf } from "@/bff/views";
import { AdminGradingView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/grading", "instructor");
  return <AdminGradingView viewer={viewerOf(user)!} vm={gradingVM()} flash={flashOf(await searchParams)} />;
}
