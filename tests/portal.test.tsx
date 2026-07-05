/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";
import Portal from "../app/component/portal";
import type { DbUser } from "../app/lib/db";
import { defaultFilters } from "../app/utils";

vi.mock("../app/component/maplibre-inventory-map", () => ({
  default: () => <div data-testid="inventory-map" />,
}));

const inventory: InventoryItem[] = [
  {
    id: "INV-1",
    name: "Downtown Screen",
    operator: "MetroScreens",
    format: "digital",
    x: 50,
    y: 50,
    address: "1 Main St",
    price: 500,
    impressions: 120000,
    traffic: 80000,
    income: 90000,
    audience: "Commuters",
    competitor: "Low",
    occupancy: 40,
    imageInterval: 6,
    maxLoopSeconds: 120,
    availableFrom: "2026-07-01",
    availableTo: "2026-08-01",
  },
];

const users: Record<"institutional" | "admin" | "advertiser" | "operator", DbUser> = {
  institutional: {
    id: "USR-INSTITUTION",
    name: "Civic Media Group",
    email: "ops@civic.example",
    role: "institutional",
    status: "active",
    institutionId: null,
    operatorLimit: 3,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  admin: {
    id: "USR-ADMIN",
    name: "Admin User",
    email: "admin@example.test",
    role: "admin",
    status: "active",
    institutionId: null,
    operatorLimit: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  advertiser: {
    id: "USR-ADVERTISER",
    name: "Advertiser User",
    email: "advertiser@example.test",
    role: "advertiser",
    status: "active",
    institutionId: null,
    operatorLimit: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  operator: {
    id: "USR-OPERATOR",
    name: "Operator User",
    email: "operator@example.test",
    role: "operator",
    status: "active",
    institutionId: "USR-INSTITUTION",
    operatorLimit: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
};

function renderPortal(currentUser: DbUser | null) {
  return render(
    <Portal
      inventory={inventory}
      bookings={[]}
      visibleInventory={[{ ...inventory[0], distance: 0 }]}
      selectedInventoryId={inventory[0].id}
      selectedLocation={{ x: 50, y: 50 }}
      filters={defaultFilters}
      launch={vi.fn()}
      selectFormat={vi.fn()}
      currentUser={currentUser}
    />,
  );
}

describe("portal institutional entry", () => {
  test.each([users.institutional, users.admin])("shows the institutional portal link for $role users", (user) => {
    renderPortal(user);

    expect(screen.getByRole("link", { name: "Institution Portal" })).toHaveAttribute("href", "/?role=institutional&view=inventory");
  });

  test.each([null, users.advertiser, users.operator])("hides the institutional portal link for unauthorized users", (user) => {
    renderPortal(user);

    expect(screen.queryByRole("link", { name: "Institution Portal" })).not.toBeInTheDocument();
  });
});
