import { notFound } from "next/navigation";
import { requireUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { catalog, ensurePlatform } from "@/platform";
import { ResourcesView } from "@/ui/views/learner";

export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser(`/app/course/${courseId}/resources`);
  ensurePlatform();
  const course = catalog.get(courseId);
  if (!course) notFound();
  const labs = catalog.items(courseId).filter((i) => i.lab).map((i) => ({ id: i.id, title: i.title, file: i.lab!.starterFile }));
  return <ResourcesView viewer={viewerOf(user)!} course={course} labs={labs} />;
}
