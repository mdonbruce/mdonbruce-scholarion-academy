import { flashOf, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { notificationsVM, viewerOf } from "@/bff/views";
import { NotificationsView } from "@/ui/views/learner";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("/app/notifications");
  return <NotificationsView viewer={viewerOf(user)!} notices={notificationsVM(user)} flash={flashOf(await searchParams)} />;
}
