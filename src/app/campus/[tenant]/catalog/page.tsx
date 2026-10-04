import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { CatalogView } from "@/campus/ui/views/public";
import { flat, type RawSP } from "@/campus/ui/params";

export const metadata: Metadata = { title: "Catalog" };

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: RawSP }) {
  const { tenant } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <CatalogView tenant={s.tenant} store={s.store} actor={s.actor} sp={await flat(searchParams)} />
    </PublicFrame>
  );
}
