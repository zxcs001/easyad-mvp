"use client";

import "./workspace-tabs.css";
import { useRef, type ReactNode } from "react";
import { useI18n } from "../i18n/client";

export type WorkspaceTab<T extends string> = { id: T; label: string; badge?: ReactNode };

/**
 * A tab list for splitting one long workspace page into sections. Arrow keys,
 * Home and End move between tabs (WAI-ARIA tabs pattern with automatic
 * activation). Render the matching panel with `workspaceTabPanel`.
 */
export function WorkspaceTabs<T extends string>({ label, idPrefix, tabs, value, onChange }: { label: string; idPrefix: string; tabs: WorkspaceTab<T>[]; value: T; onChange: (next: T) => void }) {
  const { t } = useI18n();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function move(index: number) {
    const next = (index + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div className="workspace-tabs" role="tablist" aria-label={t(label)}>
      {tabs.map((tab, index) => (
        <button
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          aria-selected={value === tab.id}
          className={value === tab.id ? "active" : ""}
          id={`${idPrefix}-tab-${tab.id}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") { event.preventDefault(); move(index + 1); }
            if (event.key === "ArrowLeft") { event.preventDefault(); move(index - 1); }
            if (event.key === "Home") { event.preventDefault(); move(0); }
            if (event.key === "End") { event.preventDefault(); move(tabs.length - 1); }
          }}
          ref={(element) => { refs.current[index] = element; }}
          role="tab"
          tabIndex={value === tab.id ? 0 : -1}
          type="button"
        >
          {t(tab.label)}{tab.badge !== undefined && tab.badge !== null ? <span className="workspace-tab-badge">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function workspaceTabPanel(idPrefix: string, value: string) {
  return { role: "tabpanel" as const, id: `${idPrefix}-panel-${value}`, "aria-labelledby": `${idPrefix}-tab-${value}` };
}
