import { requireUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { OnboardingView } from "@/ui/views/learner";

export default async function Page() {
  const user = await requireUser("/app/onboarding");
  return <OnboardingView viewer={viewerOf(user)!} />;
}
