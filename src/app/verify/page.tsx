import type { Metadata } from "next";
import { getUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { VerifyLookupView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Verify a credential" };

export default async function Page() {
  return <VerifyLookupView viewer={viewerOf(await getUser())} />;
}
