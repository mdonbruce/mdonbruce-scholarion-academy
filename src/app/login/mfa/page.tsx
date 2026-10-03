import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MFA_COOKIE } from "@/bff/http";
import { one, type SP } from "@/bff/page";
import { mfaDemoCode } from "@/bff/views";
import { MfaView } from "@/ui/views/account";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const pending = (await cookies()).get(MFA_COOKIE)?.value ?? "";
  return <MfaView next={one(sp.next)} error={one(sp.error)} demoCode={mfaDemoCode(pending)} />;
}
