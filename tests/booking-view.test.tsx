/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
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

  expect(onSubmit).toHaveBeenCalledWith(null);
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

test("legacy static-format inventory also omits loop-time metrics", () => {
  renderBooking({ ...baseItem, format: "static", deliveryMode: undefined });

  expect(screen.queryByText("Your time each cycle")).not.toBeInTheDocument();
  expect(screen.queryByText("Time still free")).not.toBeInTheDocument();
  expect(screen.queryByText("Time already booked")).not.toBeInTheDocument();
});
