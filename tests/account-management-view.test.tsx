/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import AccountManagementView from "../app/component/account-management-view";
import type { Booking, InventoryItem } from "../app/data";
import type { DbUser } from "../app/lib/db";

const user: DbUser = {
  id: "USR-ADVERTISER",
  name: "Northern Coffee",
  email: "buy@northerncoffee.example",
  role: "advertiser",
  status: "active",
  institutionId: null,
  operatorLimit: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const inventory: InventoryItem[] = [{
  id: "INV-ACCOUNT-1", name: "King Street Board", operator: "MetroScreens", format: "digital", x: 50, y: 50,
  address: "1 King Street", price: 500, impressions: 100000, traffic: 80000, income: 90000, audience: "Commuters",
  competitor: "Low", occupancy: 10, imageInterval: 6, maxLoopSeconds: 120, availableFrom: "2026-07-01", availableTo: "2026-08-01",
}];

const bookings: Booking[] = [{
  id: "BK-ACCOUNT-1", advertiser: user.name, inventoryId: inventory[0].id, campaign: "Iced Coffee Launch", start: "2026-07-10", end: "2026-07-20",
  adSlots: 1, creativeStatus: "pending review", status: "creative review", spend: 1000, paid: true, pop: 0, createdBy: user.id,
}];

test("admin can inspect and update a selected non-admin account", async () => {
  const onUpdateAccount = vi.fn().mockResolvedValue(true);
  const userEventInstance = userEvent.setup();
  render(
    <AccountManagementView
      users={[user]}
      bookings={bookings}
      inventory={inventory}
      creatives={[]}
      mediaResources={[]}
      onCreateAccount={vi.fn()}
      onUpdateAccount={onUpdateAccount}
      onDeleteAccount={vi.fn().mockResolvedValue(true)}
    />,
  );

  expect(screen.getByText("Iced Coffee Launch")).toBeInTheDocument();
  await userEventInstance.selectOptions(screen.getByLabelText("Account access"), "banned");
  await userEventInstance.click(screen.getByRole("button", { name: "Save account" }));

  expect(onUpdateAccount).toHaveBeenCalledWith(user.id, { role: "advertiser", status: "banned", institutionId: null, operatorLimit: 5 });
});

test("super admin can filter accounts by searchable details and role", async () => {
  const userEventInstance = userEvent.setup();
  const institutionalUser: DbUser = { ...user, id: "USR-INSTITUTION", name: "Civic Media", email: "ops@civic.example", role: "institutional", operatorLimit: 5 };
  render(
    <AccountManagementView
      users={[user, institutionalUser]}
      bookings={[]}
      inventory={inventory}
      creatives={[]}
      mediaResources={[]}
      onCreateAccount={vi.fn()}
      onUpdateAccount={vi.fn().mockResolvedValue(true)}
      onDeleteAccount={vi.fn().mockResolvedValue(true)}
    />,
  );

  await userEventInstance.type(screen.getByLabelText("Search accounts"), "civic");
  expect(screen.getAllByText("Civic Media")).toHaveLength(2);
  expect(screen.queryByText("Northern Coffee")).not.toBeInTheDocument();

  await userEventInstance.clear(screen.getByLabelText("Search accounts"));
  await userEventInstance.selectOptions(screen.getByLabelText("Filter by role"), "advertiser");
  expect(screen.getAllByText("Northern Coffee")).toHaveLength(2);
  expect(screen.queryByText("Civic Media")).not.toBeInTheDocument();
});
