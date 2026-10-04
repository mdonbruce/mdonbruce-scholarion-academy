import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { PublicChangelog } from "@/campus/ui/views/ecohub";

export const metadata: Metadata = { title: "Resource Hub changelog" };

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <PublicChangelog store={s.store} />
    </PublicFrame>
  );
}
