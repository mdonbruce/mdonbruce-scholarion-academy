import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { PricingView } from "@/campus/ui/views/market";

export const metadata: Metadata = { title: "Plans and pricing" };

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <PricingView tenant={s.tenant} store={s.store} actor={s.actor} />
    </PublicFrame>
  );
}
