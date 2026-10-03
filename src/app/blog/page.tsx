import type { Metadata } from "next";
import { one, type SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { blogVM, viewerOf } from "@/bff/views";
import { BlogIndexView } from "@/ui/views/content";

export const metadata: Metadata = { title: "Blog", description: "Practical guidance on learning AI and programming from Scholarion Academy.", alternates: { canonical: "/blog" } };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const [sp, user] = await Promise.all([searchParams, getUser()]);
  return <BlogIndexView viewer={viewerOf(user)} vm={blogVM(one(sp.tag))} />;
}
