/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
  await user.click(screen.getByRole("button", { name: "Create device" }));

  expect(addInventory).toHaveBeenCalledWith(expect.objectContaining({ name: "Confirmed Device", id: "" }));
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
  expect(saveInventory).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saveInventory).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, name: "Edited Device" }));
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
