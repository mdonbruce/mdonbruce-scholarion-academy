import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { VerifyView } from "@/campus/ui/views/public";

export const metadata: Metadata = { title: "Verify a credential" };

export default async function Page({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <VerifyView tenant={s.tenant} store={s.store} id={id} />
    </PublicFrame>
  );
}
