import { requireUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { ProctoringView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/proctoring");
  return <ProctoringView viewer={viewerOf(user)!} />;
}
