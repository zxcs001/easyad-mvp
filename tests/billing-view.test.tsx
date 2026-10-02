/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BillingView } from "../app/component/reports-billing-views";
import type { Booking } from "../app/data";

const booking: Booking = {
  id: "BK-1",
  advertiser: "North Shore Foods",
  inventoryId: "INV-1",
  campaign: "Autumn launch",
  start: "2026-09-01",
  end: "2026-09-14",
  adSlots: 1,
  creativeStatus: "approved",
  status: "approved",
  spend: 1200,
  paid: false,
  pop: 0,
};

describe("commercial ledger payment boundary", () => {
  test("is read-only and contains no charge affordance when payments are off", () => {
    render(<BillingView bookings={[booking]} transactions={[]} onSettle={vi.fn()} canManage paymentsEnabled={false} />);

    expect(screen.getByRole("heading", { name: "Commercial ledger" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Payment collection is turned off");
    expect(screen.queryByRole("button", { name: /charge|refund|retry/i })).not.toBeInTheDocument();
  });

  test("labels explicitly enabled mock controls as demo-only", () => {
    render(<BillingView bookings={[booking]} transactions={[]} onSettle={vi.fn()} canManage paymentsEnabled />);

    expect(screen.getByRole("note")).toHaveTextContent("Demo only");
    expect(screen.getByRole("button", { name: "Demo charge" })).toBeInTheDocument();
  });

  test("cancelled campaigns do not create invoices or payment actions", () => {
    render(<BillingView bookings={[{ ...booking, status: "cancelled" }]} transactions={[]} onSettle={vi.fn()} canManage paymentsEnabled />);
    expect(screen.getByText("No invoices yet.")).toBeInTheDocument();
    expect(screen.queryByText(booking.campaign)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demo charge" })).not.toBeInTheDocument();
  });
});
