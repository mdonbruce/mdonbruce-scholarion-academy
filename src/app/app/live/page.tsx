import { flashOf, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { liveVM, viewerOf } from "@/bff/views";
import { LiveView } from "@/ui/views/learner";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("/app/live");
  return <LiveView viewer={viewerOf(user)!} vm={liveVM(user.id)} flash={flashOf(await searchParams)} />;
}
