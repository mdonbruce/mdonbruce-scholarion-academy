import { getUser } from "@/bff/session";
import { homeVM, viewerOf } from "@/bff/views";
import { HomeView } from "@/ui/views/public";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <HomeView viewer={viewerOf(await getUser())} vm={homeVM()} />;
}
