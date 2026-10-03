import { notFound } from "next/navigation";
import { requireUser } from "@/bff/session";
import { checkoutVM, viewerOf } from "@/bff/views";
import { CheckoutView } from "@/ui/views/public";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/checkout/${id}`);
  const vm = checkoutVM(id, user.id);
  if (!vm) notFound();
  return <CheckoutView viewer={viewerOf(user)} vm={vm} />;
}
