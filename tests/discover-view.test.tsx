/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";
import DiscoverView from "../app/component/discover-view";
import { defaultFilters } from "../app/utils";

vi.mock("../app/component/maplibre-inventory-map", () => ({
  default: ({ onMarkerOpen }: { onMarkerOpen?: (id: string) => void }) => (
    <button type="button" onClick={() => onMarkerOpen?.("INV-2")}>Map marker</button>
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
    tags: ["urban", "digital"],
  },
  {
    id: "INV-2",
    name: "Airport Digital",
    operator: "MetroScreens",
    format: "digital",
    x: 52,
    y: 52,
    address: "2 Airport Rd",
    price: 620,
    impressions: 150000,
    traffic: 90000,
    income: 98000,
    audience: "Travelers",
    competitor: "Medium",
    occupancy: 30,
    imageInterval: 6,
    maxLoopSeconds: 120,
    availableFrom: "2026-07-01",
    availableTo: "2026-08-01",
    tags: ["airport", "digital", "tag-01", "tag-02", "tag-03", "tag-04", "tag-05", "tag-06", "tag-07", "tag-08", "tag-09", "tag-10", "tag-11", "tag-12", "tag-13", "tag-14"],
  },
];

function DiscoverHarness() {
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedInventoryId, setSelectedInventoryId] = useState("INV-1");
  const visibleInventory = useMemo(
    () => inventory
      .filter((item) => !filters.selectedTags.length || filters.selectedTags.every((tag) => item.tags?.includes(tag)))
      .map((item) => ({ ...item, distance: item.id === "INV-1" ? 1 : 3 })),
    [filters.selectedTags],
  );
  const selectedInventory = visibleInventory.find((item) => item.id === selectedInventoryId) ?? visibleInventory[0] ?? inventory[0];
  return (
    <DiscoverView
      filters={filters}
      setFilters={setFilters}
      selectedLocationId="manual"
      setSelectedLocationId={vi.fn()}
      selectedLocation={{ x: 50, y: 50 }}
      onAreaChange={vi.fn()}
      locationOptions={[{ id: "manual", label: "Selected map area" }]}
      selectedInventory={selectedInventory}
      selectedInventoryId={selectedInventory.id}
      setSelectedInventoryId={setSelectedInventoryId}
      visibleInventory={visibleInventory}
      inventory={inventory}
      bookings={[]}
      onBook={vi.fn()}
    />
  );
}

describe("discover view state", () => {
  test("inventory cards and map markers select internally without changing the URL", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/?role=advertiser&view=discover&itemId=INV-1");
    render(<DiscoverHarness />);
    const originalUrl = window.location.href;

    const airportCard = screen.getByRole("button", { name: /airport digital/i });
    await user.click(airportCard);
    expect(window.location.href).toBe(originalUrl);
    expect(airportCard).toHaveClass("selected");

    await user.click(screen.getByRole("button", { name: "Map marker" }));
    expect(window.location.href).toBe(originalUrl);
  });

  test("spatial filters show every existing tag and use tags to filter inventory", async () => {
    const user = userEvent.setup();
    render(<DiscoverHarness />);

    expect(screen.getByRole("button", { name: "Filter tag airport" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter tag digital" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filter tag urban" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all tags (5 more)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all tags (5 more)" }));

    expect(screen.getByRole("button", { name: "Filter tag tag-14" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter tag urban" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer tags" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filter tag airport" }));

    expect(screen.getByText("1 matches")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Downtown Screen/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Airport Digital/ })).toHaveClass("selected");
  });
});
