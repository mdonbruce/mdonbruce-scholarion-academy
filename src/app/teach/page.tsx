import type { Metadata } from "next";
import { flashOf, type SP } from "@/bff/page";
import { requireRole } from "@/bff/session";
import { teachHomeVM, viewerOf } from "@/bff/views";
import { TeachHomeView } from "@/ui/views/teach";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teach", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireRole("/teach", "instructor");
  return <TeachHomeView viewer={viewerOf(user)!} vm={teachHomeVM(user.id)} flash={flashOf(await searchParams)} />;
}
