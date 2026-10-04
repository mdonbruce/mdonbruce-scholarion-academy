import "@/campus";
import { ensureCampusSeed } from "@/campus/seed";
import { TenantPicker } from "@/campus/ui/views/public";

export default function Page() {
  ensureCampusSeed();
  return <TenantPicker />;
}
