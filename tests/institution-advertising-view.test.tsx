/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";
import InstitutionAdvertisingView from "../app/component/institution-advertising-view";

const screenItem: InventoryItem = {
  id: "INV-CIVIC-1",
  name: "City Hall Screen",
  operator: "Civic Communications",
  format: "digital",
  x: 50,
  y: 50,
  address: "100 Main Street, Thunder Bay, ON",
  price: 120,
  impressions: 10000,
  traffic: 8000,
  income: 0,
  audience: "Residents",
  competitor: "Low",
  occupancy: 20,
  imageInterval: 8,
  maxLoopSeconds: 120,
  availableFrom: "2026-01-01",
  availableTo: "2099-12-31",
  approvalStatus: "approved",
  institutionId: "INST-CIVIC",
  advertisingOptIn: false,
};

function renderView(inventory: InventoryItem[], onOpenCommandCentre = vi.fn()) {
  render(
    <InstitutionAdvertisingView
      inventory={inventory}
      bookings={[]}
      creatives={[]}
      transactions={[]}
      approvalHistory={[]}
      paymentsEnabled={false}
      hasConflict={() => false}
      updateBooking={vi.fn()}
      updateMediaApproval={vi.fn()}
      onSettle={vi.fn()}
      onRunDelivery={vi.fn()}
      onOpenCommandCentre={onOpenCommandCentre}
      onEditScreen={vi.fn()}
    />,
  );
  return { onOpenCommandCentre };
}

test("with every screen reserved, Advertising shows a read-only note and no rates", async () => {
  const user = userEvent.setup();
  const { onOpenCommandCentre } = renderView([screenItem]);

  expect(screen.getByRole("heading", { name: "All screens are reserved for your institution" })).toBeInTheDocument();
  expect(screen.queryByText("Daily rate")).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open Command centre" }));
  expect(onOpenCommandCentre).toHaveBeenCalledWith(screenItem.id);
});

test("opened screens list their rates and keep reserved screens out of the list", () => {
  renderView([{ ...screenItem, advertisingOptIn: true }, { ...screenItem, id: "INV-CIVIC-2", name: "Library Screen" }]);

  expect(screen.getByRole("tab", { name: "Screens and rates" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("City Hall Screen")).toBeInTheDocument();
  expect(screen.queryByText("Library Screen")).not.toBeInTheDocument();
  expect(screen.getByText(/1 screen stays reserved for institution use/)).toBeInTheDocument();
  expect(screen.getByText("Daily rate")).toBeInTheDocument();
});
