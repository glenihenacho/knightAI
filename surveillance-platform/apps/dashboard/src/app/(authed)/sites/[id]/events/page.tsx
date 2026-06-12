import { notFound } from "next/navigation";
import { getSiteServer, listEventsServer } from "@/lib/server-api";
import { EventsFeed } from "../../../behavior/events-feed";

export const dynamic = "force-dynamic";

export default async function SiteEventsPage({ params }: { params: { id: string } }) {
  const site = await getSiteServer(params.id);
  if (!site) notFound();
  const { events } = await listEventsServer({ siteId: site.id, limit: 50 });
  return <EventsFeed initialEvents={events} sites={[site]} fixedSiteId={site.id} compact />;
}
