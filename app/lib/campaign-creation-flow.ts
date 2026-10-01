import type { Booking, Creative, View } from "../data";

export type CampaignCreationStep = "booking" | "creative" | null;

export function resolveCampaignView({
  requestedView,
  activeStep,
  bookingId,
  accessibleBookingIds,
}: {
  requestedView: View;
  activeStep: CampaignCreationStep;
  bookingId?: string | null;
  accessibleBookingIds: ReadonlySet<string>;
}): View {
  // An active creation flow owns navigation until its current step succeeds or
  // either creation step is explicitly cancelled.
  if (activeStep) return requestedView === activeStep ? requestedView : activeStep;

  // Booking is an internal continuation from screen discovery, never a valid
  // standalone entry point.
  if (requestedView === "booking") return "discover";

  // Creative may be opened outside creation only as an edit of an accessible
  // campaign. A bare Step 3 URL cannot start a new campaign halfway through.
  if (requestedView === "creative" && (!bookingId || !accessibleBookingIds.has(bookingId))) return "discover";

  return requestedView;
}

export function isVerifiedCreativeSubmission(
  payload: { booking?: { id?: string } | null; creative?: { bookingId?: string } | null } | null,
  bookingId: string,
) {
  return payload?.booking?.id === bookingId && payload.creative?.bookingId === bookingId;
}

export async function readCreativeSubmissionResponse(response: Response, bookingId: string) {
  const payload = await response.json().catch(() => null) as {
    booking?: Booking;
    creative?: Creative;
    error?: string;
    checks?: { label: string; ok: boolean; message: string }[];
  } | null;
  if (!response.ok) {
    const reasons = payload?.checks?.filter((check) => !check.ok).map((check) => `${check.label}: ${check.message}`);
    const fallback = response.status === 413
      ? "The upload is too large. Choose a file up to 50 MB."
      : response.status >= 500
        ? "The server could not save your creative. Your campaign and artwork are still here; please retry."
        : `Creative could not be submitted (HTTP ${response.status}). Please retry.`;
    throw new Error(reasons?.length ? reasons.join("\n") : payload?.error || fallback);
  }
  if (!isVerifiedCreativeSubmission(payload, bookingId)) {
    throw new Error("The server did not confirm creative for this campaign. Refresh the campaign to check its submission status before retrying.");
  }
  return payload as { booking: Booking; creative: Creative };
}

export async function readCampaignCancellationResponse(response: Response, bookingId: string) {
  const payload = await response.json().catch(() => null) as { booking?: Booking; error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Could not cancel this campaign. Your campaign is still here; please retry.");
  if (payload?.booking?.id !== bookingId || payload.booking.status !== "cancelled") {
    throw new Error("The server did not confirm campaign cancellation. Refresh the campaign to check its status.");
  }
  return payload.booking;
}
