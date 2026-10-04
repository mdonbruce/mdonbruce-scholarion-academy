import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { ProgramPageView } from "@/campus/ui/views/program";
import { flat, type RawSP } from "@/campus/ui/params";
import { programPage } from "@/campus/services/programs";

export async function generateMetadata({ params }: { params: Promise<{ tenant: string; slug: string }> }): Promise<Metadata> {
  const { tenant, slug } = await params;
  try {
    const s = await campusSession(tenant);
    const p = programPage(s.store, null, slug);
    return { title: `${p.spec.title} — Program ${p.code}`, description: p.spec.valueStatement, openGraph: { title: p.spec.title, description: p.spec.valueStatement, type: "website" } };
  } catch {
    return { title: "Program" };
  }
}

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string; slug: string }>; searchParams: RawSP }) {
  const { tenant, slug } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <ProgramPageView tenant={s.tenant} store={s.store} actor={s.actor} slug={slug} sp={await flat(searchParams)} />
    </PublicFrame>
  );
}
