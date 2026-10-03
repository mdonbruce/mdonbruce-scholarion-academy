import { requireUser } from "@/bff/session";
import { dashboardVM, viewerOf } from "@/bff/views";
import { MyCoursesView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/courses");
  return <MyCoursesView viewer={viewerOf(user)!} vm={dashboardVM(user.id)} />;
}
