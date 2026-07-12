"use client";

import "./shared-ui.css";
import { Booking, InventoryItem } from "../data";
import { money } from "../utils";

export function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>;
}

export function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="portal-section-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>;
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
    <a className={className} href={href} onClick={() => onClick()}>
      {children}
    </a>
  );
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function Meter({ value }: { value: number }) {
  return <div className="meter"><i style={{ width: `${value}%` }} /></div>;
}

export function Range({ label, min, max, step = 1, value, onChange, name }: { label: string; min: number; max: number; step?: number; value: number; onChange: (value: number) => void; name?: string }) {
  return <label>{label}<input name={name} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function EditorInput({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label>{label}<input disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function Brand({ subtitle, portal = false }: { subtitle: string; portal?: boolean }) {
  return <div className={`brand ${portal ? "portal-brand" : ""}`}><div className="brand-mark">OM</div><div><strong>OOH Market</strong><span>{subtitle}</span></div></div>;
}

export function BookingsTable({ bookings, inventory }: { bookings: Booking[]; inventory: InventoryItem[] }) {
  return (
    <div className="inventory-table">
      <div className="table-head"><span>Campaign</span><span>Inventory</span><span>Dates</span><span>Status</span><span>Creative</span><span>Spend</span></div>
      {bookings.map((booking) => {
        const item = inventory.find((unit) => unit.id === booking.inventoryId);
        return <div className="table-row" key={booking.id}><span><strong>{booking.campaign}</strong><small>{booking.advertiser} - {booking.adSlots} slot{booking.adSlots === 1 ? "" : "s"}</small></span><span>{item?.name ?? booking.inventoryId}</span><span>{booking.start}<small>{booking.end}</small></span><span><span className="status">{booking.status}</span></span><span>{booking.creativeStatus}</span><span>{money(booking.spend)}</span></div>;
      })}
    </div>
  );
}
