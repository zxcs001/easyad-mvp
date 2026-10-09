import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { responseSummaries } from "../../lib/responses";
import { responseAccess } from "../../lib/responses-access";
import CampaignReport from "../../component/campaign-report";

type PageProps = { params: Promise<{ bookingId: string }> };

export const dynamic = "force-dynamic";

// A one-page campaign report to print or save as PDF. Only the advertiser who
// owns the booking, the screen's owner and Super Admin can open it.
export default async function CampaignReportPage({ params }: PageProps) {
  const { bookingId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/report/${bookingId}`)}`);
  const access = await responseAccess(user, bookingId);
  if (!access || !access.inventory) notFound();
  const [response] = await responseSummaries([bookingId]);
  return <CampaignReport booking={access.booking} screen={access.inventory} response={response ?? null} generatedAt={new Date().toISOString()} />;
}
