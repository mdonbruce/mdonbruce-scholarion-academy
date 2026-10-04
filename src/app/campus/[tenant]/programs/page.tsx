import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { ProgramIndexView } from "@/campus/ui/views/program";

export const metadata: Metadata = { title: "Programs", description: "Certificate programs from Scholaris AI Academy." };

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <ProgramIndexView tenant={s.tenant} store={s.store} />
    </PublicFrame>
  );
}
