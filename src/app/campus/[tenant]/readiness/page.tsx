import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { ReadinessView } from "@/campus/ui/views/readiness";

export const metadata: Metadata = { title: "Readiness self-check" };

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <ReadinessView slug={s.tenant.slug} sp={sp} />
    </PublicFrame>
  );
}
