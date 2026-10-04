import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { AgenticHubView } from "@/campus/ui/views/hub";

export const metadata: Metadata = {
  title: "Agentic AI Courses & Certifications",
  description: "Guided projects, short courses, specializations, professional certificates and live programs in agentic AI from Scholaris AI Academy.",
};

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <AgenticHubView tenant={s.tenant} store={s.store} sp={sp} />
    </PublicFrame>
  );
}
