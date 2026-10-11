/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";
import ResponsesPanel, { campaignOrder, costPerResponse } from "../app/component/responses-panel";
import CampaignReport from "../app/component/campaign-report";

const screenItem: InventoryItem = { id: "INV-1", name: "City Hall Screen", operator: "City", format: "digital", x: 50, y: 50, address: "500 Donald St E", price: 15, impressions: 14000, traffic: 1, income: 1, audience: "A", competitor: "Low", occupancy: 0, imageInterval: 6, maxLoopSeconds: 30, availableFrom: "2026-01-01", availableTo: "2099-01-01", measurementSource: "City traffic count" };
const booking: Booking = { id: "BK-1", advertiser: "Northline Fitness", inventoryId: "INV-1", campaign: "Winter push", start: "2026-10-01", end: "2026-10-10", adSlots: 1, creativeStatus: "approved", status: "live", spend: 300, paid: false, pop: 90 };
const daily = Array.from({ length: 14 }, (_, index) => ({ date: `2026-10-${String(index + 1).padStart(2, "0")}`, count: index === 13 ? 5 : 1 }));
const summary = { bookingId: "BK-1", code: "ABCDEFGH", shortUrl: "https://easyad.example/go/ABCDEFGH", destinationUrl: "https://northline.ca/offer", onAd: true, promoCode: "SCREEN10", promoRedemptions: 2, promoUpdatedAt: null, responses: 18, daily, firstResponseAt: null, lastResponseAt: null };

afterEach(() => vi.unstubAllGlobals());

test("cost per response counts scans and reported promo use together", () => {
  expect(costPerResponse(300, { responses: 18, promoRedemptions: 2 })).toBe(15);
  expect(costPerResponse(300, { responses: 0, promoRedemptions: 0 })).toBeNull();
  expect(costPerResponse(300, undefined)).toBeNull();
});

test("per-unit costs keep their cents", async () => {
  const { money } = await import("../app/utils");
  expect(money(1.4, "en", true)).toBe("$1.40");
  expect(money(1.4)).toBe("$1");
});

test("campaigns with a link come first, then running ones, and cancelled ones are left out", () => {
  const make = (id: string, status: Booking["status"], start: string): Booking => ({ ...booking, id, status, start });
  const order = campaignOrder([
    make("old", "completed", "2026-01-01"),
    make("gone", "cancelled", "2026-10-01"),
    make("next", "scheduled", "2026-11-01"),
    make("now", "live", "2026-10-01"),
    make("linked", "completed", "2025-01-01"),
  ], new Map([["linked", summary]]));
  expect(order.map((entry) => entry.id)).toEqual(["linked", "now", "next", "old"]);
});

test("a long campaign list shows six and expands on request", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ responses: [] }), { status: 200 })));
  const many = Array.from({ length: 9 }, (_, index) => ({ ...booking, id: `BK-${index}`, campaign: `Campaign ${index}` }));
  render(<ResponsesPanel bookings={many} inventory={[screenItem]} canEdit />);
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(6));
  await userEvent.click(screen.getByRole("button", { name: "Show all 9 campaigns" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(9);
});

test("an advertiser sees responses per campaign and adds a link to a campaign without one", async () => {
  const user = userEvent.setup();
  const second = { ...booking, id: "BK-2", campaign: "Spring open house" };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => init?.method === "PUT"
    ? Response.json({ response: { ...summary, bookingId: "BK-2", code: "JKMNPQRS", shortUrl: "https://easyad.example/go/JKMNPQRS", responses: 0, promoCode: null, promoRedemptions: 0 } })
    : Response.json({ responses: [summary] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ResponsesPanel bookings={[booking, second]} inventory={[screenItem]} canEdit />);

  expect(await screen.findByText("18")).toBeInTheDocument();
  expect(screen.getByText("Uses of SCREEN10 (you report)")).toBeInTheDocument();
  expect(screen.getByText("$15.00")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Responses in the last 14 days/ })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Report (PDF)" })[0]).toHaveAttribute("href", "/report/BK-1");

  const row = screen.getByText("Spring open house").closest("li")!;
  expect(within(row).getByText("No QR code or link yet.")).toBeInTheDocument();
  await user.click(within(row).getByRole("button", { name: "Add a QR code or link" }));
  await user.type(within(row).getByLabelText("Page people should open"), "northline.ca/spring");
  await user.click(within(row).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(within(row).getByText(/go\/JKMNPQRS opens/)).toBeInTheDocument());
  expect(JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body))).toEqual({ destinationUrl: "northline.ca/spring", promoCode: "" });
});

test("the screen owner sees responses read-only", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ responses: [summary] })));
  render(<ResponsesPanel bookings={[booking]} inventory={[screenItem]} canEdit={false} />);
  expect(await screen.findByText("18")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Edit link|Add a QR code/ })).not.toBeInTheDocument();
});

test("the printable report says where every figure comes from", () => {
  render(<CampaignReport booking={booking} screen={screenItem} response={summary} generatedAt="2026-10-09T12:00:00.000Z" />);
  expect(screen.getByRole("heading", { name: "Winter push" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Print or save as PDF" })).toBeInTheDocument();
  expect(screen.getByText(/Audience figure from City traffic count/)).toHaveTextContent("not an audited measurement (COMMB)");
  expect(screen.getByText(/as reported by the advertiser/)).toBeInTheDocument();
  expect(screen.getByText(/Only the time of each scan is stored/)).toBeInTheDocument();
  // 14,000 a day x one fifth of the loop x 10 days x 90% playback.
  expect(screen.getByText("Estimated views").nextSibling).toHaveTextContent("25,200");
  expect(screen.getByText("Cost per response").nextSibling).toHaveTextContent("$15.00");
});
