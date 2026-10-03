import { flashOf, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { accountVM, viewerOf } from "@/bff/views";
import { AccountView } from "@/ui/views/learner";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("/app/account");
  return <AccountView viewer={viewerOf(user)!} vm={accountVM(user)} flash={flashOf(await searchParams)} />;
}
