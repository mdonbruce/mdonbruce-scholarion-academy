import { requireUser } from "@/bff/session";
import { gradesOverviewVM, viewerOf } from "@/bff/views";
import { GradesOverviewView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/grades");
  return <GradesOverviewView viewer={viewerOf(user)!} vm={gradesOverviewVM(user.id)} />;
}
