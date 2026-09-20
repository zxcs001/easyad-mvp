/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";
import { InventoryView } from "../app/component/operator-views";

const item: InventoryItem = {
  id: "INV-FORM-1",
  name: "Existing Device",
  operator: "Test Operator",
  format: "digital",
  x: 50,
  y: 50,
  address: "1 Existing Way",
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

test("inventory creation waits for explicit form confirmation", async () => {
  const user = userEvent.setup();
  const addInventory = vi.fn().mockResolvedValue(true);

  render(
    <InventoryView
      inventory={[item]}
      selectedId={item.id}
      select={vi.fn()}
      item={item}
      newItem={{ ...item, id: "", name: "New Inventory Unit", address: "New market location" }}
      mediaResources={[]}
      addInventory={addInventory}
      deleteInventory={vi.fn()}
      saveInventory={vi.fn().mockResolvedValue(true)}
      updateInventoryApproval={vi.fn()}
      uploadMedia={vi.fn().mockResolvedValue(true)}
      deleteMediaResource={vi.fn().mockResolvedValue(undefined)}
      canManage
      canDelete={false}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Add device" }));
  expect(addInventory).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Create device" })).toBeInTheDocument();

  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Confirmed Device");

  // A new device needs a real address: its public page says where the screen
  // is, and the city label on the screen preview is read from this value.
  await user.click(screen.getByRole("button", { name: "Create device" }));
  expect(addInventory).not.toHaveBeenCalled();
  expect(screen.getByText("Add the city, so the public page can say where the screen is.")).toBeInTheDocument();

  await user.clear(screen.getByLabelText("Street address"));
  await user.type(screen.getByLabelText("Street address"), "955 Oliver Rd");
  await user.type(screen.getByLabelText("City"), "Thunder Bay");
  await user.selectOptions(screen.getByLabelText("Province or territory"), "ON");
  await user.click(screen.getByRole("button", { name: "Create device" }));

  expect(addInventory).toHaveBeenCalledWith(expect.objectContaining({
    name: "Confirmed Device",
    id: "",
    address: "955 Oliver Rd, Thunder Bay, ON",
  }));
});

test("an existing device with an old address still saves other edits", async () => {
  const user = userEvent.setup();
  const saveInventory = vi.fn().mockResolvedValue(true);

  render(
    <InventoryView
      inventory={[item]}
      selectedId={item.id}
      select={vi.fn()}
      item={item}
      newItem={{ ...item, id: "", name: "New Inventory Unit", address: "" }}
      mediaResources={[]}
      addInventory={vi.fn().mockResolvedValue(true)}
      deleteInventory={vi.fn()}
      saveInventory={saveInventory}
      updateInventoryApproval={vi.fn()}
      uploadMedia={vi.fn().mockResolvedValue(true)}
      deleteMediaResource={vi.fn().mockResolvedValue(undefined)}
      canManage
      canDelete={false}
    />,
  );

  // "1 Existing Way" has no city. The person is editing the price, so the old
  // address must not block the save.
  await user.clear(screen.getByLabelText("Daily rate"));
  await user.type(screen.getByLabelText("Daily rate"), "640");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(saveInventory).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, price: 640 }));
});

test("inventory edits wait for Save changes", async () => {
  const user = userEvent.setup();
  const saveInventory = vi.fn().mockResolvedValue(true);

  render(
    <InventoryView
      inventory={[item]}
      selectedId={item.id}
      select={vi.fn()}
      item={item}
      newItem={{ ...item, id: "", name: "New Inventory Unit", address: "New market location" }}
      mediaResources={[]}
      addInventory={vi.fn().mockResolvedValue(true)}
      deleteInventory={vi.fn()}
      saveInventory={saveInventory}
      updateInventoryApproval={vi.fn()}
      uploadMedia={vi.fn().mockResolvedValue(true)}
      deleteMediaResource={vi.fn().mockResolvedValue(undefined)}
      canManage
      canDelete={false}
    />,
  );

  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Edited Device");
  await user.selectOptions(screen.getByLabelText("Device display language"), "fr");
  expect(saveInventory).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saveInventory).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, name: "Edited Device", displayLanguage: "fr" }));
});

test("empty inventory hides record and media forms until a device draft is started", async () => {
  const user = userEvent.setup();
  render(
    <InventoryView
      inventory={[]}
      selectedId=""
      select={vi.fn()}
      item={{ ...item, id: "", name: "New Inventory Unit" }}
      newItem={{ ...item, id: "", name: "New Inventory Unit", address: "New market location" }}
      mediaResources={[]}
      addInventory={vi.fn().mockResolvedValue(true)}
      deleteInventory={vi.fn()}
      saveInventory={vi.fn().mockResolvedValue(true)}
      updateInventoryApproval={vi.fn().mockResolvedValue(true)}
      uploadMedia={vi.fn().mockResolvedValue(true)}
      deleteMediaResource={vi.fn().mockResolvedValue(undefined)}
      canManage
      canDelete={false}
    />,
  );

  expect(screen.getByText("Add a device first")).toBeInTheDocument();
  expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  expect(screen.queryByText("Images and videos")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Add device" }));
  expect(screen.getByLabelText("Name")).toBeInTheDocument();
  expect(screen.getByText("Images and videos")).toBeInTheDocument();
});

test("public device links are available only for digital inventory", () => {
  const props = {
    inventory: [item],
    selectedId: item.id,
    select: vi.fn(),
    newItem: { ...item, id: "", name: "New Inventory Unit" },
    mediaResources: [],
    addInventory: vi.fn().mockResolvedValue(true),
    deleteInventory: vi.fn(),
    saveInventory: vi.fn().mockResolvedValue(true),
    updateInventoryApproval: vi.fn(),
    uploadMedia: vi.fn().mockResolvedValue(true),
    deleteMediaResource: vi.fn().mockResolvedValue(undefined),
    canManage: true,
    canDelete: false,
  };
  const { rerender } = render(<InventoryView {...props} item={{ ...item, deliveryMode: "digital" }} />);

  expect(screen.getByRole("link", { name: `/devices/${item.id}` })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: `/inventory/${item.id}` })).toBeInTheDocument();

  const staticItem = { ...item, deliveryMode: "static" as const };
  rerender(<InventoryView {...props} inventory={[staticItem]} item={staticItem} />);

  expect(screen.queryByRole("link", { name: `/devices/${item.id}` })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: `/inventory/${item.id}` })).not.toBeInTheDocument();
});

test("a physical billboard exposes only date-derived Available or Unavailable status", () => {
  const staticItem = {
    ...item,
    name: "Physical Billboard",
    format: "static" as const,
    deliveryMode: "static" as const,
    availableFrom: "2000-01-01",
    availableTo: "2001-01-01",
    approvalStatus: "pending approval" as const,
  };
  render(
    <InventoryView
      inventory={[staticItem]}
      selectedId={staticItem.id}
      select={vi.fn()}
      item={staticItem}
      newItem={{ ...staticItem, id: "" }}
      mediaResources={[]}
      addInventory={vi.fn().mockResolvedValue(true)}
      deleteInventory={vi.fn()}
      saveInventory={vi.fn().mockResolvedValue(true)}
      updateInventoryApproval={vi.fn()}
      uploadMedia={vi.fn().mockResolvedValue(true)}
      deleteMediaResource={vi.fn().mockResolvedValue(undefined)}
      canManage
      canDelete={false}
    />,
  );

  expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  expect(screen.queryByText("pending approval")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Availability end"), { target: { value: "2099-01-01" } });
  expect(screen.getByText("Physical billboard status: Available")).toBeInTheDocument();
});
