import type { Metadata } from "next";
import { one, type SP } from "@/bff/page";
import { SignupView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Join for free" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <SignupView next={one(sp.next)} error={one(sp.error)} />;
}
