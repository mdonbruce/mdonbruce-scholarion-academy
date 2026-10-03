import { requireUser } from "@/bff/session";
import { notificationsVM, viewerOf } from "@/bff/views";
import { NotificationsView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/notifications");
  return <NotificationsView viewer={viewerOf(user)!} emails={notificationsVM(user)} />;
}
