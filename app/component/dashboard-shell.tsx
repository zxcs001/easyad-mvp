"use client";

import { Booking, InventoryItem, Role, View } from "../data";
import { capitalize, money, portalHref } from "../utils";
import { Brand } from "./shared-ui";
import type { DbUser } from "../lib/db";

const roleNav: Record<Role, [View, string][]> = {
  advertiser: [
    ["portal", "Portal"],
    ["discover", "Search"],
    ["booking", "Booking"],
    ["campaigns", "Campaigns"],
    ["creative", "Creative"],
    ["reports", "Reports"],
    ["billing", "Billing"],
  ],
  operator: [
    ["portal", "Portal"],
    ["inventory", "Inventory"],
    ["calendar", "Calendar"],
    ["approvals", "Approvals"],
    ["reports", "Reports"],
    ["billing", "Billing"],
  ],
  institutional: [
    ["portal", "Portal"],
    ["inventory", "Inventory"],
    ["calendar", "Calendar"],
    ["approvals", "Approvals"],
    ["accounts", "Team"],
    ["reports", "Reports"],
    ["billing", "Billing"],
  ],
  admin: [
    ["portal", "Portal"],
    ["discover", "Marketplace"],
    ["campaigns", "Campaigns"],
    ["inventory", "Inventory"],
    ["approvals", "Approvals"],
    ["accounts", "Accounts"],
    ["reports", "Analytics"],
    ["billing", "Revenue"],
  ],
};

const viewTitles: Record<View, string> = {
  portal: "Outdoor Campaign Buying Portal",
  discover: "Map-based inventory search",
  booking: "Booking request workflow",
  campaigns: "Campaign spaces",
  creative: "Creative production suite",
  inventory: "Inventory management engine",
  calendar: "Availability calendar",
  approvals: "Scheduling approval workflow",
  accounts: "Account management",
  reports: "Campaign analytics",
  billing: "Payments and billing",
};

export function Sidebar({ role, view, setRole, setView, currentUser }: { role: Role; view: View; setRole: (role: Role) => void; setView: (view: View) => void; currentUser?: DbUser | null }) {
  const roleOptions = currentUser?.role === "admin" ? (["advertiser", "operator", "institutional", "admin"] as Role[]) : currentUser ? [currentUser.role] : (["advertiser", "operator", "institutional", "admin"] as Role[]);
  return (
    <aside className="sidebar">
      <Brand subtitle="Multi-tenant MVP" />
      <label className="field-label" htmlFor="role">Workspace</label>
      <select id="role" className="select" value={role} onChange={(event) => { const next = event.target.value as Role; setRole(next); setView(next === "operator" || next === "institutional" ? "inventory" : "discover"); }}>
        {roleOptions.map((item) => <option key={item} value={item}>{item === "admin" ? "Super Admin" : capitalize(item)}</option>)}
      </select>
      <nav className="nav">{roleNav[role].map(([navView, label]) => <a key={navView} href={portalHref(role, navView)} className={view === navView ? "active" : ""} onClick={() => setView(navView)}><span className="nav-dot" />{label}</a>)}</nav>
      <div className="tenant-card">
        <span className="eyebrow">{currentUser ? "Signed in" : "Demo mode"}</span>
        <strong>{currentUser?.name ?? (role === "operator" ? "MetroScreens" : role === "institutional" ? "Civic Media Group" : role === "admin" ? "Platform Admin" : "Pulse Athletic")}</strong>
        <small>{currentUser ? `${currentUser.email} - ${currentUser.role === "admin" ? "super admin" : currentUser.role}` : "Sign in to save changes"}</small>
        {currentUser ? (
          <form action="/api/auth/logout" method="post"><button className="secondary-button wide" type="submit">Sign out</button></form>
        ) : (
          <a className="secondary-button wide" href="/login">Sign in</a>
        )}
      </div>
    </aside>
  );
}

export function Topbar({ view, visibleCount, inventory, bookings }: { view: View; visibleCount: number; inventory: InventoryItem[]; bookings: Booking[] }) {
  const averageOccupancy = inventory.length ? Math.round(inventory.reduce((sum, item) => sum + item.occupancy, 0) / inventory.length) : 0;
  return (
    <header className="topbar">
      <div><p className="eyebrow">Geospatial discovery and campaign operations</p><h1>{viewTitles[view]}</h1></div>
      <div className="metrics">
        <div><span>{visibleCount}</span><small>Matching units</small></div>
        <div><span>{averageOccupancy}%</span><small>Avg occupancy</small></div>
        <div><span>{money(bookings.reduce((sum, booking) => sum + booking.spend, 0))}</span><small>Booked value</small></div>
      </div>
    </header>
  );
}
