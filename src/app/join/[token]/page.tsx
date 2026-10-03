import type { Metadata } from "next";
import { flashOf, type SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { joinVM, viewerOf } from "@/bff/views";
import { JoinView } from "@/ui/views/teams";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join your organization", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const user = await getUser();
  return <JoinView viewer={viewerOf(user)} vm={joinVM(token)} token={token} flash={flashOf(await searchParams)} />;
}
