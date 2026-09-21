"use client";

import "./portal.css";
import { ArrowUpRight } from "lucide-react";
import { Booking, FormatKey, InventoryItem, Role, View, formats } from "../data";
import type { DbUser } from "../lib/db";
import type { Filters } from "../types";
import { roleLabel } from "../roles";
import { isPlainLeftClick, money, number, portalHref } from "../utils";
import MapLibreInventoryMap from "./maplibre-inventory-map";
import { Brand, Metric, NavLinkButton, SectionHeading } from "./shared-ui";
import { LanguageSelector, useI18n } from "../i18n/client";
import { isMarketplaceInventoryAvailable } from "../lib/inventory-availability";

export default function Portal({
  inventory,
  bookings,
  selectedLocation,
  filters,
  launch,
  selectFormat,
  currentUser,
}: {
  inventory: InventoryItem[];
  bookings: Booking[];
  selectedLocation: { x: number; y: number };
  filters: Filters;
  launch: (role: Role, view: View) => void;
  selectFormat: (format: FormatKey) => void;
  currentUser?: DbUser | null;
}) {
  const { locale, t } = useI18n();
  const availableInventory = inventory.filter((item) => isMarketplaceInventoryAvailable(item));
  const totalImpressions = availableInventory.reduce((sum, item) => sum + item.impressions, 0);
  const bookedRevenue = bookings.reduce((sum, booking) => sum + booking.spend, 0);
  const operatorNames = Array.from(new Set(inventory.map((item) => item.operator)));
  const operators = operatorNames.length;
  const canAccessRole = (targetRole: Role) => Boolean(currentUser && (currentUser.role === "admin" || currentUser.role === targetRole));
  // A signed-out visitor still needs the marketing page, so the sections below
  // stay exactly as they were. A signed-in advertiser has already bought the
  // pitch and needs their next task instead, so they get a different main.
  const isAdvertiserHome = currentUser?.role === "advertiser";

  return (
    <div className="portal">
      <header className="portal-nav">
        <Brand subtitle="Self-service outdoor media portal" portal />
        <div className="portal-nav-actions">
          {currentUser ? (
            <>
              <span className="session-chip">{currentUser.name} - {t(roleLabel(currentUser.role))}</span>
              <form action="/api/auth/logout" method="post" noValidate><button type="submit">{t("Sign out")}</button></form>
            </>
          ) : (
            <>
              <a href="/login">{t("Sign in")}</a>
              <a href="/signup">{t("Sign up")}</a>
            </>
          )}
          <ProtectedPortalLink className="primary-button" currentUser={currentUser} role="advertiser" view="discover" onLaunch={launch}>Launch Campaign</ProtectedPortalLink>
          <LanguageSelector placement="embedded" />
        </div>
      </header>
      <main>
        {isAdvertiserHome ? (
          <AdvertiserHome
            availableInventory={availableInventory}
            bookings={bookings}
            currentUser={currentUser}
            filters={filters}
            launch={launch}
            selectedLocation={selectedLocation}
          />
        ) : (
        <>
        <section className="portal-hero">
          <div className="portal-copy">
            <p className="eyebrow pill"><span className="pill-dot" />{t("OOH planning, booking, creative, and proof-of-play")}</p>
            <h1>{t("Outdoor Campaign Buying Portal")}</h1>
            <p>{t("Discover premium digital, static, and transit inventory, target by place and audience, reserve availability, validate creative, and track delivery from the same workspace.")}</p>
            <div className="portal-actions">
              <ProtectedPortalLink className="primary-button" currentUser={currentUser} role="advertiser" view="discover" onLaunch={launch}>Plan Media Buy</ProtectedPortalLink>
              <ProtectedPortalLink className="ghost-button" currentUser={currentUser} role="operator" view="approvals" onLaunch={launch}>Review Bookings</ProtectedPortalLink>
            </div>
            <div className="portal-stats">
              <Metric label="Available impressions" value={number(totalImpressions, locale)} />
              <Metric label="Operator networks" value={operators} />
              <Metric label="Booked pipeline" value={money(bookedRevenue, locale)} />
            </div>
          </div>
          <div className="portal-visual" aria-label={t("Marketplace product preview")}>
            <div className="preview-toolbar">
              <span>{t("Live marketplace")}</span>
              <strong>{t("{count} available units", { count: availableInventory.length })}</strong>
            </div>
            <div className="portal-map-wrap">
              <MapLibreInventoryMap
                inventory={availableInventory}
                visibleInventory={availableInventory}
                selectedInventoryId=""
                selectedLocation={selectedLocation}
                radius={filters.radius}
                showCompetitors={false}
                variant="portal"
              />
            </div>
          </div>
        </section>
        {operatorNames.length ? (
          <section className="portal-trust">
            <span className="eyebrow">{t("Live inventory from operator networks")}</span>
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
              ["Commercial Terms", "Quote-ready campaign estimates, offline approval status, and operator cost allocation without payment collection."],
            ].map(([title, copy]) => (
              <article className="portal-feature" key={title}>
                <strong>{t(title)}</strong>
                <p>{t(copy)}</p>
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
                onClick={(event) => {
                  if (!canAccessRole("advertiser") || !isPlainLeftClick(event)) return;
                  event.preventDefault();
                  selectFormat(key);
                }}
              >
                <span>{t(formats[key].label)}</span>
                <strong>{t("{count} units", { count: inventory.filter((item) => item.format === key).length })}</strong>
                <small>{t(formats[key].spec)}</small>
                <span className="format-tile-cta">{t(canAccessRole("advertiser") ? "Explore units →" : "Sign in to explore →")}</span>
              </a>
            ))}
          </div>
        </section>
        </>
        )}
        {/* The civic gateway is the marketplace's only advertisement of the
            institution product, and DESIGN.md requires it at the end of the page
            for every visitor. It therefore sits outside the role branch above. */}
        <section className="portal-institution-gateway" aria-labelledby="institution-gateway-title">
          <div className="institution-gateway-copy">
            <span className="eyebrow">{t("Government, institutions, and large networks")}</span>
            <h2 id="institution-gateway-title">{t("Enter government workspace")}</h2>
            <p>{t("See how Civic Screen Operations handles owned devices, direct image and video publishing, representative screen previews, fleet mapping, and bounded emergency overrides before secure sign-in.")}</p>
          </div>
          <div className="institution-gateway-action">
            <a className="institution-gateway-link" href="/government/about">{t("View workspace details")} <ArrowUpRight aria-hidden="true" /></a>
            <small>{t("Institution accounts and Super Admin only")}</small>
          </div>
        </section>
      </main>
    </div>
  );
}

