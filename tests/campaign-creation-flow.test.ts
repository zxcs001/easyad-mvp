import { describe, expect, test } from "vitest";
import { isVerifiedCreativeSubmission, resolveCampaignView } from "../app/lib/campaign-creation-flow";

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
