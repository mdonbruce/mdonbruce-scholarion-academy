import type { Metadata } from "next";
import type { SP } from "@/bff/page";
import { EXPLORE_CANONICAL, exploreLd, ldScript } from "@/bff/seo";
import { getUser } from "@/bff/session";
import { exploreVM, viewerOf } from "@/bff/views";
import { ExploreView } from "@/ui/views/public";

// Filtered views share one canonical URL: the catalog root.
export const metadata: Metadata = { title: "Explore courses and certificates", alternates: { canonical: EXPLORE_CANONICAL } };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [user, vm] = [await getUser(), exploreVM(sp)];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(exploreLd(vm)) }} />
      <ExploreView viewer={viewerOf(user)} vm={vm} />
    </>
  );
}
