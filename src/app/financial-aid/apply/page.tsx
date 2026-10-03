import { flashOf, one, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { aidApplyVM, viewerOf } from "@/bff/views";
import { AidApplyView } from "@/ui/views/public";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const product = one(sp.product) ?? "";
  const user = await requireUser(`/financial-aid/apply?product=${encodeURIComponent(product)}`);
  return <AidApplyView viewer={viewerOf(user)} vm={aidApplyVM(product)} flash={flashOf(sp)} />;
}
