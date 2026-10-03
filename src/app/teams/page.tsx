import type { Metadata } from "next";
import { flashOf, one, type SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { TeamsView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Scholarion for Teams" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <TeamsView viewer={viewerOf(await getUser())} flash={flashOf(sp)} partner={one(sp.kind) === "partner"} />;
}
