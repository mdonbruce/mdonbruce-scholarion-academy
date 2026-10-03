import type { Metadata } from "next";
import { getUser } from "@/bff/session";
import { verifyVM, viewerOf } from "@/bff/views";
import { VerifyView } from "@/ui/views/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Credential verification", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VerifyView viewer={viewerOf(await getUser())} vm={verifyVM(id)} />;
}
