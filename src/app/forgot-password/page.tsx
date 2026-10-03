import type { Metadata } from "next";
import { one, type SP } from "@/bff/page";
import { ForgotView } from "@/ui/views/account";

export const metadata: Metadata = { title: "Reset your password" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <ForgotView sent={one(sp.sent) === "1"} error={one(sp.error)} />;
}
