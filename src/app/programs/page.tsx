import type { Metadata } from "next";
import { getUser } from "@/bff/session";
import { pathwayVM, viewerOf } from "@/bff/views";
import { ProgramsView } from "@/ui/views/public";

export const metadata: Metadata = { title: "How the programs stack" };

export default async function Page() {
  return <ProgramsView viewer={viewerOf(await getUser())} vm={pathwayVM()} />;
}
