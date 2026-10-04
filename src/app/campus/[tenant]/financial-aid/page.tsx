import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { AidView } from "@/campus/ui/views/market";

export const metadata: Metadata = { title: "Financial aid" };

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <AidView tenant={s.tenant} store={s.store} actor={s.actor} offeringId={sp.offeringId} sp={sp} />
    </PublicFrame>
  );
}
