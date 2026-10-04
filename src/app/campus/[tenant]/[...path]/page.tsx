import { redirect } from "next/navigation";
import { campusSession } from "@/campus/ui/session";
import { CampusShell } from "@/campus/ui/shell";
import { Flash } from "@/campus/ui/kit";
import { flat, type RawSP } from "@/campus/ui/params";
import { CampusPage } from "@/campus/ui/views/dispatch";

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string; path: string[] }>; searchParams: RawSP }) {
  const { tenant, path } = await params;
  const s = await campusSession(tenant);
  const current = path.join("/");
  if (!s.actor) redirect(`/campus/${s.tenant.slug}/signin?next=${encodeURIComponent(`/campus/${s.tenant.slug}/${current}`)}`);
  const sp = await flat(searchParams);
  return (
    <CampusShell tenant={s.tenant} store={s.store} actor={s.actor} current={current}>
      <Flash sp={sp} />
      <CampusPage store={s.store} actor={s.actor} slug={s.tenant.slug} path={path} sp={sp} />
    </CampusShell>
  );
}
