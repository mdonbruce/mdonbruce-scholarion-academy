import { notFound } from "next/navigation";
import { flashOf, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { courseHomeVM, viewerOf } from "@/bff/views";
import { CourseHomeView } from "@/ui/views/learner";

export default async function Page({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: SP }) {
  const { courseId } = await params;
  const user = await requireUser(`/app/course/${courseId}`);
  const vm = courseHomeVM(user.id, courseId);
  if (!vm) notFound();
  return <CourseHomeView viewer={viewerOf(user)!} vm={vm} flash={flashOf(await searchParams)} />;
}
