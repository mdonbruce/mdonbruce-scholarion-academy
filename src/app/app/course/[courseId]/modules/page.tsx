import { notFound } from "next/navigation";
import { requireUser } from "@/bff/session";
import { courseHomeVM, viewerOf } from "@/bff/views";
import { CourseHomeView } from "@/ui/views/learner";

export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser(`/app/course/${courseId}/modules`);
  const vm = courseHomeVM(user.id, courseId);
  if (!vm) notFound();
  return <CourseHomeView viewer={viewerOf(user)!} vm={vm} flash={{}} tab="modules" />;
}
