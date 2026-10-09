/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";
import type { DbUser } from "../app/lib/db";
import { Sidebar, Topbar } from "../app/component/dashboard-shell";

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
  {
    id: "INV-2",
    name: "Transit Panel",
    operator: "Transit Media",
    format: "transit",
    x: 60,
    y: 45,
    address: "2 Station Rd",
    price: 300,
    impressions: 60000,
    traffic: 50000,
    income: 70000,
    audience: "Students",
    competitor: "Medium",
    occupancy: 80,
    imageInterval: 6,
    maxLoopSeconds: 90,
    availableFrom: "2026-07-01",
    availableTo: "2026-08-01",
  },
];

const bookings: Booking[] = [
  {
    id: "BK-1",
    advertiser: "Pulse Athletic",
    inventoryId: "INV-1",
    campaign: "Summer Launch",
    start: "2026-07-01",
    end: "2026-07-14",
    adSlots: 1,
    creativeStatus: "approved",
    status: "scheduled",
    spend: 1500,
    paid: true,
    pop: 25,
  },
];

const adminUser: DbUser = {
  id: "USR-1",
  name: "Admin User",
  email: "admin@example.test",
  role: "admin",
  status: "active",
  institutionId: null,
  operatorLimit: 0,
  createdAt: "2026-06-19T00:00:00.000Z",
};

const institutionUser: DbUser = {
  id: "USR-CIVIC",
  name: "Civic Media Group",
  email: "ops@civic.example",
  role: "institutional",
  status: "active",
  institutionId: null,
  operatorLimit: 3,
  createdAt: "2026-06-19T00:00:00.000Z",
};

