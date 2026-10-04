import type { Metadata } from "next";
import { headers } from "next/headers";
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";
import { isOakHavenStaff, partnerRooms, environmentName } from "@/lib/access";
import { LoginScreen } from "./login-screen";
import { HavenConnectPlatform } from "./havenconnect-platform";

// Identity comes from per-request sign-in headers, so this page is never cached.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const env = environmentName((await headers()).get("host") || "");
  return env === "production" ? {} : { title: "HavenConnect · Staging", robots: { index: false, follow: false } };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, view = typeof params.view === "string" ? params.view : "";
  const section = typeof params.section === "string" ? params.section : "";
  const returnTo = view ? `/?view=${encodeURIComponent(view)}${section ? `&section=${encodeURIComponent(section)}` : ""}` : "/";
  const environment = environmentName((await headers()).get("host") || "");
  const user = await getChatGPTUser();
  if (!user) return <LoginScreen mode="signin" signInHref={chatGPTSignInPath(returnTo)} environment={environment} />;
  const signOutHref = chatGPTSignOutPath("/");
  if (isOakHavenStaff(user.email)) {
    if (!view || view === "login") return <LoginScreen mode="ready" displayName={user.displayName} email={user.email} continueHref="/?view=platform" switchHref={signOutHref} environment={environment} />;
    const surface = view === "staff" ? "staff" : view === "tenant-registry" ? "tenant-registry" : "platform";
    return <HavenConnectPlatform user={{ displayName: user.displayName, email: user.email, signOutHref }} staff surface={surface} section={section} />;
  }
  const rooms = await partnerRooms(user.email).catch(() => []);
  if (rooms.length) {
    if (!view || view === "login") return <LoginScreen mode="ready" displayName={user.displayName} email={user.email} continueHref="/?view=platform" switchHref={signOutHref} environment={environment} />;
    return <HavenConnectPlatform user={{ displayName: user.displayName, email: user.email, signOutHref }} staff={false} surface="platform" />;
  }
  return <LoginScreen mode="denied" email={user.email} signOutHref={signOutHref} environment={environment} />;
}
