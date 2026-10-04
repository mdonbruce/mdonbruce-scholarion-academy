import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { VerifyLookupView, VerifyView } from "@/campus/ui/views/public";

export const metadata: Metadata = { title: "Verify a credential" };

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ id?: string }> }) {
  const { tenant } = await params;
  const { id } = await searchParams;
  const s = await campusSession(tenant);
  const clean = (id ?? "").trim().slice(0, 120);
  return <PublicFrame tenant={s.tenant}>{clean ? <VerifyView tenant={s.tenant} store={s.store} id={clean} /> : <VerifyLookupView tenant={s.tenant} />}</PublicFrame>;
}
