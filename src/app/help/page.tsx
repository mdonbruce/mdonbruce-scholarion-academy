import type { Metadata } from "next";
import { flashOf, one, type SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { helpVM, viewerOf } from "@/bff/views";
import { HelpView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Help Center" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q);
  return <HelpView viewer={viewerOf(await getUser())} articles={helpVM(q)} q={q} flash={flashOf(sp)} />;
}
