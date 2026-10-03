/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
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

  test("static campaigns require artwork and cannot switch back to a template or digital format", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    const preview = vi.fn(previewResponse);
    vi.stubGlobal("fetch", preview);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:artwork");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<CreativeHarness onSubmit={onSubmit} items={[{ ...inventory[0], format: "static", deliveryMode: "static" }]} />);

    expect(screen.getByRole("heading", { name: "Upload media" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fixed template" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Template HTML" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Format")).toHaveValue("Static Billboard");
    expect(screen.getByLabelText("Format")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Width")).toHaveValue(5760);
    expect(screen.getByLabelText("Height")).toHaveValue(1440);
    expect(screen.getByLabelText("Width")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Height")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Submit upload for review" })).toBeDisabled();
    expect(screen.getByLabelText("Billboard artwork")).toHaveAttribute("accept", "image/png,image/jpeg,application/pdf");
    expect(preview).not.toHaveBeenCalled();

    const file = new File(["%PDF-1.7 artwork"], "print.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Billboard artwork"), file);
    expect(screen.getByRole("button", { name: "Submit upload for review" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Submit upload for review" }));
    expect(onSubmit).toHaveBeenCalledWith(bookings[0].id, "upload", file);
  });

  test("switching from a digital campaign to a static one removes the template path", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", previewResponse);
    render(<CreativeHarness onSubmit={vi.fn()} items={[inventory[0], { ...inventory[0], id: "INV-STATIC", format: "static", deliveryMode: "static" }]} campaigns={[bookings[0], { ...bookings[0], id: "BK-STATIC", inventoryId: "INV-STATIC", campaign: "Printed campaign" }]} />);
    expect(screen.getByLabelText("Format")).toHaveValue("Digital Screen");
    expect(screen.getByLabelText("Format")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Width")).toHaveValue(1920);
    expect(screen.getByLabelText("Width")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Height")).toHaveValue(1080);
    expect(screen.getByLabelText("Height")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Fixed template" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Campaign" }), "BK-STATIC");
    expect(screen.queryByRole("button", { name: "Fixed template" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toHaveValue(5760);
    expect(screen.getByRole("button", { name: "Submit upload for review" })).toBeDisabled();
  });

  test("shows the specific submission error and keeps the selected artwork for retry", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => { throw new Error("Physical billboard is unavailable for those dates"); });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:artwork");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<CreativeHarness onSubmit={onSubmit} items={[{ ...inventory[0], format: "static", deliveryMode: "static" }]} />);
    const file = new File(["artwork"], "print.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Billboard artwork"), file);
    await user.click(screen.getByRole("button", { name: "Submit upload for review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Physical billboard is unavailable for those dates");
    expect(screen.queryByText("Creative submission failed. Please check the requirements and try again.")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Billboard artwork") as HTMLInputElement).files?.[0]).toBe(file);
  });

  test("static uploads reject video even if the file picker filter is bypassed", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:video");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<CreativeHarness onSubmit={vi.fn()} items={[{ ...inventory[0], format: "static", deliveryMode: "static" }]} />);
    fireEvent.change(screen.getByLabelText("Billboard artwork"), { target: { files: [new File(["video"], "ad.mp4", { type: "video/mp4" })] } });
    expect(screen.getByRole("button", { name: "Submit upload for review" })).toBeDisabled();
  });

  test("creation can be cancelled without valid artwork", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn(async () => true);
    render(<CreativeHarness onSubmit={vi.fn()} onCancel={onCancel} lockBookingSelection items={[{ ...inventory[0], format: "static", deliveryMode: "static" }]} />);
    const cancel = screen.getByRole("button", { name: "Cancel campaign" });
    expect(cancel).toBeEnabled();
    expect(screen.getByRole("button", { name: "Submit upload for review" })).toBeDisabled();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledWith(bookings[0].id);
  });

  test("editing an existing campaign labels the exit as Cancel editing", () => {
    vi.stubGlobal("fetch", previewResponse);
    render(<CreativeHarness onSubmit={vi.fn()} onCancel={vi.fn(async () => true)} />);
    expect(screen.getByRole("button", { name: "Cancel editing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel campaign" })).not.toBeInTheDocument();
  });

  test("cancel is disabled during creative submission", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", previewResponse);
    let complete!: (result: boolean) => void;
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => { complete = resolve; }));
    const onCancel = vi.fn(async () => true);
    render(<CreativeHarness onSubmit={onSubmit} onCancel={onCancel} lockBookingSelection />);
    await screen.findByTitle("Template preview");
    await user.click(screen.getByRole("button", { name: "Submit template for review" }));
    expect(screen.getByRole("button", { name: "Cancel campaign" })).toBeDisabled();
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => complete(true));
  });

  test("cancellation blocks submission and shows failures without losing the draft", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", previewResponse);
    let fail!: (error: Error) => void;
    const onCancel = vi.fn(() => new Promise<boolean>((_resolve, reject) => { fail = reject; }));
    render(<CreativeHarness onSubmit={vi.fn()} onCancel={onCancel} lockBookingSelection />);
    await screen.findByTitle("Template preview");
    const editor = screen.getByRole("textbox", { name: "Template HTML" });
    const html = (editor as HTMLTextAreaElement).value;
    const cancel = screen.getByRole("button", { name: "Cancel campaign" });
    await user.click(cancel);
    expect(screen.getByRole("button", { name: "Submit template for review" })).toBeDisabled();
    expect(cancel).toBeDisabled();
    await act(async () => fail(new Error("Only unpaid pending campaigns can be cancelled.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only unpaid pending campaigns can be cancelled.");
    expect(editor).toHaveValue(html);
    expect(cancel).toBeEnabled();
  });
});

function CreativeHarness({ onSubmit, onCancel, lockBookingSelection = false, items = inventory, campaigns = bookings }: { onSubmit: Parameters<typeof CreativeView>[0]["onSubmit"]; onCancel?: Parameters<typeof CreativeView>[0]["onCancel"]; lockBookingSelection?: boolean; items?: InventoryItem[]; campaigns?: Booking[] }) {
  const [creativeDraft, setCreativeDraft] = useState(draft);
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0].id);

  return (
    <CreativeView
      draft={creativeDraft}
      setDraft={setCreativeDraft}
      bookings={campaigns}
      inventory={items}
      creatives={[]}
      onSubmit={onSubmit}
      onCancel={onCancel}
      canSubmit
      selectedBookingId={selectedBookingId}
      setSelectedBookingId={setSelectedBookingId}
      lockBookingSelection={lockBookingSelection}
    />
  );
}
