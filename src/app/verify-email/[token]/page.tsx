import type { Metadata } from "next";
import { one, type SP } from "@/bff/page";
import { VerifyEmailView } from "@/ui/views/account";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

/** Confirmation needs a click, so link scanners in mail clients can't consume the token. */
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  return <VerifyEmailView token={token} error={one((await searchParams).error)} />;
}
