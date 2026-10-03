import type { Metadata } from "next";
import { getUser } from "@/bff/session";
import { hubsVM, viewerOf } from "@/bff/views";
import { HubsIndexView } from "@/ui/views/content";

export const metadata: Metadata = { title: "Topics", description: "Browse Scholarion Academy courses and programs by topic: agentic AI, generative AI, Python and data, and AI for leaders.", alternates: { canonical: "/hubs" } };

export default async function Page() {
  return <HubsIndexView viewer={viewerOf(await getUser())} vm={hubsVM()} />;
}
