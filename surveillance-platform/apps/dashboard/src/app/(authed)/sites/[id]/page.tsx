import { redirect } from "next/navigation";

export default function SiteIndex({ params }: { params: { id: string } }) {
  redirect(`/sites/${params.id}/cameras`);
}
