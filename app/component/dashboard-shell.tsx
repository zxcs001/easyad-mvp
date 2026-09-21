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
  MonitorUp,
  PanelsTopLeft,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Booking, InventoryItem, Role, View } from "../data";
import { roleLabel, roleValues, roleWorkspaceView } from "../roles";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { isPlainLeftClick, money, portalHref } from "../utils";
import { Brand } from "./shared-ui";
import type { DbUser } from "../lib/db";
import { LanguageSelector, useI18n } from "../i18n/client";

type NavItem = {
  view: View;
  label: string;
  icon: LucideIcon;
  group: "Workspace" | "Operations" | "Insights";
};

const roleNav: Record<Role, NavItem[]> = {
  // Advertiser labels name the task, not the industry term. "Creative studio"
  // and "Content" both meant "your pictures" to a shop owner, which is why the
  // two were indistinguishable.
  advertiser: [
    { view: "portal", label: "Home", icon: Globe2, group: "Workspace" },
    { view: "discover", label: "Find screens", icon: Search, group: "Workspace" },
    { view: "booking", label: "Request dates", icon: CalendarDays, group: "Operations" },
    { view: "creative", label: "Make an ad", icon: Sparkles, group: "Operations" },
    { view: "resources", label: "Your pictures", icon: Images, group: "Operations" },
    { view: "campaigns", label: "Your campaigns", icon: Megaphone, group: "Operations" },
    { view: "reports", label: "Results", icon: BarChart3, group: "Insights" },
    { view: "billing", label: "Invoices", icon: CreditCard, group: "Insights" },
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
    { view: "network", label: "Network control", icon: Map, group: "Workspace" },
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
    { view: "network", label: "Screen control", icon: MonitorUp, group: "Workspace" },
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
  network: { title: "Public screen network control", eyebrow: "Institution workspace" },
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

// Plain-language titles for the advertiser only. A shop owner buying a week of
// screen time is not a trained media buyer, so the marketplace wording drops the
// trade vocabulary. Operator, institution, and government wording is unchanged,
// because those people are trained and rely on the precise operational terms.
const advertiserViewTitles: Partial<Record<View, { title: string; eyebrow: string }>> = {
  portal: { title: "Advertise your business", eyebrow: "Get started" },
  discover: { title: "Find screens near you", eyebrow: "Buy screen time" },
  booking: { title: "Request your dates", eyebrow: "Buy screen time" },
  creative: { title: "Add your ad", eyebrow: "Buy screen time" },
  campaigns: { title: "Your campaigns", eyebrow: "Track your ads" },
  resources: { title: "Your pictures and videos", eyebrow: "Ad library" },
  reports: { title: "How your ads performed", eyebrow: "Results" },
  billing: { title: "Your invoices", eyebrow: "Payments" },
};

// The three steps an advertiser actually takes. The eyebrow used to read
// "Step 1 of 4" through "Step 3 of 4", promising a fourth step that does not
// exist, and it was static text rather than something a person could use.
// The date request creates the campaign shell. Artwork can be attached during
// that request or added in step 3, which remains gated until a request exists.
const buyingSteps: Array<{ view: View; label: string }> = [
  { view: "discover", label: "Find screens" },
  { view: "booking", label: "Request dates" },
  { view: "creative", label: "Make an ad" },
];

function BuyingSteps({ view, hasBookings }: { view: View; hasBookings: boolean }) {
  const { t } = useI18n();
  const currentIndex = buyingSteps.findIndex((step) => step.view === view);
  return (
    <ol className="buying-steps" aria-label={t("Buy screen time")}>
      {buyingSteps.map((step, index) => {
        const isCurrent = step.view === view;
        const isDone = index < currentIndex;
        // Make an ad needs a booking to attach to. Say so rather than offer a
        // control that leads to an empty screen.
        const locked = step.view === "creative" && !hasBookings && !isCurrent;
        const state = locked ? "is-locked" : isCurrent ? "is-current" : isDone ? "is-done" : "is-ahead";
        const body = (
          <>
            <span aria-hidden="true" className="buying-step-mark">{isDone ? <Check /> : index + 1}</span>
            <span className="buying-step-label">{t(step.label)}</span>
          </>
        );
        return (
          <li className={`buying-step ${state}`} key={step.view}>
            <span aria-current={isCurrent ? "step" : undefined} aria-disabled={!isCurrent ? "true" : undefined} title={locked ? t("Book a screen first") : undefined}>{body}</span>
          </li>
        );
      })}
    </ol>
  );
}

const groups: NavItem["group"][] = ["Workspace", "Operations", "Insights"];
const governmentNav: NavItem[] = [
  { view: "network", label: "Command centre", icon: Map, group: "Workspace" },
  { view: "inventory", label: "Screens", icon: PanelsTopLeft, group: "Workspace" },
  { view: "resources", label: "Media library", icon: Images, group: "Workspace" },
  { view: "calendar", label: "Schedule", icon: CalendarDays, group: "Operations" },
  { view: "approvals", label: "Approvals", icon: ClipboardCheck, group: "Operations" },
  { view: "accounts", label: "People and access", icon: Users, group: "Operations" },
  { view: "reports", label: "Performance", icon: BarChart3, group: "Insights" },
  { view: "billing", label: "Billing", icon: CreditCard, group: "Insights" },
];

type AppSurface = "marketplace" | "government";

export function Sidebar({ role, view, setRole, setView, currentUser, surface = "marketplace", collapsed = false, onToggleCollapsed, navigationLocked = false }: { role: Role; view: View; setRole: (role: Role) => void; setView: (view: View) => void; currentUser?: DbUser | null; surface?: AppSurface; collapsed?: boolean; onToggleCollapsed?: () => void; navigationLocked?: boolean }) {
  // At 900px and below the nav is a strip that scrolls sideways and loaded at
  // its start, so "Results" or "Invoices" could be the current page with no
  // visible "you are here". Bring the current item into view. "nearest" does
  // nothing when it is already visible, so the page itself does not jump.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>("a.active")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [view]);
  const { t } = useI18n();
  const roleOptions = currentUser?.role === "admin" ? [...roleValues] : currentUser ? [currentUser.role] : [...roleValues];
  const displayRole = roleLabel(role);
  const userName = currentUser?.name ?? (role === "operator" ? "MetroScreens" : role === "institutional" ? "Civic Media Group" : role === "admin" ? "Platform Admin" : "Pulse Athletic");
  const isGovernment = surface === "government";
  const navigation = isGovernment ? governmentNav : roleNav[role];

  return (
    <aside className={`sidebar${isGovernment ? " government-sidebar" : ""}${collapsed ? " is-rail" : ""}`}>
      {onToggleCollapsed ? (
        <button
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "Expand menu" : "Collapse menu")}
          className="sidebar-rail-toggle"
          onClick={onToggleCollapsed}
          title={t(collapsed ? "Expand menu" : "Collapse menu")}
          type="button"
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </button>
      ) : null}
      {isGovernment ? <GovernmentBrand /> : <Brand subtitle="Media operations" />}
      {isGovernment ? (
        <div className="government-scope-card">
          <span><ShieldCheck aria-hidden="true" /></span>
          <div><small>{t("Secure workspace")}</small><strong>{t(role === "admin" ? "Cross-institution oversight" : "Institution network")}</strong></div>
        </div>
      ) : <WorkspaceSwitcher role={role} options={roleOptions} disabled={navigationLocked} onSelect={(next) => { setRole(next); setView(roleWorkspaceView[next]); }} />}
      <nav className="nav" ref={navRef} aria-label={isGovernment ? t("Civic Screen Operations navigation") : t("{role} navigation", { role: t(displayRole) })}>
        {groups.map((group) => {
          const items = navigation.filter((item) => item.group === group);
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{t(isGovernment ? governmentGroupLabel(group) : role === "advertiser" ? advertiserGroupLabel(group) : group)}</span>
              {items.map(({ view: navView, label, icon: Icon }) => {
                const content = <><Icon aria-hidden="true" /><span className="nav-label">{t(label)}</span>{view === navView ? <span className="nav-active-mark" /> : null}</>;
                if (navigationLocked) return <span aria-current={view === navView ? "page" : undefined} aria-disabled={view !== navView ? "true" : undefined} className={`nav-item-static${view === navView ? " active" : ""}`} key={navView} title={t(view === navView ? label : "Finish or cancel this campaign first.")}>{content}</span>;
                return <a
                    aria-current={view === navView ? "page" : undefined}
                    key={navView}
                    href={isGovernment ? `/government?view=${navView}` : portalHref(role, navView)}
                    className={view === navView ? "active" : ""}
                    title={collapsed ? t(label) : undefined}
                    onClick={isGovernment ? undefined : (event) => { if (!isPlainLeftClick(event)) return; event.preventDefault(); setView(navView); }}
                  >{content}</a>;
              })}
            </div>
          );
        })}
      </nav>
      {isGovernment ? <a className="government-marketplace-link" href="/"><Globe2 aria-hidden="true" /><span>{t("Open EasyAD Platform")}</span></a> : null}
      <div className="tenant-card">
        <div className="tenant-avatar" aria-hidden="true">{userName.slice(0, 2).toUpperCase()}</div>
        <div className="tenant-identity">
          {/* Both lines truncate with an ellipsis at every sidebar width. */}
          <strong title={userName}>{userName}</strong>
          <small title={currentUser?.email}>{currentUser ? `${currentUser.email} - ${t(roleLabel(currentUser.role))}` : t("Sign in to save changes")}</small>
          <span className="tenant-role"><span />{currentUser ? t(displayRole) : t("Demo workspace")}</span>
        </div>
        {currentUser ? (
          <form action="/api/auth/logout" method="post" noValidate>{isGovernment ? <input name="returnTo" type="hidden" value="/government/login" /> : null}<button className="sidebar-signout" type="submit" title={t("Sign out")}><LogOut aria-hidden="true" /><span>{t("Sign out")}</span></button></form>
        ) : (
          <a className="sidebar-signout" href={isGovernment ? "/government/login" : "/login"}><LogOut aria-hidden="true" /><span>{t("Sign in")}</span></a>
        )}
      </div>
    </aside>
  );
}

