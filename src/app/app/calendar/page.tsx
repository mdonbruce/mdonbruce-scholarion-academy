import { requireUser } from "@/bff/session";
import { calendarVM, viewerOf } from "@/bff/views";
import { CalendarView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/calendar");
  return <CalendarView viewer={viewerOf(user)!} vm={calendarVM(user.id)} />;
}
