import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { one, type SP } from "@/bff/page";
import { getUser } from "@/bff/session";
import { DEMO } from "@/platform/seed";
import { LoginView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = one(sp.next);
  if (await getUser()) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/app");
  const demo = process.env.NODE_ENV === "production" ? null : [
    { label: "Learner", ...DEMO.learner },
    { label: "Admin", ...DEMO.admin },
    { label: "Auditing learner", ...DEMO.visitor },
  ];
  return <LoginView next={next} error={one(sp.error)} notice={one(sp.notice)} demo={demo} />;
}
