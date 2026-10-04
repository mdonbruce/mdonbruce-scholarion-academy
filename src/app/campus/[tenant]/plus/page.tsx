import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { PlusView } from "@/campus/ui/views/market";

export const metadata: Metadata = { title: "Scholaris Plus" };

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <PlusView tenant={s.tenant} store={s.store} actor={s.actor} />
    </PublicFrame>
  );
}
