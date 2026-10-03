import { getUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { NotFoundView } from "@/ui/views/public";

export default async function NotFound() {
  return <NotFoundView viewer={viewerOf(await getUser())} />;
}
