"use client";

import "./shared-ui.css";
import { Booking, InventoryItem } from "../data";
import { isPlainLeftClick, money } from "../utils";
import { useI18n } from "../i18n/client";

export function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  const { t } = useI18n();
  return <div className="panel-heading"><div><span className="eyebrow">{t(eyebrow)}</span><h2>{t(title)}</h2></div>{action}</div>;
}

export function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  const { t } = useI18n();
  return <div className="portal-section-heading"><span className="eyebrow">{t(eyebrow)}</span><h2>{t(title)}</h2></div>;
}

export function NavLinkButton({
  href,
  className = "",
  children,
  onClick,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    // Without preventDefault the view switched and then the browser also loaded
    // the whole page: a flash, a restarted map, and lost local state.
    <a className={className} href={href} onClick={(event) => { if (!isPlainLeftClick(event)) return; event.preventDefault(); onClick(); }}>
      {children}
    </a>
  );
}

// The existing .empty-state markup, with the part that was missing everywhere:
// a way out. An empty screen that only states a rule leaves a person stuck, so
// every empty state names the next action.
export function EmptyState({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={`empty-state${action ? " has-action" : ""}`}>
      <strong>{t(title)}</strong>
      <span>{t(copy)}</span>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  const { t } = useI18n();
  return <div className="metric"><span>{t(label)}</span><strong>{value}</strong></div>;
}

export function Meter({ value }: { value: number }) {
  return <div className="meter"><i style={{ width: `${value}%` }} /></div>;
}

export function Range({ label, min, max, step = 1, value, onChange, name }: { label: string; min: number; max: number; step?: number; value: number; onChange: (value: number) => void; name?: string }) {
  const { t } = useI18n();
  return <label>{t(label)}<input name={name} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function EditorInput({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  const { t } = useI18n();
  return <label>{t(label)}<input disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function Brand({ subtitle, portal = false }: { subtitle: string; portal?: boolean }) {
  const { t } = useI18n();
  return <div className={`brand ${portal ? "portal-brand" : ""}`}><div className="brand-mark">EA</div><div><strong>{t("EasyAD Platform")}</strong><span>{t(subtitle)}</span></div></div>;
}

export function BookingsTable({ bookings, inventory }: { bookings: Booking[]; inventory: InventoryItem[] }) {
  const { locale, t } = useI18n();
  return (
    <div className="inventory-table">
      {/* A column header above an empty table labels nothing, and it reads as a
          table that failed to load. It appears only once there is a row. */}
      {bookings.length ? <div className="table-head"><span>{t("Campaign")}</span><span>{t("Inventory")}</span><span>{t("Dates")}</span><span>{t("Status")}</span><span>{t("Creative")}</span><span>{t("Spend")}</span></div> : <EmptyState title="No bookings to show" copy="Bookings appear here once a screen is reserved." />}
      {bookings.map((booking) => {
        const item = inventory.find((unit) => unit.id === booking.inventoryId);
        return <div className="table-row" key={booking.id}><span><strong>{booking.campaign}</strong><small>{booking.advertiser} - {t(booking.adSlots === 1 ? "{count} slot" : "{count} slots", { count: booking.adSlots })}</small></span><span>{item?.name ?? booking.inventoryId}</span><span>{booking.start}<small>{booking.end}</small></span><span><span className="status">{t(booking.status)}</span></span><span>{t(booking.creativeStatus)}</span><span>{money(booking.spend, locale)}</span></div>;
      })}
    </div>
  );
}
