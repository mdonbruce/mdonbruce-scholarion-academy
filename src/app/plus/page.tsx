import type { Metadata } from "next";
import { getUser } from "@/bff/session";
import { homeVM, viewerOf } from "@/bff/views";
import { PlusView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Scholarion Plus" };

export default async function Page() {
  return <PlusView viewer={viewerOf(await getUser())} plans={homeVM().plans} />;
}
