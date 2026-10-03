import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { moderationVM, viewerOf } from "@/bff/views";
import { AdminModerationView } from "@/ui/views/admin";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/moderation", "instructor");
  return <AdminModerationView viewer={viewerOf(user)!} vm={moderationVM()} flash={flashOf(await searchParams)} />;
}
