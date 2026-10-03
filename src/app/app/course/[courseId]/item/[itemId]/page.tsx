import { notFound } from "next/navigation";
import { flashOf, one, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { itemVM, viewerOf } from "@/bff/views";
import { ItemView } from "@/ui/views/learner";

export default async function Page({ params, searchParams }: { params: Promise<{ courseId: string; itemId: string }>; searchParams: SP }) {
  const { courseId, itemId } = await params;
  const user = await requireUser(`/app/course/${courseId}/item/${itemId}`);
  const vm = itemVM(user.id, courseId, itemId);
  if (!vm) notFound();
  const sp = await searchParams;
  return <ItemView viewer={viewerOf(user)!} vm={vm} flash={flashOf(sp)} retake={one(sp.retake) === "1"} />;
}
