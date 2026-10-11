/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { DeviceAlert, InventoryItem } from "../app/data";
import InstitutionNetworkView from "../app/component/institution-network-view";
import ScreenSettingsDialog from "../app/component/screen-settings-dialog";

vi.mock("../app/component/maplibre-inventory-map", () => ({
  default: () => <div data-testid="institution-fleet-map">Fleet map</div>,
}));
// Player connection behavior has its own API/component coverage.
vi.mock("../app/component/player-control", () => ({ default: () => null }));

const published: InventoryItem = {
  id: "INV-CIVIC-1",
  name: "City Hall Screen",
  operator: "Civic Communications",
  format: "digital",
  x: 50,
  y: 50,
  address: "100 Main Street, Thunder Bay, ON",
  price: 0,
  impressions: 10000,
  traffic: 8000,
  income: 70000,
  audience: "Residents",
  competitor: "Low",
  occupancy: 20,
  imageInterval: 8,
  maxLoopSeconds: 120,
  availableFrom: "2026-01-01",
  availableTo: "2099-12-31",
  approvalStatus: "approved",
  institutionId: "INST-CIVIC",
  displayTemplate: "fullscreen",
};

const unpublished: InventoryItem = {
  ...published,
  id: "INV-CIVIC-2",
  name: "Library Screen",
  address: "200 Library Lane, Thunder Bay, ON",
  approvalStatus: "pending approval",
};

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof InstitutionNetworkView>> = {}) {
  const onSetPublishState = vi.fn(async (id: string, isPublished: boolean) => ({ value: { ...published, id, approvalStatus: isPublished ? "approved" as const : "pending approval" as const } }));
  const onCreateAlert = vi.fn(async (draft) => ({ value: alertFromDraft(draft) }));
  const props: React.ComponentProps<typeof InstitutionNetworkView> = {
    institutionName: "City of Thunder Bay",
    inventory: [published, unpublished],
    mediaResources: [],
    bookings: [],
    creatives: [],
    alerts: [],
    selectedId: published.id,
    onSelect: vi.fn(),
    onOpenInventory: vi.fn(),
    onUploadMedia: vi.fn(async () => ({ value: true as const })),
    onSetPublishState,
    onCreateAlert,
    onEndAlert: vi.fn(async () => ({ error: "No alert selected" })),
    ...overrides,
  };
  return { ...render(<InstitutionNetworkView {...props} />), onCreateAlert, onSetPublishState };
}

test("institution workspace combines the scoped fleet map with representative screen controls", () => {
  renderWorkspace();

  expect(screen.getByTestId("institution-fleet-map")).toBeInTheDocument();
  expect(screen.getByText("Content preview, not a live camera feed")).toBeInTheDocument();
  expect(screen.getByLabelText("City Hall Screen display preview")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish content" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create emergency override" })).toBeEnabled();
  expect(screen.getByText("Screen delivery only")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Library Screen/ })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("link", { name: "Open device view" })).toHaveAttribute("href", `/devices/${published.id}`);
});

