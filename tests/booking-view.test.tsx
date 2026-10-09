/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import BookingView from "../app/component/booking-view";
import type { InventoryItem } from "../app/data";
import type { BookingDraft } from "../app/types";

const baseItem: InventoryItem = {
  id: "INV-BOOKING-1",
  name: "Booking Test Unit",
  operator: "Test Operator",
  format: "digital",
  deliveryMode: "digital",
  x: 50,
  y: 50,
  address: "1 Booking Way",
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
};

const draft: BookingDraft = {
  advertiser: "Test Advertiser",
  campaign: "Test Campaign",
  start: "2026-07-10",
  end: "2026-07-12",
  adSlots: 1,
};

// Keep the fixture dates future-facing without freezing async UI timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

function renderBooking(item: InventoryItem, onSubmit = vi.fn().mockResolvedValue(true), onCancel = vi.fn()) {
  render(
    <BookingView
      item={item}
      inventory={[item]}
      draft={draft}
      bookings={[]}
      setDraft={vi.fn()}
      hasCapacityConflict={() => false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      canBuy
    />,
  );
}

test("physical billboards omit digital loop-time metrics", () => {
  renderBooking({ ...baseItem, format: "static", deliveryMode: "static" });

  expect(screen.queryByText("Your time each cycle")).not.toBeInTheDocument();
  expect(screen.queryByText("Time still free")).not.toBeInTheDocument();
  expect(screen.queryByText("Time already booked")).not.toBeInTheDocument();
  expect(screen.getByText("Total cost")).toBeInTheDocument();
  expect(screen.getByText("How long it runs")).toBeInTheDocument();
  expect(screen.getByText("Estimated views")).toBeInTheDocument();
  expect(screen.getByText("Available")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();

  fireEvent.change(screen.getByLabelText("Add artwork now (optional)"), {
    target: { files: [new File(["image"], "billboard.png", { type: "image/png" })] },
  });

  expect(screen.getByText("billboard.png")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();
});

test("physical billboard requests outside the owner-defined dates are unavailable", () => {
  renderBooking({ ...baseItem, format: "static", deliveryMode: "static", availableFrom: "2026-08-01", availableTo: "2026-08-31" });

  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeDisabled();
  expect(screen.queryByText("Fully booked")).not.toBeInTheDocument();
});

test("booking rejects non-image creative files before submission", () => {
  renderBooking(baseItem);

  fireEvent.change(screen.getByLabelText("Add artwork now (optional)"), {
    target: { files: [new File(["not an image"], "creative.pdf", { type: "application/pdf" })] },
  });

  expect(screen.getByRole("alert")).toHaveTextContent("Choose a PNG, JPEG, or GIF image.");
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeDisabled();
});

test("digital bookings accept animated GIF creative", () => {
  renderBooking(baseItem);

  fireEvent.change(screen.getByLabelText("Add artwork now (optional)"), {
    target: { files: [new File(["GIF89a"], "animated.gif", { type: "image/gif" })] },
  });

  expect(screen.getByText("animated.gif")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();
});

test("physical billboard bookings do not accept animated GIF creative", () => {
  renderBooking({ ...baseItem, format: "static", deliveryMode: "static" });

  fireEvent.change(screen.getByLabelText("Add artwork now (optional)"), {
    target: { files: [new File(["GIF89a"], "animated.gif", { type: "image/gif" })] },
  });

  expect(screen.getByRole("alert")).toHaveTextContent("Choose a PNG or JPEG image.");
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeDisabled();
});

test("digital screens retain loop-time metrics", () => {
  renderBooking(baseItem);

  expect(screen.getByText("Your time each cycle")).toBeInTheDocument();
  expect(screen.getByText("Time still free")).toBeInTheDocument();
  expect(screen.getByText("Time already booked")).toBeInTheDocument();
});

test("a date request can be sent before artwork and keeps loop settings optional", async () => {
  const onSubmit = vi.fn().mockResolvedValue(true);
  renderBooking(baseItem, onSubmit);

  expect(screen.queryByLabelText("Showings per cycle")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(null));
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  expect(screen.getByRole("spinbutton", { name: /Showings per cycle/ })).toHaveValue(1);
});

test("strict campaign creation defers artwork to the third step", async () => {
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(
    <BookingView
      item={baseItem}
      inventory={[baseItem]}
      draft={draft}
      bookings={[]}
      setDraft={vi.fn()}
      hasCapacityConflict={() => false}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      canBuy
      allowCreativeUpload={false}
    />,
  );

  expect(screen.queryByLabelText("Add artwork now (optional)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue to make your ad" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(null));
});

test("campaign creation can only leave through create or cancel", () => {
  const onCancel = vi.fn();
  renderBooking(baseItem, vi.fn().mockResolvedValue(true), onCancel);

  expect(screen.getByRole("button", { name: "Create campaign" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel campaign" }));

  expect(onCancel).toHaveBeenCalledOnce();
});

test("cancel is unavailable while campaign creation is being committed", async () => {
  let finishCreation: ((value: boolean) => void) | undefined;
  const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => { finishCreation = resolve; }));
  renderBooking(baseItem, onSubmit);

  fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
  expect(screen.getByRole("button", { name: "Cancel campaign" })).toBeDisabled();

  finishCreation?.(true);
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel campaign" })).toBeEnabled());
});

test("campaign dates in the past block submission and explain how to continue", () => {
  vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
  const onSubmit = vi.fn();
  renderBooking(baseItem, onSubmit);

  const submit = screen.getByRole("button", { name: "Create campaign" });
  expect(submit).toBeDisabled();
  expect(submit).toHaveAccessibleDescription("Choose a start date today or later. Campaigns cannot start in the past.");
  fireEvent.click(submit);
  expect(onSubmit).not.toHaveBeenCalled();
});

test("campaign dates starting today allow submission", () => {
  vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
  renderBooking(baseItem);

  expect(screen.getByLabelText("Start date")).toHaveAttribute("min", draft.start);
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();
});

test("legacy static-format inventory also omits loop-time metrics", () => {
  renderBooking({ ...baseItem, format: "static", deliveryMode: undefined });

  expect(screen.queryByText("Your time each cycle")).not.toBeInTheDocument();
  expect(screen.queryByText("Time still free")).not.toBeInTheDocument();
  expect(screen.queryByText("Time already booked")).not.toBeInTheDocument();
});

function StatefulBooking({ item = baseItem, initial = draft, availability = null, onSubmit = vi.fn().mockResolvedValue(true) }: { item?: InventoryItem; initial?: BookingDraft; availability?: import("../app/lib/booking-schedule").ScreenAvailability | null; onSubmit?: () => Promise<boolean> }) {
  const [current, setCurrent] = useState<BookingDraft>(initial);
  return (
    <>
      <output data-testid="draft">{JSON.stringify(current)}</output>
      <BookingView item={item} inventory={[item]} draft={current} bookings={[]} setDraft={setCurrent} hasCapacityConflict={() => false} onSubmit={onSubmit} onCancel={vi.fn()} canBuy loadAvailability={async () => availability} />
    </>
  );
}

const readDraft = () => JSON.parse(screen.getByTestId("draft").textContent ?? "{}") as BookingDraft;

test("a length preset sets the end date from the start date", () => {
  render(<StatefulBooking />);

  fireEvent.click(screen.getByRole("button", { name: "2 weeks" }));

  expect(readDraft()).toMatchObject({ start: "2026-07-10", end: "2026-07-23" });
  expect(screen.getByRole("button", { name: "2 weeks" })).toHaveAttribute("aria-pressed", "true");
});

test("picking a calendar day moves the start and keeps the run length", () => {
  render(<StatefulBooking />);

  fireEvent.click(screen.getByRole("button", { name: /July 14: Space open/ }));

  expect(readDraft()).toMatchObject({ start: "2026-07-14", end: "2026-07-16" });
});

test("time-of-day slots narrow the booking, change the price, and return to all day when cleared", () => {
  render(<StatefulBooking />);
  // 500 a day x 1.25 x 3 days.
  expect(screen.getByText("Total cost").nextSibling).toHaveTextContent("1,875");

  fireEvent.click(screen.getByRole("button", { name: /Morning/ }));
  expect(readDraft().dayparts).toEqual(["morning"]);
  expect(screen.getByRole("button", { name: /All day/ })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Total cost").nextSibling).toHaveTextContent("469");
  expect(screen.getByText("On screen each day").nextSibling).toHaveTextContent("4 hours");

  fireEvent.click(screen.getByRole("button", { name: /Morning/ }));
  expect(readDraft().dayparts).toEqual([]);
  expect(screen.getByRole("button", { name: /All day/ })).toHaveAttribute("aria-pressed", "true");
});

test("a billboard has no time-of-day slots", () => {
  render(<StatefulBooking item={{ ...baseItem, format: "static", deliveryMode: "static" }} />);

  expect(screen.queryByRole("group", { name: "Time of day" })).not.toBeInTheDocument();
  expect(screen.queryByText("Time of day")).not.toBeInTheDocument();
});

test("budget-first planning sets the dates the budget pays for and blocks a budget below one day", async () => {
  render(<StatefulBooking />);

  fireEvent.click(screen.getByRole("button", { name: "Start from a budget" }));
  // The budget starts from the current quote, so the dates stay.
  expect(screen.getByLabelText("Your budget (CAD)")).toHaveValue(1875);

  fireEvent.change(screen.getByLabelText("Your budget (CAD)"), { target: { value: "5000" } });
  // 625 a day: eight whole days, from July 10 to July 17.
  await waitFor(() => expect(readDraft()).toMatchObject({ start: "2026-07-10", end: "2026-07-17" }));
  expect(screen.getByText(/Your budget covers 8 days/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();

  fireEvent.change(screen.getByLabelText("Your budget (CAD)"), { target: { value: "100" } });
  expect(screen.getByText(/This budget does not cover one day/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeDisabled();

  // Fewer hours make the same budget last.
  fireEvent.click(screen.getByRole("button", { name: /Overnight/ }));
  await waitFor(() => expect(screen.getByText(/Your budget covers 1 day/)).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();
});

test("a full screen offers the next open dates of the same length", async () => {
  const availability = {
    inventoryId: baseItem.id, deliveryMode: "digital" as const, timeZone: "America/Toronto", slotSeconds: 6, loopSeconds: 120, capacitySeconds: 12,
    availableFrom: baseItem.availableFrom, availableTo: baseItem.availableTo,
    commitments: [{ start: "2026-07-01", end: "2026-07-14", seconds: 12 }],
  };
  render(<StatefulBooking availability={availability} />);

  await waitFor(() => expect(screen.getByText(/This screen is full for these dates/)).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /July 12: Full/ })).toBeInTheDocument();
  expect(screen.getByText(/Next open dates/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Use these dates" }));

  expect(readDraft()).toMatchObject({ start: "2026-07-15", end: "2026-07-17" });
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();
});

test("a full evening leaves the morning open", async () => {
  const availability = {
    inventoryId: baseItem.id, deliveryMode: "digital" as const, timeZone: "America/Toronto", slotSeconds: 6, loopSeconds: 120, capacitySeconds: 12,
    availableFrom: baseItem.availableFrom, availableTo: baseItem.availableTo,
    commitments: [{ start: "2026-07-01", end: "2026-07-31", seconds: 12, dayparts: ["evening" as const] }],
  };
  render(<StatefulBooking availability={availability} initial={{ ...draft, dayparts: ["evening"] }} />);

  await waitFor(() => expect(screen.getByText(/This screen is full at these times/)).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /Evening/ }));
  fireEvent.click(screen.getByRole("button", { name: /Morning/ }));

  expect(readDraft().dayparts).toEqual(["morning"]);
  expect(screen.getByRole("button", { name: "Create campaign" })).toBeEnabled();
});
