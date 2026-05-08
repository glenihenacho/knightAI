import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function LegacyConnectorsRedirect() {
  const me = await requireSession();
  redirect(`/sites/${me.user.organizationId}/connectors`);
}
