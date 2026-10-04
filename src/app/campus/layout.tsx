import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Scholarion Campus", template: "%s · Scholarion Campus" }, robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
