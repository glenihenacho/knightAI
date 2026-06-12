import { listSchedulesServer } from "@/lib/server-api";
import { SchedulesManager } from "./schedules-manager";

export const dynamic = "force-dynamic";

export default async function SiteSchedulesPage({ params }: { params: { id: string } }) {
  const { schedules } = await listSchedulesServer(params.id);
  return <SchedulesManager siteId={params.id} schedules={schedules} />;
}
