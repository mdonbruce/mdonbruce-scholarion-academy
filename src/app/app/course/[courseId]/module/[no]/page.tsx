import { notFound } from "next/navigation";
import { requireUser } from "@/bff/session";
import { moduleVM, viewerOf } from "@/bff/views";
import { ModuleView } from "@/ui/views/learner";

export default async function Page({ params }: { params: Promise<{ courseId: string; no: string }> }) {
  const { courseId, no } = await params;
  const user = await requireUser(`/app/course/${courseId}/module/${no}`);
  const vm = moduleVM(user.id, courseId, Number(no));
  if (!vm) notFound();
  return <ModuleView viewer={viewerOf(user)!} vm={vm} />;
}
