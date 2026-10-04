import { redirect } from "next/navigation";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { TenantHome } from "@/campus/ui/views/public";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const s = await campusSession(tenant);
  if (s.actor) redirect(`/campus/${s.tenant.slug}/dashboard`);
  if (!s.store) return <PublicFrame tenant={s.tenant}><p className="notice notice-warn">{s.tenant.name} is currently {s.tenant.status}.</p></PublicFrame>;
  return (
    <PublicFrame tenant={s.tenant}>
      <TenantHome tenant={s.tenant} store={s.store} />
    </PublicFrame>
  );
}
