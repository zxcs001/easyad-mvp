/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ReportsView } from "../app/component/reports-billing-views";
import CampaignReport from "../app/component/campaign-report";
import { bookingDelivery } from "../app/lib/delivery-report";
import { deliveryAllocation as allocation, deliveryBooking as booking, deliveryScreen as unit } from "./helpers/delivery-fixtures";

afterEach(() => vi.unstubAllGlobals());
const props = { bookings: [booking], inventory: [unit], transactions: [], onRunDelivery: async () => true, canRunDelivery: false, isAdvertiser: true };

test("demo-only delivery stays unknown in the dashboard and never uses booking.pop", async () => {
  const delivery = bookingDelivery({ ...booking, pop: 100 }, unit, allocation, [], [{ booking_id: booking.id, provenance: "demo", status: "verified", plays: 10000 }], Date.parse("2026-10-11"));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === "/api/delivery" ? { delivery: [delivery], asOf: "2026-10-11T12:00:00Z" } : { responses: [] })));
  render(<ReportsView {...props} bookings={[{ ...booking, pop: 100 }]} />);
  expect(await screen.findByText(/Delivery unknown:/)).toBeInTheDocument();
  expect(screen.getAllByText("Estimated views")[0].nextSibling).toHaveTextContent("—");
  expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  expect(screen.getByText("Demo plays (excluded)").nextSibling).toHaveTextContent("10,000");
});

test("failed requests show unknown values and retry loads authenticated evidence", async () => {
  const delivery = bookingDelivery(booking, unit, allocation, [{ booking_id: booking.id, creative_id: "creative-1", event_type: "delivered", late: false, count: 288 }], [], Date.parse("2026-10-11"));
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/delivery" ? fail ? new Response("", { status: 503 }) : Response.json({ delivery: [delivery], asOf: "2026-10-11T12:00:00Z" }) : Response.json({ responses: [] })));
  render(<ReportsView {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Delivery evidence is unavailable");
  expect(screen.getByText("Player-reported completed plays").nextSibling).toHaveTextContent("—");
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Refresh delivery" }));
  await waitFor(() => expect(screen.getAllByText("Player-reported completed plays")[0].nextSibling).toHaveTextContent("288"));
  expect(screen.getByText("creative-1")).toBeInTheDocument();
  expect(screen.getAllByText("Estimated views")[0].nextSibling).toHaveTextContent("280");
});

test("printable report leaves estimates unavailable when delivery is unknown", () => {
  const delivery = bookingDelivery(booking, unit, allocation, [], [], Date.parse("2026-10-11"));
  render(<CampaignReport booking={booking} screen={unit} response={null} delivery={delivery} generatedAt="2026-10-11T12:00:00Z" />);
  expect(screen.getAllByText("Estimated views")[0].nextSibling).toHaveTextContent("—");
  expect(screen.getByText(/Delivery unknown:/)).toBeInTheDocument();
  expect(screen.queryByText(/5%/)).not.toBeInTheDocument();
});