// The signed-in advertiser home. It answers "what do I do now", not "what is
// this product". Everything here composes from components that already exist.
function AdvertiserHome({
  availableInventory,
  bookings,
  currentUser,
  filters,
  launch,
  selectedLocation,
}: {
  availableInventory: InventoryItem[];
  bookings: Booking[];
  currentUser?: DbUser | null;
  filters: Filters;
  launch: (role: Role, view: View) => void;
  selectedLocation: { x: number; y: number };
}) {
  const { locale, t } = useI18n();
  const spend = bookings.reduce((sum, booking) => sum + booking.spend, 0);
  const live = bookings.filter((booking) => booking.status === "live" || booking.status === "scheduled").length;
  const waiting = bookings.filter((booking) => booking.status === "pending approval" || booking.status === "creative review").length;
  const recent = bookings.slice(0, 3);
  const steps: Array<[string, string, View]> = [
    ["Find screens near you", "Search a map of screens around your shop and compare what they cost.", "discover"],
    ["Request your dates", "Pick the days you want to run, and see the price before you commit.", "booking"],
    ["Add your ad", "Upload a picture. The screen owner checks it before it goes live.", "creative"],
  ];

  return (
    <>
      <section className="advertiser-home-head">
        <div className="advertiser-home-copy">
          <span className="eyebrow">{currentUser?.name}</span>
          <h1>{t(bookings.length ? "Welcome back" : "Let's get your first ad running")}</h1>
          <p>{t(bookings.length
            ? "Pick up where you left off, or book another screen."
            : "You have not booked a screen yet. It takes three steps, and nothing is charged until a screen owner approves your ad.")}</p>
          <div className="portal-actions">
            <ProtectedPortalLink className="primary-button" currentUser={currentUser} role="advertiser" view="discover" onLaunch={launch}>Find screens near you</ProtectedPortalLink>
            {bookings.length ? <ProtectedPortalLink className="ghost-button" currentUser={currentUser} role="advertiser" view="campaigns" onLaunch={launch}>See your campaigns</ProtectedPortalLink> : null}
          </div>
          <div className="portal-stats stat-tiles">
            <Metric label="Screens you can book" value={availableInventory.length} />
            <Metric label="Ads running" value={live} />
            <Metric label="Waiting for approval" value={waiting} />
            <Metric label="Your spend so far" value={money(spend, locale)} />
          </div>
        </div>
        <div className="portal-visual" aria-label={t("Screens near you")}>
          <div className="preview-toolbar">
            <span>{t("Screens near you")}</span>
            <strong>{t("{count} available units", { count: availableInventory.length })}</strong>
          </div>
          <div className="portal-map-wrap">
            <MapLibreInventoryMap
              inventory={availableInventory}
              visibleInventory={availableInventory}
              selectedInventoryId=""
              selectedLocation={selectedLocation}
              radius={filters.radius}
              showCompetitors={false}
              variant="portal"
            />
          </div>
        </div>
      </section>

      <section className="advertiser-home-band">
        {/* These are numbered because they are a real sequence. Step 2 cannot be
            done before step 1. */}
        <SectionHeading eyebrow="Three steps" title="How it works" />
        <ol className="advertiser-steps">
          {steps.map(([title, copy, view], index) => (
            <li className="advertiser-step" key={title}>
              <span className="advertiser-step-number" aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{t(title)}</strong>
                <p>{t(copy)}</p>
                <ProtectedPortalLink className="advertiser-step-link" currentUser={currentUser} role="advertiser" view={view} onLaunch={launch}>{index === 0 ? "Start here" : "Open"}</ProtectedPortalLink>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="advertiser-home-band">
        <SectionHeading eyebrow="Your account" title={bookings.length ? "Your latest bookings" : "You have no bookings yet"} />
        {recent.length ? (
          <ul className="advertiser-booking-list">
            {recent.map((booking) => (
              <li key={booking.id}>
                <div>
                  <strong>{booking.campaign}</strong>
                  <small>{booking.start} {t("to")} {booking.end}</small>
                </div>
                <span className={`state-pill ${bookingWeight(booking.status)}`}>{t(booking.status)}</span>
                <span className="advertiser-booking-spend">{money(booking.spend, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="advertiser-empty">{t("Your bookings will appear here once you book your first screen.")}</p>
        )}
      </section>
    </>
  );
}

// Maps a booking state onto the severity ladder in ADR 0007. Weight rises with
// how much attention the state needs.
function bookingWeight(status: Booking["status"]) {
  if (status === "rejected") return "is-danger";
  if (status === "pending approval" || status === "creative review") return "is-warning";
  if (status === "live" || status === "scheduled" || status === "approved") return "is-success";
  return "is-idle";
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
  const { t } = useI18n();
  const localizedChildren = typeof children === "string" ? t(children) : children;
  const isGovernmentEntry = role === "institutional" && view === "network";
  const href = isGovernmentEntry ? "/government" : portalHref(role, view);
  if (!currentUser) return <a className={className} href={isGovernmentEntry ? "/government/login?returnTo=%2Fgovernment" : loginHref(role, view)}>{localizedChildren}</a>;
  if (currentUser.role !== "admin" && currentUser.role !== role) return <span className={`disabled-action ${className}`}>{localizedChildren}</span>;
  if (isGovernmentEntry) return <a className={className} href={href}>{localizedChildren}</a>;
  return <NavLinkButton className={className} href={href} onClick={() => onLaunch(role, view)}>{localizedChildren}</NavLinkButton>;
}

function PortalPath({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return <article className="portal-path"><span className="eyebrow">{t(title)}</span><p>{t(copy)}</p>{children}</article>;
}

function loginHref(role: Role, view: View, extraQuery = "") {
  const target = `${portalHref(role, view)}${extraQuery ? `&${extraQuery}` : ""}`;
  return `/login?returnTo=${encodeURIComponent(target)}`;
}
