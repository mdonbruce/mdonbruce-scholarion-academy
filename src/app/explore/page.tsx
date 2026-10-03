import type { Metadata } from "next";
import type { SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { exploreVM, viewerOf } from "@/bff/views";
import { ExploreView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Explore courses and certificates" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <ExploreView viewer={viewerOf(await getUser())} vm={exploreVM(sp)} />;
}
