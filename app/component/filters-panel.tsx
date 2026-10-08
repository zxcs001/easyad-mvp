"use client";

import "./filters-panel.css";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Filters } from "../types";
import { FormatKey, InventoryItem, formats } from "../data";
import { CURRENT_LOCATION_ID, MANUAL_LOCATION_ID } from "../utils";
import { useI18n } from "../i18n/client";
import { FILTERS_COOKIE_MAX_AGE, FILTERS_COOKIE_NAME, readBrowserPreference, writeBrowserPreference } from "../lib/preferences";
import { defaultFilters } from "../utils";

type LocationOption = {
  id: string;
  label: string;
  level?: "province" | "county" | "street" | "point";
};

type FiltersPanelProps = {
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
  locationOptions: LocationOption[];
  inventory: InventoryItem[];
  locating?: boolean;
};

const collapsedTagCount = 12;

export default function FiltersPanel({
  filters,
  setFilters,
  selectedLocationId,
  setSelectedLocationId,
  locationOptions,
  inventory,
  locating = false,
}: FiltersPanelProps) {
  const { formatNumber, locale, t } = useI18n();
  const [tagsExpanded, setTagsExpanded] = useState(false);
  // Starts closed on both the server and the first client render so the markup
  // matches, then adopts the remembered preference.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Disclosure hides detail, never capability. A filter that is narrowing the
  // results while out of sight would be invisible capability, so the count is
  // always on the button and an active filter opens the group on arrival.
  const activeAdvanced =
    (filters.format !== defaultFilters.format ? 1 : 0) +
    (filters.audience !== defaultFilters.audience ? 1 : 0) +
    (filters.competitor !== defaultFilters.competitor ? 1 : 0) +
    (filters.minImpressions !== defaultFilters.minImpressions ? 1 : 0) +
    (filters.minTraffic !== defaultFilters.minTraffic ? 1 : 0) +
    (filters.minIncome !== defaultFilters.minIncome ? 1 : 0) +
    (filters.selectedTags.length ? 1 : 0);

  useEffect(() => {
    if (readBrowserPreference(FILTERS_COOKIE_NAME) === "1") setAdvancedOpen(true);
  }, []);

  useEffect(() => {
    if (activeAdvanced > 0) setAdvancedOpen(true);
  }, [activeAdvanced]);

  function toggleAdvanced() {
    setAdvancedOpen((open) => {
      writeBrowserPreference(FILTERS_COOKIE_NAME, open ? "0" : "1", FILTERS_COOKIE_MAX_AGE);
      return !open;
    });
  }
  const pointOptions = locationOptions.filter((location) => !location.level || location.level === "point" || location.level === "street");
  const provinceOptions = locationOptions.filter((location) => location.level === "province");
  const countyOptions = locationOptions.filter((location) => location.level === "county");
  const regionSelected = [...provinceOptions, ...countyOptions].some((location) => location.id === selectedLocationId);
  const audiences = ["all", ...Array.from(new Set(inventory.map((item) => item.audience)))];
  const allTags = useMemo(
    () => Array.from(new Set(inventory.flatMap((item) => item.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [inventory],
  );
  const visibleTags = useMemo(
    () => allTags.filter((tag, index) => tagsExpanded || index < collapsedTagCount || filters.selectedTags.includes(tag)),
    [allTags, filters.selectedTags, tagsExpanded],
  );
  const hiddenTagCount = allTags.length - visibleTags.length;

  function toggleTag(tag: string) {
    setFilters((current) => ({
      ...current,
      selectedTags: current.selectedTags.includes(tag)
        ? current.selectedTags.filter((entry) => entry !== tag)
        : [...current.selectedTags, tag],
    }));
  }

  return (
    <form className="filter-stack" onSubmit={(event) => event.preventDefault()}>
      <label>
        {t("Location")}
        <select className="select" name="location" value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)}>
          <optgroup label={t("Near you")}>
            {pointOptions.some((location) => location.id === CURRENT_LOCATION_ID) ? null : <option value={CURRENT_LOCATION_ID}>{t(locating ? "Detecting current location" : "Use my current location")}</option>}
            {selectedLocationId === MANUAL_LOCATION_ID && !pointOptions.some((location) => location.id === MANUAL_LOCATION_ID) ? (
              <option value={MANUAL_LOCATION_ID}>{t("Selected map area")}</option>
            ) : null}
            {pointOptions.map((location) => <option key={location.id} value={location.id}>{t(location.label)}</option>)}
          </optgroup>
          {provinceOptions.length ? <optgroup label={t("Province")}>{provinceOptions.map((location) => <option key={location.id} value={location.id}>{t(location.label)}</option>)}</optgroup> : null}
          {countyOptions.length ? <optgroup label={t("Counties and regions")}>{countyOptions.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}</optgroup> : null}
        </select>
      </label>
      <div className="filter-pair">
      <NumberSelect
        name="radius"
        label={t("Distance")}
        value={filters.radius}
        disabled={regionSelected}
        help={regionSelected ? t("Every screen in the selected area is listed.") : undefined}
        onChange={(radius) => setFilters((current) => ({ ...current, radius }))}
        options={[8, 10, 15, 20, 25, 30].map((km) => ({ value: km, label: t("Within {count} km", { count: km }) }))}
      />
      <NumberSelect
        name="priceMax"
        label={t("Most per day")}
        value={filters.priceMax}
        onChange={(priceMax) => setFilters((current) => ({ ...current, priceMax }))}
        options={[400, 500, 600, 800, 1000].map((amount) => ({
          value: amount,
          label: amount >= 1000 ? t("Any price") : t("Up to {amount}", { amount: formatCurrency(amount, locale) }),
        }))}
      />
      </div>
      <button aria-controls="discover-advanced-filters" aria-expanded={advancedOpen} className="filter-disclosure" onClick={toggleAdvanced} type="button">
        <span>{t("More filters")}</span>
        {activeAdvanced ? <span className="filter-disclosure-count">{activeAdvanced}</span> : null}
        <span aria-hidden="true" className="filter-disclosure-chevron">{advancedOpen ? "\u2212" : "+"}</span>
      </button>
      <div className="filter-advanced" hidden={!advancedOpen} id="discover-advanced-filters">
      <div className="filter-pair">
      <label>
        {t("Format")}
        <select className="select" name="format" value={filters.format} onChange={(event) => setFilters((current) => ({ ...current, format: event.target.value as Filters["format"] }))}>
          <option value="all">{t("All formats")}</option>
          {(Object.keys(formats) as FormatKey[]).map((key) => <option key={key} value={key}>{t(formats[key].label)}</option>)}
        </select>
      </label>
      <label>
        {t("Audience demographics")}
        <select className="select" name="audience" value={filters.audience} onChange={(event) => setFilters((current) => ({ ...current, audience: event.target.value }))}>
          {audiences.map((audience) => <option key={audience} value={audience}>{t(audience === "all" ? "All audiences" : audience)}</option>)}
        </select>
      </label>
      </div>
      <div className="filter-pair">
      <label>
        {t("Competitor presence")}
        <select className="select" name="competitor" value={filters.competitor} onChange={(event) => setFilters((current) => ({ ...current, competitor: event.target.value as Filters["competitor"] }))}>
          {["all", "Low", "Medium", "High"].map((level) => <option key={level} value={level}>{t(level === "all" ? "Any level" : level)}</option>)}
        </select>
      </label>
      <NumberSelect
        name="minImpressions"
        label={t("Least views")}
        value={filters.minImpressions}
        onChange={(minImpressions) => setFilters((current) => ({ ...current, minImpressions }))}
        options={[0, 25000, 50000, 100000, 150000].map((count) => ({
          value: count,
          label: count === 0 ? t("Any") : t("{count}+", { count: formatNumber(count) }),
        }))}
      />
      </div>
      <div className="filter-pair">
      <NumberSelect
        name="minTraffic"
        label={t("Least passers-by")}
        value={filters.minTraffic}
        onChange={(minTraffic) => setFilters((current) => ({ ...current, minTraffic }))}
        options={[0, 20000, 40000, 80000, 120000].map((count) => ({
          value: count,
          label: count === 0 ? t("Any") : t("{count}+", { count: formatNumber(count) }),
        }))}
      />
      <NumberSelect
        name="minIncome"
        label={t("Neighbourhood income")}
        value={filters.minIncome}
        onChange={(minIncome) => setFilters((current) => ({ ...current, minIncome }))}
        options={[0, 40000, 60000, 80000, 100000].map((amount) => ({
          value: amount,
          label: amount === 0 ? t("Any") : t("{amount}+", { amount: formatCurrency(amount, locale) }),
        }))}
      />
      </div>
      <div className="tag-filter-field">
        <div className="tag-filter-heading">
          <span className="field-label">{t("Device tags")}</span>
          {allTags.length ? <span className="helper-text">{t("{count} available", { count: allTags.length })}</span> : null}
        </div>
        {allTags.length ? (
          <>
            <div className="tag-options">
              {visibleTags.map((tag) => {
                const selected = filters.selectedTags.includes(tag);
                return (
                  <button
                    aria-label={t("Filter tag {tag}", { tag: t(tag) })}
                    aria-pressed={selected}
                    className={`tag-chip ${selected ? "selected" : ""}`}
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    type="button"
                  >
                    {t(tag)}
                  </button>
                );
              })}
            </div>
            {allTags.length > collapsedTagCount ? (
              <button className="tag-expand-button" type="button" onClick={() => setTagsExpanded((expanded) => !expanded)}>
                {tagsExpanded ? t("Show fewer tags") : t("Show all tags{more}", { more: hiddenTagCount ? t(" ({count} more)", { count: hiddenTagCount }) : "" })}
              </button>
            ) : null}
          </>
        ) : (
          <span className="helper-text">{t("No device tags available.")}</span>
        )}
      </div>
      </div>
    </form>
  );
}

// Sliders cost a label row plus a track row each, and a slider labelled
// "Min income: $0" asks a shop owner to pick a number they have no basis for.
// A short list of buckets in a native select is one row, and it reads as a
// choice rather than a measurement. The stored value stays numeric, so the
// filtering logic is unchanged.
function NumberSelect({ label, value, onChange, name, options, disabled = false, help }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  name?: string;
  options: Array<{ value: number; label: string }>;
  disabled?: boolean;
  help?: string;
}) {
  const nearest = options.reduce((best, option) =>
    Math.abs(option.value - value) < Math.abs(best.value - value) ? option : best, options[0]);
  const helpId = help && name ? `${name}-help` : undefined;
  return (
    <label>
      {label}
      <select aria-describedby={helpId} className="select" disabled={disabled} name={name} value={String(nearest.value)} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {help ? <small className="filter-help" id={helpId}>{help}</small> : null}
    </label>
  );
}

function formatCurrency(value: number, locale: "en" | "fr") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}