function GovernmentBrand() {
  const { t } = useI18n();
  return (
    <div className="government-brand">
      <span className="government-brand-mark"><Building2 aria-hidden="true" /><i /></span>
      <div><small>{t("EasyAD Platform")}</small><strong>{t("Civic Screen Operations")}</strong><span>{t("Public display command")}</span></div>
    </div>
  );
}

function governmentGroupLabel(group: NavItem["group"]) {
  if (group === "Workspace") return "Command centre";
  if (group === "Operations") return "Fleet operations";
  return "Oversight";
}

// "Workspace", "Operations" and "Insights" describe the software. The advertiser
// headings describe what the person is trying to do.
function advertiserGroupLabel(group: NavItem["group"]) {
  if (group === "Workspace") return "Start here";
  if (group === "Operations") return "Run your ad";
  return "See how it did";
}

function WorkspaceSwitcher({ role, options, onSelect, disabled = false }: { role: Role; options: Role[]; onSelect: (role: Role) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // A listbox is expected to move with the arrow keys and to hand focus back to
  // its button on Escape. Neither worked: Escape closed the menu and left focus
  // on an option that no longer existed.
  function focusOption(step: 1 | -1 | "first" | "last") {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = step === "first" ? 0
      : step === "last" ? items.length - 1
      : current < 0 ? (step > 0 ? 0 : items.length - 1)
      : (current + step + items.length) % items.length;
    items[next]?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className={`workspace-switcher${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("Workspace")}
        className="workspace-switcher-button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
          window.requestAnimationFrame(() => focusOption(event.key === "ArrowDown" ? "first" : "last"));
        }}
        ref={buttonRef}
        type="button"
      >
        <span className="workspace-switcher-icon"><LayoutDashboard aria-hidden="true" /></span>
        <span className="workspace-switcher-copy"><small>{t("Active workspace")}</small><strong>{t(roleLabel(role))}</strong></span>
        <ChevronDown className="workspace-switcher-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div
          aria-label={t("Available workspaces")}
          className="workspace-menu"
          onKeyDown={(event) => {
            const steps: Record<string, 1 | -1 | "first" | "last"> = { ArrowDown: 1, ArrowUp: -1, Home: "first", End: "last" };
            if (!(event.key in steps)) return;
            event.preventDefault();
            focusOption(steps[event.key]);
          }}
          ref={menuRef}
          role="listbox"
        >
          {options.map((option) => (
            <button
              aria-label={t(roleLabel(option))}
              aria-selected={option === role}
              className={option === role ? "selected" : ""}
              key={option}
              onClick={() => { onSelect(option); setOpen(false); }}
              role="option"
              type="button"
            >
              <span>{t(roleLabel(option))}</span>
              {option === role ? <Check aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({ view, visibleCount, inventory, bookings, role, surface = "marketplace", campaignCreationLocked = false }: { view: View; visibleCount: number; inventory: InventoryItem[]; bookings: Booking[]; role?: Role; surface?: AppSurface; campaignCreationLocked?: boolean }) {
  const { locale, t } = useI18n();
  const averageOccupancy = inventory.length ? Math.round(inventory.reduce((sum, item) => sum + item.occupancy, 0) / inventory.length) : 0;
  const bookedValue = bookings.reduce((sum, booking) => sum + booking.spend, 0);
  const isGovernment = surface === "government";
  const isAdvertiser = role === "advertiser" && !isGovernment;
  const title = (isAdvertiser ? advertiserViewTitles[view] : undefined) ?? viewTitles[view];
  const showSteps = isAdvertiser && buyingSteps.some((step) => step.view === view);
  const titleBlock = (
    <div className="topbar-title">
      <p className="eyebrow">{t(isGovernment ? "Civic Screen Operations" : title.eyebrow)}</p>
      <h1>{t(isGovernment && view === "network" ? "Screen network command centre" : title.title)}</h1>
      {showSteps ? <BuyingSteps view={view} hasBookings={bookings.length > 0} /> : null}
      {campaignCreationLocked ? <p className="campaign-flow-lock">{t("Finish creating this campaign, or cancel to return to screen selection.")}</p> : null}
    </div>
  );
  const metrics = view !== "network" ? (
    <div className="metrics" aria-label={t("Workspace summary")}>
      <div><MapPin aria-hidden="true" /><span>{visibleCount}</span><small>{t(isAdvertiser ? "Screens you can book" : "Matching units")}</small></div>
      {/* Occupancy is a yield metric for the person selling the screen. It
          means nothing to the person buying one, so the buyer does not see it. */}
      {isAdvertiser ? null : <div><Gauge aria-hidden="true" /><span>{averageOccupancy}%</span><small>{t("Average occupancy")}</small></div>}
      <div><CircleDollarSign aria-hidden="true" /><span>{money(bookedValue, locale)}</span><small>{t(isAdvertiser ? "Your spend so far" : "Booked value")}</small></div>
    </div>
  ) : null;

  // With the buying steps, the title and the stats share one wrapping row, so
  // the stats drop below the steps when space runs out. The language menu sits
  // outside that row and stays top-right beside the title.
  if (showSteps) {
    return (
      <header className="topbar has-buying-steps">
        <div className="topbar-main">
          {titleBlock}
          {metrics}
        </div>
        <div className="topbar-tools">
          <LanguageSelector placement="embedded" />
        </div>
      </header>
    );
  }

  return (
    <header className={`topbar${isGovernment ? " government-topbar" : ""}`}>
      {titleBlock}
      {isGovernment && view === "network" ? <div className="government-session-status"><span /><div><strong>{t("Institution systems")}</strong><small>{t("Authenticated operating session")}</small></div></div> : null}
      <div className="topbar-tools">
        {metrics}
        <LanguageSelector placement="embedded" />
      </div>
    </header>
  );
}
