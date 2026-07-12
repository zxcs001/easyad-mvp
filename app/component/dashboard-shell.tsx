"use client";

import "./dashboard-shell.css";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Gauge,
  Globe2,
  Images,
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  Megaphone,
  PanelsTopLeft,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Booking, InventoryItem, Role, View } from "../data";
import { capitalize, money, portalHref } from "../utils";
import { Brand } from "./shared-ui";
import type { DbUser } from "../lib/db";

type NavItem = {
  view: View;
  label: string;
  icon: LucideIcon;
  group: "Workspace" | "Operations" | "Insights";
};

const roleNav: Record<Role, NavItem[]> = {
  advertiser: [
    { view: "portal", label: "Portal", icon: Globe2, group: "Workspace" },
    { view: "discover", label: "Discover", icon: Search, group: "Workspace" },
    { view: "booking", label: "Booking", icon: CalendarDays, group: "Operations" },
    { view: "campaigns", label: "Campaigns", icon: Megaphone, group: "Operations" },
    { view: "creative", label: "Creative studio", icon: Sparkles, group: "Operations" },
    { view: "resources", label: "Content", icon: Images, group: "Operations" },
    { view: "reports", label: "Performance", icon: BarChart3, group: "Insights" },
    { view: "billing", label: "Billing", icon: CreditCard, group: "Insights" },
  ],
  operator: [
    { view: "portal", label: "Portal", icon: Globe2, group: "Workspace" },
    { view: "inventory", label: "Inventory", icon: PanelsTopLeft, group: "Workspace" },
    { view: "resources", label: "Content", icon: Images, group: "Workspace" },
    { view: "calendar", label: "Schedule", icon: CalendarDays, group: "Operations" },
    { view: "approvals", label: "Approvals", icon: ClipboardCheck, group: "Operations" },
    { view: "reports", label: "Performance", icon: BarChart3, group: "Insights" },
    { view: "billing", label: "Billing", icon: CreditCard, group: "Insights" },
  ],
  institutional: [
    { view: "portal", label: "Portal", icon: Globe2, group: "Workspace" },
    { view: "inventory", label: "Inventory", icon: PanelsTopLeft, group: "Workspace" },
    { view: "resources", label: "Content", icon: Images, group: "Workspace" },
    { view: "calendar", label: "Schedule", icon: CalendarDays, group: "Operations" },
    { view: "approvals", label: "Approvals", icon: ClipboardCheck, group: "Operations" },
    { view: "accounts", label: "Team", icon: Users, group: "Operations" },
    { view: "reports", label: "Performance", icon: BarChart3, group: "Insights" },
    { view: "billing", label: "Billing", icon: CreditCard, group: "Insights" },
  ],
  admin: [
    { view: "portal", label: "Portal", icon: Globe2, group: "Workspace" },
    { view: "discover", label: "Marketplace", icon: Map, group: "Workspace" },
    { view: "campaigns", label: "Campaigns", icon: Megaphone, group: "Operations" },
    { view: "resources", label: "Content", icon: Images, group: "Operations" },
    { view: "inventory", label: "Inventory", icon: Building2, group: "Operations" },
    { view: "approvals", label: "Approvals", icon: ShieldCheck, group: "Operations" },
    { view: "accounts", label: "Accounts", icon: Users, group: "Operations" },
    { view: "reports", label: "Analytics", icon: BarChart3, group: "Insights" },
    { view: "billing", label: "Revenue", icon: CircleDollarSign, group: "Insights" },
  ],
};

const viewTitles: Record<View, { title: string; eyebrow: string }> = {
  portal: { title: "Outdoor campaign buying portal", eyebrow: "Marketplace" },
  discover: { title: "Map-based inventory search", eyebrow: "Plan a campaign" },
  booking: { title: "Booking request", eyebrow: "Reserve media" },
  campaigns: { title: "Campaign spaces", eyebrow: "Manage campaigns" },
  creative: { title: "Creative production suite", eyebrow: "Build and validate" },
  resources: { title: "Content management", eyebrow: "Resource library" },
  inventory: { title: "Inventory management", eyebrow: "Device network" },
  calendar: { title: "Availability calendar", eyebrow: "Scheduling" },
  approvals: { title: "Approval workflow", eyebrow: "Review queue" },
  accounts: { title: "Account management", eyebrow: "People and access" },
  reports: { title: "Campaign analytics", eyebrow: "Performance" },
  billing: { title: "Payments and billing", eyebrow: "Finance" },
};

const groups: NavItem["group"][] = ["Workspace", "Operations", "Insights"];