describe("dashboard shell", () => {
  test("Topbar summarizes inventory and booking metrics", () => {
    render(<Topbar view="discover" visibleCount={2} inventory={inventory} bookings={bookings} />);

    expect(screen.getByRole("heading", { name: "Map-based inventory search" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });

  test("Topbar handles an empty inventory database without NaN", () => {
    render(<Topbar view="inventory" visibleCount={0} inventory={[]} bookings={[]} />);

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("NaN%")).not.toBeInTheDocument();
  });

  test("network control uses its scoped fleet summary instead of marketplace filter metrics", () => {
    render(<Topbar view="network" visibleCount={0} inventory={inventory} bookings={bookings} />);

    expect(screen.getByRole("heading", { name: "Public screen network control" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Matching units")).not.toBeInTheDocument();
  });

  test("Sidebar lets admins switch role workspaces and updates the active view", async () => {
    const setRole = vi.fn();
    const setView = vi.fn();
    const user = userEvent.setup();

    render(<Sidebar role="admin" view="reports" setRole={setRole} setView={setView} currentUser={adminUser} />);

    const workspace = screen.getByRole("button", { name: "Workspace" });
    expect(screen.getByText("admin@example.test - Super Admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Screen control" })).toHaveAttribute("href", "/?role=admin&view=network");

    await user.click(workspace);
    expect(screen.getByRole("option", { name: "Super Admin" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Institution account" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Operator" }));

    expect(setRole).toHaveBeenCalledWith("operator");
    expect(setView).toHaveBeenCalledWith("inventory");
  });

  test("campaign creation locks workspace and sidebar navigation", () => {
    const advertiserUser = { ...adminUser, role: "advertiser" as const };

    render(<Sidebar role="advertiser" view="booking" setRole={vi.fn()} setView={vi.fn()} currentUser={advertiserUser} navigationLocked />);

    expect(screen.getByRole("button", { name: "Workspace" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(screen.getByText("Home").closest(".nav-item-static")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("Request dates")).not.toBeInTheDocument();
    expect(screen.queryByText("Make an ad")).not.toBeInTheDocument();
  });

  test("advertiser sidebar hides internal creation steps", () => {
    const advertiserUser = { ...adminUser, role: "advertiser" as const };

    render(<Sidebar role="advertiser" view="discover" setRole={vi.fn()} setView={vi.fn()} currentUser={advertiserUser} />);

    expect(screen.getByRole("link", { name: "Find screens" })).toBeInTheDocument();
    expect(screen.queryByText("Request dates")).not.toBeInTheDocument();
    expect(screen.queryByText("Make an ad")).not.toBeInTheDocument();
  });

  test("advertiser buying steps show progress without allowing step jumps", () => {
    render(<Topbar view="booking" visibleCount={2} inventory={inventory} bookings={bookings} role="advertiser" campaignCreationLocked />);

    expect(screen.getByText("Find screens").closest("a")).toBeNull();
    expect(screen.getByText("Request dates").closest("a")).toBeNull();
    expect(screen.getByText("Make an ad").closest("a")).toBeNull();
    expect(screen.getByText("Request dates").parentElement).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Finish creating this campaign, or cancel to return to screen selection.")).toBeInTheDocument();
  });

  test("creative step explains both submission and cancellation in the locked flow", () => {
    render(<Topbar view="creative" visibleCount={2} inventory={inventory} bookings={bookings} role="advertiser" campaignCreationLocked />);

    expect(screen.getByText("Make an ad").parentElement).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Submit your ad for review, or cancel this campaign to return to screen selection.")).toBeInTheDocument();
  });

  test("government surface uses a dedicated civic shell while preserving shared navigation actions", () => {
    const setView = vi.fn();
    render(<Sidebar role="institutional" view="network" setRole={vi.fn()} setView={setView} currentUser={institutionUser} surface="government" />);

    expect(screen.getByText("Civic Screen Operations")).toBeInTheDocument();
    expect(screen.getByText("Institution network")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Civic Screen Operations navigation" })).toBeInTheDocument();
    const commandCentre = screen.getByRole("link", { name: "Command centre" });
    expect(commandCentre).toHaveAttribute("href", "/government?view=network");
    const screensLink = screen.getByRole("link", { name: "Screens" });
    expect(screensLink).toHaveAttribute("href", "/government?view=inventory");
    screensLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    screensLink.click();
    expect(setView).not.toHaveBeenCalled();
    // An institution account has no marketplace to return to.
    expect(screen.queryByRole("link", { name: "Open EasyAD Platform" })).not.toBeInTheDocument();
    expect(document.querySelector('input[name="returnTo"]')).toHaveValue("/government/login");
  });

  test("government navigation leaves out commercial views while every screen is reserved", () => {
    render(<Sidebar role="institutional" view="network" setRole={vi.fn()} setView={vi.fn()} currentUser={institutionUser} surface="government" />);

    for (const name of ["Billing", "Performance", "Schedule", "Advertising"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/government?view=approvals");
  });

  test("government navigation adds one Advertising entry once a screen is open to advertising", () => {
    render(<Sidebar role="institutional" view="network" setRole={vi.fn()} setView={vi.fn()} currentUser={institutionUser} surface="government" showAdvertising />);

    expect(screen.getByRole("link", { name: "Advertising" })).toHaveAttribute("href", "/government?view=advertising");
    expect(screen.queryByRole("link", { name: "Billing" })).not.toBeInTheDocument();
  });

  test("fleet tools get one navigation entry after Emergency updates, and only when switched on", () => {
    const { unmount } = render(<Sidebar role="institutional" view="network" setRole={vi.fn()} setView={vi.fn()} currentUser={institutionUser} surface="government" showFleetTools />);

    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(screen.getByRole("link", { name: "Fleet tools" })).toHaveAttribute("href", "/government?view=fleet");
    expect(links.indexOf("Fleet tools")).toBe(links.indexOf("Emergency updates") + 1);
    unmount();

    render(<Sidebar role="institutional" view="network" setRole={vi.fn()} setView={vi.fn()} currentUser={institutionUser} surface="government" />);
    expect(screen.queryByRole("link", { name: "Fleet tools" })).not.toBeInTheDocument();
  });

  test("an advertiser never sees fleet tools", () => {
    render(<Sidebar role="advertiser" view="discover" setRole={vi.fn()} setView={vi.fn()} currentUser={{ ...adminUser, role: "advertiser" }} showFleetTools />);
    expect(screen.queryByRole("link", { name: "Fleet tools" })).not.toBeInTheDocument();
  });

  test("Super Admin keeps the marketplace link in the government shell", () => {
    render(<Sidebar role="admin" view="network" setRole={vi.fn()} setView={vi.fn()} currentUser={{ ...institutionUser, id: "USR-ADMIN", role: "admin" }} surface="government" />);

    expect(screen.getByRole("link", { name: "Open EasyAD Platform" })).toHaveAttribute("href", "/");
  });

  test("government Topbar counts screen use instead of occupancy and booked value", () => {
    const institutionInventory = inventory.map((item) => ({ ...item, institutionId: "USR-CIVIC", advertisingOptIn: false }));
    render(<Topbar view="inventory" visibleCount={2} inventory={institutionInventory} bookings={bookings} surface="government" />);

    expect(screen.getByRole("heading", { name: "Screens" })).toBeInTheDocument();
    expect(screen.getByText("Institution use only")).toBeInTheDocument();
    expect(screen.queryByText("Average occupancy")).not.toBeInTheDocument();
    expect(screen.queryByText("Booked value")).not.toBeInTheDocument();
  });

  test("government Topbar identifies the command centre session", () => {
    render(<Topbar view="network" visibleCount={1} inventory={inventory} bookings={bookings} surface="government" />);

    expect(screen.getByRole("heading", { name: "Screen network command centre" })).toBeInTheDocument();
    expect(screen.getByText("Authenticated operating session")).toBeInTheDocument();
  });
});
