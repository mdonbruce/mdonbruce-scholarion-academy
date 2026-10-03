import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { courseReviewsVM, viewerOf } from "@/bff/views";
import { AdminCourseReviewsView } from "@/ui/views/admin";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/admin/course-reviews", "reviewer");
  return <AdminCourseReviewsView viewer={viewerOf(user)!} vm={courseReviewsVM(user.id)} flash={flashOf(await searchParams)} />;
}
