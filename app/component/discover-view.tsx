"use client";

import "./discover-view.css";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Booking, InventoryItem, businesses, formats } from "../data";
import type { Filters, MapPoint } from "../types";
import { defaultFilters, formatRatio, mapDistanceKm, money, number } from "../utils";
import FiltersPanel from "./filters-panel";
import MapLibreInventoryMap from "./maplibre-inventory-map";
import PlacePanel from "./place-panel";
import { Meter, Metric, PanelHeading } from "./shared-ui";

export default function DiscoverView(props: {
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
  selectedLocation: MapPoint;
  onAreaChange: (point: { x: number; y: number }) => void;
  mapZoom?: number;
  locationOptions: MapPoint[];
  selectedInventory: InventoryItem;
  selectedInventoryId: string;
  setSelectedInventoryId: (id: string) => void;
  visibleInventory: (InventoryItem & { distance: number })[];
  inventory: InventoryItem[];
  bookings: Booking[];
  onBook: () => void;
  canComment?: boolean;
}) {
  const [openPlaceId, setOpenPlaceId] = useState<string | null>(null);
  const openPlace = openPlaceId ? props.inventory.find((item) => item.id === openPlaceId) ?? null : null;
  return (
    <section className="grid discover-grid">
      <div className="panel filters-panel">
        <PanelHeading eyebrow="Spatial filters" title="Discovery" action={<button className="ghost-button" type="button" onClick={() => props.setFilters(defaultFilters)}>Reset</button>} />
        <FiltersPanel {...props} />
      </div>
      <div className="map-stage">
        <MapLibreInventoryMap
          inventory={props.inventory}
          visibleInventory={props.visibleInventory}
          selectedInventoryId={props.selectedInventoryId}
          selectedLocation={props.selectedLocation}
          radius={props.filters.radius}
          showCompetitors={props.filters.showCompetitors}
          onAreaChange={props.onAreaChange}
          initialZoom={props.mapZoom}
          onSelect={props.setSelectedInventoryId}
          onMarkerOpen={(itemId) => { props.setSelectedInventoryId(itemId); setOpenPlaceId(itemId); }}
        />
      </div>
      <div className="panel list-panel">
        <PanelHeading eyebrow="Inventory" title={`${props.visibleInventory.length} matches`} />
        <div className="inventory-list">
          {props.visibleInventory.map((item) => (
            <InventoryCard key={item.id} item={item} selected={item.id === props.selectedInventoryId} onSelect={props.setSelectedInventoryId} />
          ))}
        </div>
      </div>
      <div className="panel detail-panel">
        <InventoryDetail item={props.selectedInventory} bookings={props.bookings} onBook={props.onBook} />
      </div>
      {openPlace ? (
        <PlacePanel item={openPlace} canComment={Boolean(props.canComment)} onClose={() => setOpenPlaceId(null)} />
      ) : null}
    </section>
  );
}

function InventoryCard({ item, selected, onSelect }: { item: InventoryItem & { distance: number }; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button className={`inventory-card ${selected ? "selected" : ""}`} type="button" onClick={() => onSelect(item.id)}>
      <div>
        <strong>{item.name}</strong>
        <span>{item.address}</span>
      </div>
      <div className="card-meta">
        <span>{formats[item.format].label}</span>
        <span>{money(item.price)}/day</span>
      </div>
      {item.tags?.length ? <div className="device-tag-list">{item.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      <Meter value={item.occupancy} />
      <div className="card-stats">
        <span>{number(item.impressions)} impressions</span>
        <span>{Math.round(item.distance)} km</span>
      </div>
    </button>
  );
}

function InventoryDetail({ item, bookings, onBook }: { item: InventoryItem; bookings: Booking[]; onBook: () => void }) {
  const spec = formats[item.format];
  const campaigns = bookings.filter((booking) => booking.inventoryId === item.id);
  return (
    <>
      <PanelHeading eyebrow={item.operator} title={item.name} action={<button className="primary-button" onClick={onBook}>Book</button>} />
      <div className="detail-grid">
        <Metric label="Format" value={spec.label} />
        <Metric label="Rate" value={`${money(item.price)}/day`} />
        <Metric label="Impressions" value={number(item.impressions)} />
        <Metric label="Traffic" value={number(item.traffic)} />
        <Metric label="Income index" value={money(item.income)} />
        <Metric label="Audience" value={item.audience} />
        <Metric label="Competitors" value={item.competitor} />
        <Metric label="Nearby businesses" value={businesses.filter((business) => mapDistanceKm(item, business) < 13).length} />
      </div>
      <div className="spec-box">
        <strong>Creative spec</strong>
        <span>{spec.spec}</span>
        <span>Aspect ratio {formatRatio(spec.ratio)} with {spec.safeZone}% safe zone.</span>
      </div>
      {item.tags?.length ? <div className="device-tag-list detail-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      <div className="timeline">
        {campaigns.length ? campaigns.map((booking) => (
          <div key={booking.id}>
            <span>{booking.start} to {booking.end}</span>
            <strong>{booking.campaign}</strong>
            <small>{booking.status}</small>
          </div>
        )) : (
          <div>
            <span>No confirmed bookings</span>
            <strong>Available</strong>
            <small>{item.availableFrom} to {item.availableTo}</small>
          </div>
        )}
      </div>
    </>
  );
}
