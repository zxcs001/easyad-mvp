/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";
import CreativeView from "../app/component/creative-view";
import type { CreativeDraft } from "../app/types";

const inventory: InventoryItem[] = [
  {
    id: "INV-CREATIVE-1",
    name: "Creative Test Screen",
    operator: "MetroScreens",
    format: "digital",
    x: 50,
    y: 50,
    address: "100 Creative Ave",
    price: 500,
    impressions: 120000,
    traffic: 90000,
    income: 85000,
    audience: "Commuters",
    competitor: "Low",
    occupancy: 20,
    imageInterval: 6,
    maxLoopSeconds: 120,
    availableFrom: "2026-07-01",
    availableTo: "2026-08-01",
  },
];

const bookings: Booking[] = [
  {
    id: "BK-CREATIVE-1",
    advertiser: "Pulse Athletic",
    inventoryId: "INV-CREATIVE-1",
    campaign: "Creative Launch",
    start: "2099-07-10",
    end: "2099-07-20",
    adSlots: 1,
    creativeStatus: "pending review",
    status: "pending approval",
    spend: 1000,
    paid: false,
    pop: 0,
  },
  {
    id: "BK-CREATIVE-REJECTED",
    advertiser: "Former Advertiser",
    inventoryId: "INV-CREATIVE-1",
    campaign: "Rejected Creative",
    start: "2099-07-10",
    end: "2099-07-20",
    adSlots: 1,
    creativeStatus: "needs changes",
    status: "rejected",
    spend: 1000,
    paid: false,
    pop: 0,
  },
];

const draft: CreativeDraft = {
  template: "retail",
  format: "digital",
  width: 1920,
  height: 1080,
  fileType: "png",
  fileSize: 84,
  safeZone: 10,
  distortion: 1,
};

describe("CreativeView", () => {
  test("offers both fixed template and uploaded media production paths", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<CreativeHarness onSubmit={onSubmit} />);

    expect(screen.getByRole("heading", { name: "Fixed template" })).toBeInTheDocument();
    expect(screen.getByText("Weekend offer")).toBeInTheDocument();
    const campaignSelect = screen.getByRole("combobox", { name: "Campaign" });
    expect(within(campaignSelect).getAllByRole("option")).toHaveLength(1);
    expect(within(campaignSelect).queryByRole("option", { name: "Rejected Creative - Former Advertiser" })).not.toBeInTheDocument();
    expect(screen.getByText("Rejected Creative")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upload media" }));

    expect(screen.getByRole("heading", { name: "Upload media" })).toBeInTheDocument();
    expect(screen.getByLabelText("Image or video creative")).toBeInTheDocument();
    expect(screen.getByText("Select a PNG, JPG, or MP4 file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit upload for review" })).toBeDisabled();
  });
});

function CreativeHarness({ onSubmit }: { onSubmit: Parameters<typeof CreativeView>[0]["onSubmit"] }) {
  const [creativeDraft, setCreativeDraft] = useState(draft);
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0].id);

  return (
    <CreativeView
      draft={creativeDraft}
      setDraft={setCreativeDraft}
      bookings={bookings}
      inventory={inventory}
      creatives={[]}
      onSubmit={onSubmit}
      canSubmit
      selectedBookingId={selectedBookingId}
      setSelectedBookingId={setSelectedBookingId}
    />
  );
}
