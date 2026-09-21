import type { View } from "../data";

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
  // the date-request step is explicitly cancelled.
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
