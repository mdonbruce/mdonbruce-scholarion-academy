import type { Metadata } from "next";
import { getUser } from "@/bff/session";
import { aidApplyVM, viewerOf } from "@/bff/views";
import { FinancialAidView } from "@/ui/views/public";

export const metadata: Metadata = { title: "Financial aid" };

export default async function Page() {
  return <FinancialAidView viewer={viewerOf(await getUser())} decisionDays={aidApplyVM("").guidance.decisionDays} />;
}
