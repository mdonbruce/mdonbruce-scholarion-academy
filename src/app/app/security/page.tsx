import { cookies } from "next/headers";
import QR from "@/bff/qr";
import { SESSION_COOKIE } from "@/bff/http";
import { flashOf, one, type SP } from "@/bff/page";
import { requireUser } from "@/bff/session";
import { viewerOf } from "@/bff/views";
import { identity } from "@/platform";
import { otpauthUrl } from "@/platform/totp";
import { SecurityView } from "@/ui/views/account";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("/app/security");
  const sp = await searchParams;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const setup = !user.mfaSecret && user.mfaPendingSecret && one(sp.setup) === "1"
    ? { secret: user.mfaPendingSecret, otpauth: otpauthUrl(user.mfaPendingSecret, user.email), qrSvg: await QR.svg(otpauthUrl(user.mfaPendingSecret, user.email)) }
    : null;
  const vm = {
    email: user.email,
    emailVerified: !!user.emailVerifiedAt,
    mfaEnabled: !!user.mfaSecret,
    mfaEnabledAt: user.mfaEnabledAt ?? null,
    setup,
    sessions: identity.sessionsFor(user.id).map((s) => ({ createdAt: s.createdAt, current: s.token === token })),
    required: one(sp.required) === "1",
    passwordChangedAt: user.passwordChangedAt ?? null,
  };
  return <SecurityView viewer={viewerOf(user)!} vm={vm} flash={flashOf(sp)} />;
}
