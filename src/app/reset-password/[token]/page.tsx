import type { Metadata } from "next";
import { one, type SP } from "@/bff/page";
import { ResetView } from "@/ui/views/account";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  return <ResetView token={token} error={one((await searchParams).error)} />;
}
