import type { Metadata } from "next";
import { campusSession } from "@/campus/ui/session";
import { PublicFrame } from "@/campus/ui/shell";
import { SigninView } from "@/campus/ui/views/public";
import { flat, type RawSP } from "@/campus/ui/params";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: RawSP }) {
  const { tenant } = await params;
  const s = await campusSession(tenant);
  return (
    <PublicFrame tenant={s.tenant}>
      <SigninView tenant={s.tenant} sp={await flat(searchParams)} />
    </PublicFrame>
  );
}
