import { requireUser } from "@/bff/session";
import { credentialsVM, viewerOf } from "@/bff/views";
import { CredentialsView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/credentials");
  return <CredentialsView viewer={viewerOf(user)!} vm={credentialsVM(user.id)} />;
}
