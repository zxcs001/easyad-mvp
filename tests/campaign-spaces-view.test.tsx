/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";
import CampaignSpacesView from "../app/component/campaign-spaces-view";

const inventory: InventoryItem[] = [{
  id: "INV-CAMPAIGN-1",
  name: "Campaign Screen",
  operator: "Test Operator",
  format: "digital",
  x: 50,
  y: 50,
  address: "1 Campaign Way",
  price: 500,
  impressions: 100000,
  traffic: 80000,
  income: 90000,
  audience: "Commuters",
  competitor: "Low",
  occupancy: 20,
  imageInterval: 6,
  maxLoopSeconds: 120,
  availableFrom: "2026-07-01",
  availableTo: "2026-08-01",
}];

const booking: Booking = {
  id: "BK-CAMPAIGN-1",
  advertiser: "Campaign Advertiser",
  inventoryId: inventory[0].id,
  campaign: "Campaign Launch",
  start: "2026-07-10",
  end: "2026-07-20",
  adSlots: 1,
  creativeStatus: "pending review",
  status: "pending approval",
  spend: 1000,
  paid: false,
  pop: 0,
};

test("campaign spaces offers separate creative and inventory actions", async () => {
  const user = userEvent.setup();
  const onOpenCreative = vi.fn();

  render(<CampaignSpacesView bookings={[booking]} inventory={inventory} onOpenCreative={onOpenCreative} />);

  const creative = screen.getByRole("button", { name: "Creative" });
  const inventoryLink = screen.getByRole("link", { name: "Inventory" });
  expect(inventoryLink).toHaveAttribute("href", "/inventory/INV-CAMPAIGN-1");

  await user.click(creative);
  expect(onOpenCreative).toHaveBeenCalledWith(booking);
});
