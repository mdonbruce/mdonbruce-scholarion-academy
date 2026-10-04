import type { Metadata } from "next";
import { homeLd, ldScript } from "@/bff/seo";
import { getUser } from "@/bff/session";
import { homeVM, viewerOf } from "@/bff/views";
import { HomeView } from "@/ui/views/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Page() {
  const user = await getUser();
  const vm = homeVM();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(homeLd(vm)) }} />
      <HomeView viewer={viewerOf(user)} vm={vm} />
    </>
  );
}
