import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function LegacyPairingsRedirect() {
  const me = await requireSession();
  redirect(`/sites/${me.user.organizationId}/connect`);
}
