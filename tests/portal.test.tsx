/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";
import Portal from "../app/component/portal";
import type { DbUser } from "../app/lib/db";
import { defaultFilters } from "../app/utils";

vi.mock("../app/component/maplibre-inventory-map", () => ({
  default: (props: { inventory: InventoryItem[]; variant?: string }) => (
    <div data-inventory-count={props.inventory.length} data-testid="inventory-map" data-variant={props.variant} />
  ),
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
      selectedLocation={{ x: 50, y: 50 }}
      filters={defaultFilters}
      launch={vi.fn()}
      selectFormat={vi.fn()}
      currentUser={currentUser}
    />,
  );
}

describe("portal institutional entry", () => {
  test.each([users.institutional, users.admin, users.advertiser, users.operator, null])("shows the public institution overview entry at the end of the landing page", (user) => {
    renderPortal(user);

    const header = screen.getByRole("banner");
    expect(within(header).queryByRole("link", { name: /institution|public screen/i })).not.toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "Operator Portal" })).not.toBeInTheDocument();
    expect(screen.getByText("Government, institutions, and large networks")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View workspace details" })).toHaveAttribute("href", "/government/about");
    expect(screen.getByRole("main").lastElementChild).toHaveClass("portal-institution-gateway");
  });
});

describe("portal availability map", () => {
  test("uses the simplified portal variant without campaign overlays", () => {
    renderPortal(null);

    expect(screen.getByTestId("inventory-map")).toHaveAttribute("data-variant", "portal");
    expect(screen.getByTestId("inventory-map")).toHaveAttribute("data-inventory-count", "1");
    expect(screen.queryByText("Audience match")).not.toBeInTheDocument();
    expect(screen.queryByText("Creative status")).not.toBeInTheDocument();
  });

  test("excludes unavailable physical billboards from the availability count and map", () => {
    const unavailableStatic = {
      ...inventory[0],
      id: "INV-STATIC-UNAVAILABLE",
      name: "Unavailable Billboard",
      format: "static" as const,
      deliveryMode: "static" as const,
      availableFrom: "2000-01-01",
      availableTo: "2001-01-01",
    };
    render(
      <Portal
        inventory={[inventory[0], unavailableStatic]}
        bookings={[]}
        selectedLocation={{ x: 50, y: 50 }}
        filters={defaultFilters}
        launch={vi.fn()}
        selectFormat={vi.fn()}
        currentUser={null}
      />,
    );

    expect(screen.getByText("1 available units")).toBeInTheDocument();
    expect(screen.getByTestId("inventory-map")).toHaveAttribute("data-inventory-count", "1");
  });
});