test("screen search matches locations and clears without losing the selected screen", async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await user.type(screen.getByRole("searchbox", { name: "Find a screen" }), "Library Lane");
  expect(screen.getByRole("button", { name: /Library Screen/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: /City Hall Screen/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText("City Hall Screen display preview")).toBeVisible();
  await user.clear(screen.getByRole("searchbox"));
  await user.type(screen.getByRole("searchbox"), "no such screen");
  expect(screen.getByText("No matching screens. Clear the search to see your fleet.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("searchbox")).toHaveFocus();
  expect(screen.getByRole("button", { name: /City Hall Screen/ })).toBeVisible();
});

test("display settings save directly for the selected screen and preserve publishing state", async () => {
  const user = userEvent.setup();
  const onSaveSettings = vi.fn(async () => ({ value: unpublished }));
  renderWorkspace({ inventory: [unpublished], selectedId: unpublished.id, onSaveSettings });
  await user.click(screen.getByRole("button", { name: "Edit display settings" }));
  const dialog = screen.getByRole("dialog", { name: "Edit display settings" });
  await user.selectOptions(within(dialog).getByLabelText("Template"), "community");
  await user.selectOptions(within(dialog).getByLabelText("Display language"), "fr");
  await user.clear(within(dialog).getByLabelText("Image duration (seconds)"));
  await user.type(within(dialog).getByLabelText("Image duration (seconds)"), "12");
  await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledWith(unpublished.id, { displayTemplate: "community", displayLanguage: "fr", imageInterval: 12 }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("invalid display duration focuses the field; failed saves keep the draft for retry", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ value: published });
  const onClose = vi.fn();
  render(<ScreenSettingsDialog screen={published} onSave={onSave} onClose={onClose} />);
  const duration = screen.getByLabelText("Image duration (seconds)");
  await user.clear(duration);
  await user.type(duration, "61");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(duration).toHaveFocus();
  expect(duration).toHaveAttribute("aria-invalid", "true");
  expect(onSave).not.toHaveBeenCalled();
  await user.clear(duration);
  await user.type(duration, "10");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save display settings");
  expect(duration).toHaveValue(10);
  expect(onClose).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

test("closing edited display settings offers an explicit discard choice", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<ScreenSettingsDialog screen={published} onSave={vi.fn()} onClose={onClose} />);
  await user.selectOptions(screen.getByLabelText("Display language"), "fr");
  await user.keyboard("{Escape}");
  expect(screen.getByText("Discard your unsaved display settings?")).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Display language")).toHaveValue("fr");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("physical inventory never offers a standalone device view", () => {
  const staticBillboard = { ...published, format: "static" as const, deliveryMode: "static" as const };
  renderWorkspace({ inventory: [staticBillboard], selectedId: staticBillboard.id });

  expect(screen.queryByRole("link", { name: "Open device view" })).not.toBeInTheDocument();
  expect(screen.getByText("Device view unavailable")).toBeInTheDocument();
});

test("institution content publishes without entering an approval queue", async () => {
  const user = userEvent.setup();
  renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Publish content" }));
  const dialog = await screen.findByRole("dialog", { name: "Publish screen content" });

  expect(within(dialog).getByText("No approval required")).toBeInTheDocument();
  expect(within(dialog).getByText("This content joins the live screen rotation after upload completes.")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Publish content" })).toBeInTheDocument();
});

test("an institution with no devices gets a stable first-action empty state", () => {
  renderWorkspace({ inventory: [], selectedId: "" });

  expect(screen.getByRole("heading", { name: "No screens in this institution" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add a device" })).toBeInTheDocument();
  expect(screen.queryByTestId("institution-fleet-map")).not.toBeInTheDocument();
});

test("publishing state changes require explicit confirmation", async () => {
  const user = userEvent.setup();
  const { onSetPublishState } = renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Unpublish screen" }));
  expect(onSetPublishState).not.toHaveBeenCalled();

  const dialog = await screen.findByRole("dialog", { name: "Unpublish screen" });
  await user.click(within(dialog).getByRole("button", { name: "Unpublish screen" }));

  await waitFor(() => expect(onSetPublishState).toHaveBeenCalledWith(published.id, false));
});

test("authorized institution staff can compose a targeted AMBER screen override", async () => {
  const user = userEvent.setup();
  const { onCreateAlert } = renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Create emergency override" }));
  await user.selectOptions(await screen.findByLabelText("Message type"), "amber");
  await user.type(screen.getByLabelText("Alert headline"), "Missing child in River District");
  await user.type(screen.getByLabelText("Area or location"), "River District");
  await user.type(screen.getByLabelText("Instructions"), "Call emergency services with verified information.");
  await user.click(screen.getByLabelText("I confirm that my agency has authorized this exact message and target scope."));
  await user.click(screen.getByRole("button", { name: "Publish emergency override" }));

  await waitFor(() => expect(onCreateAlert).toHaveBeenCalledWith(expect.objectContaining({
    alertType: "amber",
    title: "Missing child in River District",
    targetDeviceIds: [published.id],
  })));
});

test("Super Admin access scopes emergency targets to the selected institution", async () => {
  const user = userEvent.setup();
  const otherInstitutionScreen: InventoryItem = {
    ...published,
    id: "INV-OTHER-1",
    name: "Regional Office Screen",
    institutionId: "INST-OTHER",
  };
  renderWorkspace({
    isSuperAdmin: true,
    institutionName: "City of Thunder Bay",
    inventory: [published, otherInstitutionScreen],
  });

  expect(screen.getByLabelText("All institution screen networks summary")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create emergency override" }));
  const dialog = await screen.findByRole("dialog", { name: "Create emergency screen override" });

  expect(within(dialog).getByLabelText(/responsible agency has authorized/)).toBeInTheDocument();
  expect(within(dialog).getByText("City Hall Screen")).toBeInTheDocument();
  expect(within(dialog).queryByText("Regional Office Screen")).not.toBeInTheDocument();
});

test("a failed Super Admin override preserves the authorized draft for retry", async () => {
  const user = userEvent.setup();
  let resolveRequest!: (result: { error: string }) => void;
  const onCreateAlert = vi.fn(() => new Promise<{ error: string }>((resolve) => { resolveRequest = resolve; }));
  renderWorkspace({ isSuperAdmin: true, onCreateAlert });

  await user.click(screen.getByRole("button", { name: "Create emergency override" }));
  await user.type(screen.getByLabelText("Alert headline"), "Road closure");
  await user.type(screen.getByLabelText("Area or location"), "Water Street");
  await user.type(screen.getByLabelText("Instructions"), "Use the signed detour until the road reopens.");
  await user.click(screen.getByLabelText(/responsible agency has authorized/));
  await user.click(screen.getByRole("button", { name: "Publish emergency override" }));

  await screen.findByRole("button", { name: "Publishing…" });
  expect(screen.getByLabelText("Alert headline")).toHaveValue("Road closure");
  expect(screen.getByLabelText(/responsible agency has authorized/)).toBeChecked();

  await act(async () => resolveRequest({ error: "The alert service is temporarily unavailable." }));

  expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
  expect(screen.getByLabelText("Alert headline")).toHaveValue("Road closure");
  expect(screen.getByLabelText("Area or location")).toHaveValue("Water Street");
  expect(screen.getByLabelText("Instructions")).toHaveValue("Use the signed detour until the road reopens.");
  expect(screen.getByLabelText(/responsible agency has authorized/)).toBeChecked();
});

test("an incomplete emergency override stays in the dialog and focuses the first invalid field", async () => {
  const user = userEvent.setup();
  const { onCreateAlert } = renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Create emergency override" }));
  await user.click(screen.getByLabelText("I confirm that my agency has authorized this exact message and target scope."));
  await user.click(screen.getByRole("button", { name: "Publish emergency override" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Complete the message");
  expect(screen.getByLabelText("Alert headline")).toHaveFocus();
  expect(onCreateAlert).not.toHaveBeenCalled();
});

function alertFromDraft(draft: Parameters<React.ComponentProps<typeof InstitutionNetworkView>["onCreateAlert"]>[0]): DeviceAlert {
  return {
    id: "ALT-CIVIC-1",
    institutionId: "INST-CIVIC",
    ...draft,
    status: "active",
    issuedBy: "City of Thunder Bay",
    createdBy: "INST-CIVIC",
    createdAt: new Date().toISOString(),
    endedAt: null,
  };
}

test("each institution screen shows its use and the owner can open it to private-sector advertising", async () => {
  const user = userEvent.setup();
  const onSetScreenUse = vi.fn(async (id: string, use: "institution" | "advertising") => ({ value: { ...published, id, advertisingOptIn: use === "advertising" } }));
  renderWorkspace({ onSetScreenUse });

  expect(screen.getByText("All 2 screens are reserved for institution use. No pricing, bookings, or advertiser content apply.")).toBeInTheDocument();
  expect(screen.getByText("Institution use only")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Change screen use" }));
  const dialog = screen.getByRole("dialog", { name: "Screen use" });
  await user.click(within(dialog).getByRole("radio", { name: /Open to private-sector advertising/ }));
  await user.click(within(dialog).getByRole("button", { name: "Save screen use" }));

  await waitFor(() => expect(onSetScreenUse).toHaveBeenCalledWith(published.id, "advertising"));
});

test("a private screen cannot be opened to advertising", async () => {
  const user = userEvent.setup();
  renderWorkspace({ inventory: [{ ...published, contentVisibility: "private" }], onSetScreenUse: vi.fn() });

  await user.click(screen.getByRole("button", { name: "Change screen use" }));
  expect(within(screen.getByRole("dialog", { name: "Screen use" })).getByRole("radio", { name: /Open to private-sector advertising/ })).toBeDisabled();
});

test("the command centre points to Advertising once a screen is opened", async () => {
  const user = userEvent.setup();
  const onOpenAdvertising = vi.fn();
  renderWorkspace({ inventory: [{ ...published, advertisingOptIn: true }, unpublished], onSetScreenUse: vi.fn(), onOpenAdvertising });

  expect(screen.getByText("1 of 2 screens is open to private-sector advertising. Rates, bookings, and billing for it are in Advertising.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open Advertising" }));
  expect(onOpenAdvertising).toHaveBeenCalled();
});

test("screen content and player connection share tabs above the emergency override", async () => {
  const user = userEvent.setup();
  renderWorkspace();

  const emergency = screen.getByRole("region", { name: "Emergency screen override" });
  expect(screen.getByRole("tablist", { name: "Selected screen details" }).compareDocumentPosition(emergency) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  const tabs = screen.getByRole("tablist", { name: "Selected screen details" });
  expect(within(tabs).getByRole("tab", { name: "Screen content" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("region", { name: "Screen content" })).toBeInTheDocument();

  await user.click(within(tabs).getByRole("tab", { name: "Player connection" }));
  expect(within(tabs).getByRole("tab", { name: "Player connection" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("region", { name: "Screen content" })).not.toBeInTheDocument();
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "network-screen-tab-player");

  await user.keyboard("{ArrowLeft}");
  expect(within(tabs).getByRole("tab", { name: "Screen content" })).toHaveFocus();
  expect(screen.getByRole("region", { name: "Screen content" })).toBeInTheDocument();
});

test("without player control the command centre offers no Player connection tab", () => {
  renderWorkspace({ playerControlEnabled: false });
  expect(screen.queryByRole("tab", { name: "Player connection" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Screen content" })).toHaveAttribute("aria-selected", "true");
});

test("the Player connection tab is kept in the address, so a reload opens it again", async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/government?view=network");
  const { unmount } = renderWorkspace();

  await user.click(screen.getByRole("tab", { name: "Player connection" }));
  expect(window.location.search).toBe("?view=network&panel=player");
  unmount();

  renderWorkspace();
  await waitFor(() => expect(screen.getByRole("tab", { name: "Player connection" })).toHaveAttribute("aria-selected", "true"));
  await user.click(screen.getByRole("tab", { name: "Screen content" }));
  expect(window.location.search).toBe("?view=network");
});
