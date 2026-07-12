/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import ContentLibraryView from "../app/component/content-library-view";
import type { Booking, Creative, InventoryItem, MediaResource } from "../app/data";

const inventory: InventoryItem[] = [{ id: "INV-CMS", name: "CMS Screen", operator: "Operator", format: "digital", x: 50, y: 50, address: "1 Main St", price: 500, impressions: 100000, traffic: 80000, income: 90000, audience: "Commuters", competitor: "Low", occupancy: 30, imageInterval: 8, maxLoopSeconds: 120, availableFrom: "2026-01-01", availableTo: "2026-12-31", approvalStatus: "approved" }];
const booking: Booking = { id: "BK-CMS", advertiser: "Advertiser", inventoryId: "INV-CMS", campaign: "Summer Launch", start: "2026-07-01", end: "2026-07-31", adSlots: 1, creativeStatus: "pending review", status: "creative review", spend: 1000, paid: false, pop: 42, createdBy: "USR-ADV" };
const creative: Creative = { id: "CRV-CMS", bookingId: "BK-CMS", source: "template", template: "retail", format: "digital", width: 1920, height: 1080, fileType: "png", fileSize: 10, safeZone: 8, distortion: 0, originalName: null, mimeType: null, publicUrl: null, status: "pending review", createdAt: "2026-07-10T10:00:00.000Z" };
const media: MediaResource = { id: "MED-CMS", inventoryId: "INV-CMS", ownerId: "USR-OP", title: "Welcome Video", originalName: "welcome.mp4", mimeType: "video/mp4", mediaType: "video", sizeBytes: 100, publicUrl: "/media/MED-CMS", createdAt: "2026-07-09T10:00:00.000Z" };
const operator = { id: "USR-OP", name: "Operator", email: "operator@example.com", role: "operator" as const, status: "active" as const, institutionId: "INST-1", operatorLimit: 0, createdAt: "2026-01-01T00:00:00.000Z" };

test("content library visualizes account resources and filters by status", async () => {
  const user = userEvent.setup();
  render(<ContentLibraryView currentUser={operator} inventory={inventory} bookings={[booking]} creatives={[creative]} mediaResources={[media]} onDeleteMedia={vi.fn(async () => true)} onOpenCreative={vi.fn()} onOpenInventory={vi.fn()} />);

  expect(screen.getAllByText("Summer Launch").length).toBeGreaterThan(0);
  expect(screen.getByText("Welcome Video")).toBeInTheDocument();
  expect(screen.getAllByText("In review").length).toBeGreaterThan(0);
  expect(screen.getByText("Published")).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Filter by status"), "review");
  expect(screen.getAllByText("Summer Launch").length).toBeGreaterThan(0);
  expect(screen.queryByText("Welcome Video")).not.toBeInTheDocument();
});

test("operator can remove a selected device resource", async () => {
  const user = userEvent.setup();
  const onDeleteMedia = vi.fn(async () => true);
  render(<ContentLibraryView currentUser={operator} inventory={inventory} bookings={[]} creatives={[]} mediaResources={[media]} onDeleteMedia={onDeleteMedia} onOpenCreative={vi.fn()} onOpenInventory={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: /Welcome Video/ }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(onDeleteMedia).toHaveBeenCalledWith("MED-CMS"));
});
