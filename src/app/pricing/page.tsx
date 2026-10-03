import type { Metadata } from "next";
import { getUser } from "@/bff/session";
import { homeVM, viewerOf } from "@/bff/views";
import { PricingView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Plans and pricing" };

export default async function Page() {
  return <PricingView viewer={viewerOf(await getUser())} plans={homeVM().plans} />;
}
