import { requireUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { catalog, ensurePlatform, lms } from "@/platform";
import { TutorHubView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/tutor");
  ensurePlatform();
  const courses = lms.enrollmentsFor(user.id).map((e) => catalog.get(e.courseId)!).filter(Boolean).map((c) => ({ id: c.id, code: c.code, title: c.title }));
  return <TutorHubView viewer={viewerOf(user)!} courses={courses} />;
}
