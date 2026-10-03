import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { flashOf, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { orgVM, viewerOf } from "@/bff/views";
import { PlatformError } from "@/platform/util";
import { OrgView } from "@/ui/views/teams";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Organization", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const user = await requireUser(`/org/${id}`);
  let vm: ReturnType<typeof orgVM>;
  try {
    vm = orgVM(id, user.id);
  } catch (err) {
    // Admins of another organization get the same answer as a missing one.
    if (err instanceof PlatformError && err.status === 403) redirect("/app");
    notFound();
  }
  const h = await headers();
  const origin = process.env.SCHOLARION_PUBLIC_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return <OrgView viewer={viewerOf(user)!} vm={vm} flash={flashOf(await searchParams)} origin={origin.replace(/\/$/, "")} />;
}
