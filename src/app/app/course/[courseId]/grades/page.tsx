import { notFound } from "next/navigation";
import { requireUser } from "@/bff/session";
import { gradebookVM, viewerOf } from "@/bff/views";
import { GradebookView } from "@/ui/views/learner";

export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser(`/app/course/${courseId}/grades`);
  const vm = gradebookVM(user.id, courseId);
  if (!vm) notFound();
  return <GradebookView viewer={viewerOf(user)!} vm={vm} />;
}