export function Sidebar({ role, view, setRole, setView, currentUser }: { role: Role; view: View; setRole: (role: Role) => void; setView: (view: View) => void; currentUser?: DbUser | null }) {
  const roleOptions = currentUser?.role === "admin" ? (["advertiser", "operator", "institutional", "admin"] as Role[]) : currentUser ? [currentUser.role] : (["advertiser", "operator", "institutional", "admin"] as Role[]);
  const displayRole = role === "admin" ? "Super Admin" : capitalize(role);
  const userName = currentUser?.name ?? (role === "operator" ? "MetroScreens" : role === "institutional" ? "Civic Media Group" : role === "admin" ? "Platform Admin" : "Pulse Athletic");

  return (
    <aside className="sidebar">
      <Brand subtitle="Media operations" />
      <WorkspaceSwitcher role={role} options={roleOptions} onSelect={(next) => { setRole(next); setView(next === "operator" || next === "institutional" ? "inventory" : "discover"); }} />
      <nav className="nav" aria-label={`${displayRole} navigation`}>
        {groups.map((group) => {
          const items = roleNav[role].filter((item) => item.group === group);
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{group}</span>
              {items.map(({ view: navView, label, icon: Icon }) => (
                <a
                  aria-current={view === navView ? "page" : undefined}
                  key={navView}
                  href={portalHref(role, navView)}
                  className={view === navView ? "active" : ""}
                  onClick={(event) => { event.preventDefault(); setView(navView); }}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                  {view === navView ? <span className="nav-active-mark" /> : null}
                </a>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="tenant-card">
        <div className="tenant-avatar" aria-hidden="true">{userName.slice(0, 2).toUpperCase()}</div>
        <div className="tenant-identity">
          <strong>{userName}</strong>
          <small>{currentUser ? `${currentUser.email} - ${currentUser.role === "admin" ? "super admin" : currentUser.role}` : "Sign in to save changes"}</small>
          <span className="tenant-role"><span />{currentUser ? displayRole : "Demo workspace"}</span>
        </div>
        {currentUser ? (
          <form action="/api/auth/logout" method="post"><button className="sidebar-signout" type="submit" title="Sign out"><LogOut aria-hidden="true" /><span>Sign out</span></button></form>
        ) : (
          <a className="sidebar-signout" href="/login"><LogOut aria-hidden="true" /><span>Sign in</span></a>
        )}
      </div>
    </aside>
  );
}

function WorkspaceSwitcher({ role, options, onSelect }: { role: Role; options: Role[]; onSelect: (role: Role) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`workspace-switcher${open ? " is-open" : ""}`} ref={rootRef}>
      <button aria-expanded={open} aria-haspopup="listbox" aria-label="Workspace" className="workspace-switcher-button" onClick={() => setOpen((current) => !current)} type="button">
        <span className="workspace-switcher-icon"><LayoutDashboard aria-hidden="true" /></span>
        <span className="workspace-switcher-copy"><small>Active workspace</small><strong>{roleLabel(role)}</strong></span>
        <ChevronDown className="workspace-switcher-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div aria-label="Available workspaces" className="workspace-menu" role="listbox">
          {options.map((option) => (
            <button
              aria-label={roleLabel(option)}
              aria-selected={option === role}
              className={option === role ? "selected" : ""}
              key={option}
              onClick={() => { onSelect(option); setOpen(false); }}
              role="option"
              type="button"
            >
              <span>{roleLabel(option)}</span>
              {option === role ? <Check aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function roleLabel(role: Role) {
  return role === "admin" ? "Super Admin" : capitalize(role);
}

export function Topbar({ view, visibleCount, inventory, bookings }: { view: View; visibleCount: number; inventory: InventoryItem[]; bookings: Booking[] }) {
  const averageOccupancy = inventory.length ? Math.round(inventory.reduce((sum, item) => sum + item.occupancy, 0) / inventory.length) : 0;
  const bookedValue = bookings.reduce((sum, booking) => sum + booking.spend, 0);
  const title = viewTitles[view];
  return (
    <header className="topbar">
      <div className="topbar-title">
        <p className="eyebrow">{title.eyebrow}</p>
        <h1>{title.title}</h1>
      </div>
      <div className="metrics" aria-label="Workspace summary">
        <div><MapPin aria-hidden="true" /><span>{visibleCount}</span><small>Matching units</small></div>
        <div><Gauge aria-hidden="true" /><span>{averageOccupancy}%</span><small>Average occupancy</small></div>
        <div><CircleDollarSign aria-hidden="true" /><span>{money(bookedValue)}</span><small>Booked value</small></div>
      </div>
    </header>
  );
}
