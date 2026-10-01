import { describe, expect, test } from "vitest";
import { isVerifiedCreativeSubmission, readCampaignCancellationResponse, readCreativeSubmissionResponse, resolveCampaignView } from "../app/lib/campaign-creation-flow";

const bookingIds = new Set(["BK-OWNED"]);

describe("campaign creation route guard", () => {
  test("requires screen discovery before booking", () => {
    expect(resolveCampaignView({ requestedView: "booking", activeStep: null, accessibleBookingIds: bookingIds })).toBe("discover");
  });

  test("requires an accessible campaign before opening creative directly", () => {
    expect(resolveCampaignView({ requestedView: "creative", activeStep: null, accessibleBookingIds: bookingIds })).toBe("discover");
    expect(resolveCampaignView({ requestedView: "creative", activeStep: null, bookingId: "BK-OTHER", accessibleBookingIds: bookingIds })).toBe("discover");
    expect(resolveCampaignView({ requestedView: "creative", activeStep: null, bookingId: "BK-OWNED", accessibleBookingIds: bookingIds })).toBe("creative");
  });

  test("keeps browser navigation on the current creation step", () => {
    expect(resolveCampaignView({ requestedView: "discover", activeStep: "booking", accessibleBookingIds: bookingIds })).toBe("booking");
    expect(resolveCampaignView({ requestedView: "campaigns", activeStep: "creative", accessibleBookingIds: bookingIds })).toBe("creative");
  });

  test("only accepts a server response that belongs to the submitted campaign", () => {
    expect(isVerifiedCreativeSubmission({ booking: { id: "BK-OWNED" }, creative: { bookingId: "BK-OWNED" } }, "BK-OWNED")).toBe(true);
    expect(isVerifiedCreativeSubmission({ booking: { id: "BK-OTHER" }, creative: { bookingId: "BK-OWNED" } }, "BK-OWNED")).toBe(false);
    expect(isVerifiedCreativeSubmission({ booking: { id: "BK-OWNED" }, creative: { bookingId: "BK-OTHER" } }, "BK-OWNED")).toBe(false);
  });
});

describe("creative submission errors", () => {
  test("reports each failed requirement and omits passing checks", async () => {
    const response = Response.json({ error: "Creative failed validation", checks: [
      { label: "Aspect ratio", ok: false, message: "Expected 4:1, received 16:9." },
      { label: "Safe zone", ok: false, message: "Requires at least 6% margin for this format." },
      { label: "File type", ok: true, message: "Allowed: PNG, JPG, PDF." },
    ] }, { status: 422 });
    await expect(readCreativeSubmissionResponse(response, "BK-OWNED")).rejects.toThrow(
      "Aspect ratio: Expected 4:1, received 16:9.\nSafe zone: Requires at least 6% margin for this format.",
    );
  });

  test("preserves the server's specific ownership or campaign-state reason", async () => {
    await expect(readCreativeSubmissionResponse(Response.json({ error: "You can only submit creative for campaigns you own" }, { status: 403 }), "BK-OWNED"))
      .rejects.toThrow("You can only submit creative for campaigns you own");
  });

  test("explains a non-JSON upload rejection without exposing server HTML", async () => {
    await expect(readCreativeSubmissionResponse(new Response("<html>proxy error</html>", { status: 413 }), "BK-OWNED"))
      .rejects.toThrow("The upload is too large. Choose a file up to 50 MB.");
  });

  test("does not complete creation for a mismatched success response", async () => {
    await expect(readCreativeSubmissionResponse(Response.json({ booking: { id: "BK-OTHER" }, creative: { bookingId: "BK-OWNED" } }), "BK-OWNED"))
      .rejects.toThrow("The server did not confirm creative for this campaign");
  });
});

test("cancellation requires the server to confirm the same campaign's cancelled status", async () => {
  await expect(readCampaignCancellationResponse(Response.json({ booking: { id: "BK-OWNED", status: "cancelled" } }), "BK-OWNED")).resolves.toMatchObject({ id: "BK-OWNED", status: "cancelled" });
  for (const booking of [{ id: "BK-OTHER", status: "cancelled" }, { id: "BK-OWNED", status: "pending approval" }]) {
    await expect(readCampaignCancellationResponse(Response.json({ booking }), "BK-OWNED")).rejects.toThrow("The server did not confirm campaign cancellation");
  }
});
