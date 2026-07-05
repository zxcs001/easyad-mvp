/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Booking, Creative, InventoryItem } from "../app/data";
import { ApprovalsView } from "../app/component/operator-views";

const inventory: InventoryItem[] = [{
  id: "INV-APPROVAL-1",
  name: "King Street Digital Board",
  operator: "NorthStar Media",
  format: "digital",
  x: 50,
  y: 50,
  address: "1 King Street",
  price: 500,
  impressions: 100000,
  traffic: 80000,
  income: 90000,
  audience: "Commuters",
  competitor: "Low",
  occupancy: 10,
  imageInterval: 6,
  maxLoopSeconds: 120,
  availableFrom: "2026-07-01",
  availableTo: "2026-08-01",
}];

const bookings: Booking[] = [{
  id: "BK-APPROVAL-1",
  advertiser: "Northern Coffee",
  inventoryId: inventory[0].id,
  campaign: "Summer Iced Coffee",
  start: "2026-07-10",
  end: "2026-07-20",
  adSlots: 1,
  creativeStatus: "pending review",
  status: "creative review",
  spend: 1000,
  paid: true,
  pop: 0,
}];

const creatives: Creative[] = [{
  id: "CRV-APPROVAL-1",
  bookingId: bookings[0].id,
  source: "upload",
  template: "retail",
  format: "digital",
  width: 1920,
  height: 1080,
  fileType: "png",
  fileSize: 400,
  safeZone: 10,
  distortion: 0,
  originalName: "summer-coffee.png",
  mimeType: "image/png",
  publicUrl: "/media/CRV-APPROVAL-1",
  status: "pending review",
  createdAt: "2026-07-01T00:00:00.000Z",
}];

test("operator approvals render a preview for uploaded advertiser creative", () => {
  render(
    <ApprovalsView
      bookings={bookings}
      inventory={inventory}
      creatives={creatives}
      approvalHistory={[]}
      hasConflict={() => false}
      updateBooking={vi.fn()}
    />,
  );

  expect(screen.getByRole("img", { name: "Uploaded creative for Summer Iced Coffee" })).toHaveAttribute("src", "/media/CRV-APPROVAL-1");
  expect(screen.getByRole("link", { name: "Preview uploaded creative for Summer Iced Coffee" })).toHaveAttribute("href", "/media/CRV-APPROVAL-1");
});
