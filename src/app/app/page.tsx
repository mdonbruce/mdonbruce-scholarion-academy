import { flashOf, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { dashboardVM, viewerOf } from "@/bff/views";
import { DashboardView } from "@/ui/views/learner";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("/app");
  return <DashboardView viewer={viewerOf(user)!} vm={dashboardVM(user.id)} flash={flashOf(await searchParams)} />;
}
