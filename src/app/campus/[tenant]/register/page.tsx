import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { RegisterView } from "@/campus/ui/views/register";

export const metadata: Metadata = { title: "Request an account" };

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <RegisterView tenant={s.tenant} sp={sp} />
    </PublicFrame>
  );
}
