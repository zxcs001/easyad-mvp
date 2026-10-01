/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";
import CreativeView from "../app/component/creative-view";
import type { CreativeDraft } from "../app/types";

const previewResponse = vi.fn(async (_url: string, options?: RequestInit) => ({
  ok: true,
  json: async () => options?.method === "POST"
    ? { document: "<!doctype html><p>Safe preview</p>" }
    : { examples: { retail: "<!doctype html><p>Retail example</p>", finance: "<!doctype html><p>Finance example</p>", event: "<!doctype html><p>Event example</p>" } },
}));

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
  afterEach(() => vi.unstubAllGlobals());
  test("offers both fixed template and uploaded media production paths", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    vi.stubGlobal("fetch", previewResponse);

    render(<CreativeHarness onSubmit={onSubmit} />);

    expect(screen.getByRole("heading", { name: "Fixed template" })).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "Template HTML" }) as HTMLTextAreaElement).value).toContain("GOOD<br>THINGS");
    expect(screen.getByText("Choose a ready-made design")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retail design: The weekend edit" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Finance design: The next chapter" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Event design: After dark" })).toBeInTheDocument();
    expect(await screen.findByTitle("Retail design example")).toHaveAttribute("sandbox", "");
    expect(await screen.findByTitle("Template preview")).toHaveAttribute("sandbox", "");
    const campaignSelect = screen.getByRole("combobox", { name: "Campaign" });
    expect(within(campaignSelect).getAllByRole("option")).toHaveLength(1);
    expect(within(campaignSelect).queryByRole("option", { name: "Rejected Creative - Former Advertiser" })).not.toBeInTheDocument();
    expect(screen.getByText("Rejected Creative")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upload media" }));

    expect(screen.getByRole("heading", { name: "Upload media" })).toBeInTheDocument();
    expect(screen.getByLabelText("Image or video creative")).toBeInTheDocument();
    expect(screen.getByText("Select a PNG, JPG, GIF, or MP4 file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit upload for review" })).toBeDisabled();
  });

  test("locks the new campaign selected by the previous step", () => {
    vi.stubGlobal("fetch", previewResponse);
    render(<CreativeHarness onSubmit={vi.fn()} lockBookingSelection />);

    expect(screen.getByRole("combobox", { name: "Campaign" })).toBeDisabled();
    expect(screen.getByText("This campaign was created in the previous step.")).toBeInTheDocument();
  });

  test("keeps edits per topic and sends edited HTML to the preview service", async () => {
    const user = userEvent.setup();
    const preview = vi.fn(previewResponse);
    vi.stubGlobal("fetch", preview);
    render(<CreativeHarness onSubmit={vi.fn()} />);
    const editor = screen.getByRole("textbox", { name: "Template HTML" });
    await user.clear(editor);
    await user.type(editor, "<h1>My offer</h1>");
    await screen.findByTitle("Template preview");
    expect(preview).toHaveBeenCalledWith("/api/creative/template-preview", expect.objectContaining({ body: JSON.stringify({ template: "retail", html: "<h1>My offer</h1>" }) }));
    await user.click(screen.getByRole("link", { name: "Finance design: The next chapter" }));
    expect((screen.getByRole("textbox", { name: "Template HTML" }) as HTMLTextAreaElement).value).toContain("Make room<br>for what’s");
    await user.click(screen.getByRole("link", { name: "Retail design: The weekend edit" }));
    expect(screen.getByRole("textbox", { name: "Template HTML" })).toHaveValue("<h1>My offer</h1>");
  });
});

function CreativeHarness({ onSubmit, lockBookingSelection = false }: { onSubmit: Parameters<typeof CreativeView>[0]["onSubmit"]; lockBookingSelection?: boolean }) {
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
      lockBookingSelection={lockBookingSelection}
    />
  );
}
