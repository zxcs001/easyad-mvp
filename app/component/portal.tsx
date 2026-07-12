"use client";

import "./portal.css";
import { Booking, FormatKey, InventoryItem, Role, View, formats } from "../data";
import type { DbUser } from "../lib/db";
import type { Filters } from "../types";
import { money, number, portalHref } from "../utils";
import MapLibreInventoryMap from "./maplibre-inventory-map";
import { Brand, Metric, NavLinkButton, SectionHeading } from "./shared-ui";

export default function Portal({
  inventory,
  bookings,
  visibleInventory,
  selectedInventoryId,
  selectedLocation,
  filters,
  launch,
  selectFormat,
  currentUser,
}: {
  inventory: InventoryItem[];
  bookings: Booking[];
  visibleInventory: (InventoryItem & { distance: number })[];
  selectedInventoryId: string;
  selectedLocation: { x: number; y: number };
  filters: Filters;
  launch: (role: Role, view: View) => void;
  selectFormat: (format: FormatKey) => void;
  currentUser?: DbUser | null;
}) {
  const totalImpressions = inventory.reduce((sum, item) => sum + item.impressions, 0);
  const bookedRevenue = bookings.reduce((sum, booking) => sum + booking.spend, 0);
  const operatorNames = Array.from(new Set(inventory.map((item) => item.operator)));
  const operators = operatorNames.length;
  const canAccessRole = (targetRole: Role) => Boolean(currentUser && (currentUser.role === "admin" || currentUser.role === targetRole));
  const canAccessInstitutionalPortal = currentUser?.role === "admin" || currentUser?.role === "institutional";

  return (
    <div className="portal">
      <header className="portal-nav">
        <Brand subtitle="Self-service outdoor media portal" portal />
        <div className="portal-nav-actions">
          {currentUser ? (
            <>
              <span className="session-chip">{currentUser.name} - {currentUser.role === "admin" ? "Super Admin" : currentUser.role}</span>
              <form action="/api/auth/logout" method="post"><button type="submit">Sign Out</button></form>
            </>
          ) : (
            <>
              <a href="/login">Sign In</a>
              <a href="/signup">Sign Up</a>
            </>
          )}
          <ProtectedPortalLink currentUser={currentUser} role="operator" view="inventory" onLaunch={launch}>Operator Portal</ProtectedPortalLink>
          {canAccessInstitutionalPortal ? (
            <ProtectedPortalLink currentUser={currentUser} role="institutional" view="inventory" onLaunch={launch}>Institution Portal</ProtectedPortalLink>
          ) : null}
          <ProtectedPortalLink className="primary-button" currentUser={currentUser} role="advertiser" view="discover" onLaunch={launch}>Launch Campaign</ProtectedPortalLink>
        </div>
      </header>
      <main>
        <section className="portal-hero">
          <div className="portal-copy">
            <p className="eyebrow pill"><span className="pill-dot" />OOH planning, booking, creative, and proof-of-play</p>
            <h1>Outdoor <span className="hl">Campaign</span> Buying Portal</h1>
            <p>Discover premium digital, static, and transit inventory, target by place and audience, reserve availability, validate creative, and track delivery from the same workspace.</p>
            <div className="portal-actions">
              <ProtectedPortalLink className="primary-button" currentUser={currentUser} role="advertiser" view="discover" onLaunch={launch}>Plan Media Buy</ProtectedPortalLink>
              <ProtectedPortalLink className="ghost-button" currentUser={currentUser} role="operator" view="approvals" onLaunch={launch}>Review Bookings</ProtectedPortalLink>
            </div>
            <div className="portal-stats">
              <Metric label="Available impressions" value={number(totalImpressions)} />
              <Metric label="Operator networks" value={operators} />
              <Metric label="Booked pipeline" value={money(bookedRevenue)} />
            </div>
          </div>
          <div className="portal-visual" aria-label="Marketplace product preview">
            <div className="preview-toolbar">
              <span>Live marketplace</span>
              <strong>{visibleInventory.length} units nearby</strong>
            </div>
            <div className="portal-map-wrap">
              <MapLibreInventoryMap
                inventory={inventory}
                visibleInventory={visibleInventory}
                selectedInventoryId={selectedInventoryId}
                selectedLocation={selectedLocation}
                radius={filters.radius}
                showCompetitors={filters.showCompetitors}
              />
            </div>
            <div className="preview-float top">
              <span>Audience match</span>
              <strong>Professionals + travelers</strong>
            </div>
            <div className="preview-float bottom">
              <span>Creative status</span>
              <strong>5 validations passed</strong>
            </div>
          </div>
        </section>
        {operatorNames.length ? (
          <section className="portal-trust">
            <span className="eyebrow">Live inventory from operator networks</span>
            <div className="trust-logos">
              {operatorNames.map((name) => <span key={name}>{name}</span>)}
            </div>
          </section>
        ) : null}
        <section className="portal-band">
          <SectionHeading eyebrow="Portal paths" title="One front door for every tenant." />
          <div className="portal-paths">
            <PortalPath title="Advertiser" copy="Search inventory, compare audiences, request bookings, submit creative, and monitor results.">
              <ProtectedPortalLink currentUser={currentUser} role="advertiser" view="discover" onLaunch={launch}>Start Buying</ProtectedPortalLink>
            </PortalPath>
            <PortalPath title="Operator" copy="Manage units, calendars, approvals, creative review, proof-of-play logs, and revenue.">
              <ProtectedPortalLink currentUser={currentUser} role="operator" view="inventory" onLaunch={launch}>Open Operations</ProtectedPortalLink>
            </PortalPath>
            <PortalPath title="Admin" copy="Oversee marketplace health, operators, campaign workflow, billing status, and analytics.">
              <ProtectedPortalLink currentUser={currentUser} role="admin" view="reports" onLaunch={launch}>Open Admin</ProtectedPortalLink>
            </PortalPath>
          </div>
        </section>
        <section className="portal-grid-section">
          <SectionHeading eyebrow="Campaign intelligence" title="Target, buy, validate, and verify." />
          <div className="portal-feature-grid">
            {[
              ["Geospatial Discovery", "Map search with radius, nearby businesses, competitor presence, and location-based inventory filtering."],
              ["Audience Filters", "Filter by demographics, traffic volume, impressions, income levels, media format, and operator network."],
              ["Creative Production", "Fixed templates and automated checks for aspect ratio, safe zones, file type, size, and distortion."],
              ["Inventory Control", "Multi-operator database with availability calendars, scheduling workflow, and double-booking protection."],
              ["Proof-of-Play", "Delivery logs and campaign reporting for impressions, reach estimates, verified playback, and effectiveness."],
              ["Billing Ledger", "Invoice-ready campaign spend, payment status, and platform versus operator revenue-share tracking."],
            ].map(([title, copy]) => (
              <article className="portal-feature" key={title}>
                <strong>{title}</strong>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="portal-inventory">
          <SectionHeading eyebrow="Inventory network" title="Plan across formats without leaving the portal." />
          <div className="format-strip">
            {(Object.keys(formats) as FormatKey[]).map((key) => (
              <a
                className={`format-tile ${!canAccessRole("advertiser") ? "locked" : ""}`}
                href={canAccessRole("advertiser") ? `/?role=advertiser&view=discover&format=${key}` : loginHref("advertiser", "discover", `format=${key}`)}
                key={key}
                onClick={() => {
                  if (canAccessRole("advertiser")) selectFormat(key);
                }}
              >
                <span>{formats[key].label}</span>
                <strong>{inventory.filter((item) => item.format === key).length} units</strong>
                <small>{formats[key].spec}</small>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function ProtectedPortalLink({
  currentUser,
  role,
  view,
  className = "",
  children,
  onLaunch,
}: {
  currentUser?: DbUser | null;
  role: Role;
  view: View;
  className?: string;
  children: React.ReactNode;
  onLaunch: (role: Role, view: View) => void;
}) {
  const href = portalHref(role, view);
  if (!currentUser) return <a className={className} href={loginHref(role, view)}>{children}</a>;
  if (currentUser.role !== "admin" && currentUser.role !== role) return <span className={`disabled-action ${className}`}>{children}</span>;
  return <NavLinkButton className={className} href={href} onClick={() => onLaunch(role, view)}>{children}</NavLinkButton>;
}

function PortalPath({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return <article className="portal-path"><span className="eyebrow">{title}</span><p>{copy}</p>{children}</article>;
}

function loginHref(role: Role, view: View, extraQuery = "") {
  const target = `${portalHref(role, view)}${extraQuery ? `&${extraQuery}` : ""}`;
  return `/login?returnTo=${encodeURIComponent(target)}`;
}
