import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { PublicPortfolioView } from "@/campus/ui/views/register";

export const metadata: Metadata = { title: "Portfolio", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ tenant: string; token: string }> }) {
  const { tenant, token } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <PublicPortfolioView tenant={s.tenant} token={token} />
    </PublicFrame>
  );
}
