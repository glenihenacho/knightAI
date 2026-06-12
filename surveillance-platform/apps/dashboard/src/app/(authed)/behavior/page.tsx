import { listEventsServer, listSitesServer, requireSession } from "@/lib/server-api";
import { EventsFeed } from "./events-feed";

export const dynamic = "force-dynamic";

export default async function BehaviorPage() {
  await requireSession();
  const [{ events }, { sites }] = await Promise.all([
    listEventsServer({ limit: 50 }),
    listSitesServer(),
  ]);
  return <EventsFeed initialEvents={events} sites={sites} />;
}
