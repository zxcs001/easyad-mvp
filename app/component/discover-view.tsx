"use client";

import "./discover-view.css";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Booking, InventoryItem, businesses, formats } from "../data";
import type { Filters, MapPoint } from "../types";
import { defaultFilters, formatRatio, mapDistanceKm, money, number } from "../utils";
import FiltersPanel from "./filters-panel";
import MapLibreInventoryMap from "./maplibre-inventory-map";
import { PlaceComments } from "./place-panel";
import DeviceScreen, { ScaledDevicePreview } from "./device-screen";
import { deriveScreenCity, resolveDeviceTemplate } from "./device-templates";
import { Meter, Metric, PanelHeading } from "./shared-ui";
import { useI18n } from "../i18n/client";
import { inventoryAvailabilityLabel } from "../lib/inventory-availability";
import { isDigitalInventory, isStaticInventory } from "../lib/inventory-delivery";

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
  const { t } = useI18n();
  return (
    <section className="grid discover-grid">
      <div className="panel filters-panel">
        <FiltersPanel {...props} />
        <button className="ghost-button filters-reset" type="button" onClick={() => props.setFilters(defaultFilters)}>{t("Reset")}</button>
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
          // A pin click does exactly what a list click does: select the screen
          // and update the one detail card. It used to also open a modal over
          // that card, so one click changed two surfaces.
          onMarkerOpen={props.setSelectedInventoryId}
        />
      </div>
      <div className="panel list-panel">
        <PanelHeading eyebrow="Inventory" title={t("{count} matches", { count: props.visibleInventory.length })} />
        <div className="inventory-list">
          {props.visibleInventory.map((item) => (
            <InventoryCard key={item.id} item={item} selected={item.id === props.selectedInventoryId} onSelect={props.setSelectedInventoryId} />
          ))}
        </div>
      </div>
      {/* The dock stretches over the map so the card has a height it can be capped
          against. A percentage max-height on the card itself is ignored for a grid
          item aligned to the end, which let the card run under the search bar. */}
      <div className="detail-dock">
        <div className="panel detail-panel">
          <InventoryDetail item={props.selectedInventory} bookings={props.bookings} onBook={props.onBook} canComment={Boolean(props.canComment)} />
        </div>
      </div>
    </section>
  );
}

function InventoryCard({ item, selected, onSelect }: { item: InventoryItem & { distance: number }; selected: boolean; onSelect: (id: string) => void }) {
  const { locale, formatNumber, t } = useI18n();
  const availability = inventoryAvailabilityLabel(item);
  return (
    <button className={`inventory-card ${selected ? "selected" : ""}`} type="button" onClick={() => onSelect(item.id)}>
      <div>
        <strong>{item.name}</strong>
        <span>{item.address}</span>
      </div>
      <div className="card-meta">
        <span>{t(formats[item.format].label)}</span>
        <span>{t("{amount}/day", { amount: money(item.price, locale) })}</span>
      </div>
      {isStaticInventory(item) ? <span className={`status ${availability === "Available" ? "good" : "bad"}`}>{t(availability)}</span> : null}
      {/* Four tag chips on each of eight cards is 32 chips in a scanning list,
          and the format tag repeats the format line directly above it. The
          list carries what you scan by; the detail panel below still lists
          every tag for the selected screen. */}
      <Meter value={item.occupancy} />
      <div className="card-stats">
        <span>{t("{count} impressions", { count: formatNumber(item.impressions) })}</span>
        <span>{Math.round(item.distance)} km</span>
      </div>
    </button>
  );
}

function InventoryDetail({ item, bookings, onBook, canComment }: { item: InventoryItem; bookings: Booking[]; onBook: () => void; canComment: boolean }) {
  const { locale, formatNumber, t } = useI18n();
  const spec = formats[item.format];
  const campaigns = bookings.filter((booking) => booking.inventoryId === item.id);
  const availability = inventoryAvailabilityLabel(item);
  return (
    <>
      {/* The image of the screen is the screen itself: the same 16:9 frame a
          passer-by sees, clock, weather and all. It replaces a "Photo coming
          soon" placeholder that no data could ever fill. A static billboard shows
          no clock, so it gets no preview. The empty media area says where the
          buyer's ad would play, instead of the operator-facing "No images or
          videos have been uploaded", which stays on the real public screen. */}
      {isDigitalInventory(item) ? (
        <ScaledDevicePreview className="detail-preview">
          <DeviceScreen
            inventoryName={item.name}
            city={deriveScreenCity(item.address)}
            imageInterval={item.imageInterval}
            slides={[]}
            template={resolveDeviceTemplate(undefined, item.displayTemplate)}
            displayLanguage={item.displayLanguage ?? "en"}
            mediaContent={<div className="detail-preview-empty">{t("Your ad plays here")}</div>}
            preview
          />
        </ScaledDevicePreview>
      ) : null}
      <PanelHeading eyebrow={item.operator} title={item.name} action={<button className="primary-button" onClick={onBook}>{t("Request dates")}</button>} />
      <div className="detail-grid stat-tiles">
        <Metric label="Format" value={t(spec.label)} />
        <Metric label="Rate" value={t("{amount}/day", { amount: money(item.price, locale) })} />
        <Metric label="Impressions" value={formatNumber(item.impressions)} />
        <Metric label="Traffic" value={formatNumber(item.traffic)} />
        {isStaticInventory(item) ? <Metric label="Status" value={t(availability)} /> : null}
      </div>
      {/* Income index, audience, competitor presence and nearby-business counts
          are planning figures for a media buyer, not the four numbers a person
          decides a booking on. The full profile still carries every one of
          them, so this defers detail without removing capability. */}
      <a className="detail-profile-link" href={`/inventory/${item.id}`}>{t("See everything about this screen")}</a>
      {/* The card floats over the map, so only the figures a person decides on
          stay open. The production spec and the tags are not carried by the
          profile page, so they are collapsed here rather than removed. */}
      <details className="detail-more">
        <summary>{t("Size, file types and tags")}</summary>
        <div className="spec-box">
          <strong>{t("Creative spec")}</strong>
          <span>{t(spec.spec)}</span>
          <span>{t("Aspect ratio {ratio} with {percent}% safe zone.", { ratio: formatRatio(spec.ratio), percent: spec.safeZone })}</span>
        </div>
        {item.tags?.length ? <div className="device-tag-list detail-tags">{item.tags.map((tag) => <span key={tag}>{t(tag)}</span>)}</div> : null}
      </details>
      <PlaceComments item={item} canComment={canComment} />
      <div className="timeline">
        {campaigns.length ? campaigns.map((booking) => (
          <div key={booking.id}>
            <span>{booking.start} {t("to")} {booking.end}</span>
            <strong>{booking.campaign}</strong>
            <small>{t(booking.status)}</small>
          </div>
        )) : (
          <div>
            <span>{t("No confirmed bookings")}</span>
            <strong>{t(isStaticInventory(item) ? availability : "Available")}</strong>
            <small>{item.availableFrom} {t("to")} {item.availableTo}</small>
          </div>
        )}
      </div>
    </>
  );
}

