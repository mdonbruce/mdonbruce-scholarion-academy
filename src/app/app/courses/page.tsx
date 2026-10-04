import { flashOf, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { dashboardVM, myLearningVM, viewerOf } from "@/bff/views";
import { MyCoursesView } from "@/ui/views/learner";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("/app/courses");
  return <MyCoursesView viewer={viewerOf(user)!} vm={dashboardVM(user.id)} mine={myLearningVM(user.id)} flash={flashOf(await searchParams)} />;
}
