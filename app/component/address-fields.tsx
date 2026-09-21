"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../i18n/client";

// One address, four fields. A single free-text box gave no hint of the form it
// needed, and two different functions then guessed the city from it by cutting
// the text at its commas. The fields carry the browser's own autofill names, so
// a person can fill them from the address their browser already holds.
//
// The value stays one string, "street, city, PROV POSTAL", so nothing in the
// database, the API or the public pages changes.

export const provinces: Array<[string, string]> = [
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
];

export type AddressParts = { street: string; city: string; province: string; postalCode: string };

const provinceCodes = new Set(provinces.map(([code]) => code));
const postalCodeAnywhere = /([A-Za-z]\d[A-Za-z])\s?(\d[A-Za-z]\d)/;

function tidy(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
}

export function formatPostalCode(value: string) {
  const match = value.match(postalCodeAnywhere);
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : tidy(value).toUpperCase();
}

// The last comma part may be "ON", "ON P7B 5E1", "Ontario" or a bare city.
function readTail(tail: string) {
  const postalMatch = tail.match(postalCodeAnywhere);
  const postalCode = postalMatch ? formatPostalCode(postalMatch[0]) : "";
  const rest = tidy(postalMatch ? tail.replace(postalMatch[0], "") : tail);
  const code = rest.toUpperCase();
  if (provinceCodes.has(code)) return { province: code, postalCode, leftover: "" };
  const named = provinces.find(([, name]) => name.toLowerCase() === rest.toLowerCase());
  if (named) return { province: named[0], postalCode, leftover: "" };
  return { province: "", postalCode, leftover: rest };
}

export function parseAddress(value: string): AddressParts {
  const parts = tidy(value).split(",").map(tidy).filter(Boolean);
  if (!parts.length) return { street: "", city: "", province: "", postalCode: "" };

  const { province, postalCode, leftover } = readTail(parts[parts.length - 1] ?? "");
  const head = parts.slice(0, -1);

  // No province in the tail: the tail is the city, unless the whole value is a
  // single legacy line such as "New market location", which stays the street.
  if (!province) {
    if (!head.length) return { street: leftover, city: "", province: "", postalCode };
    return { street: head.join(", "), city: leftover, province: "", postalCode };
  }

  return {
    street: head.slice(0, -1).join(", "),
    city: head[head.length - 1] ?? "",
    province,
    postalCode,
  };
}

export function composeAddress(parts: AddressParts) {
  const tail = [parts.province, parts.postalCode].map(tidy).filter(Boolean).join(" ");
  return [tidy(parts.street), tidy(parts.city), tail].filter(Boolean).join(", ");
}

// One message, and only the first one that applies, so the person fixes one
// thing at a time. The form shows it as a hint while typing, and the save
// button's own error repeats it when a save is refused.
export function addressIssue(value: string) {
  const parts = parseAddress(value);
  if (!parts.street) return "Add the street address, so an operator can find the screen.";
  if (!parts.city) return "Add the city, so the public page can say where the screen is.";
  if (!parts.province) return "Choose the province or territory.";
  if (parts.postalCode && !postalCodeAnywhere.test(parts.postalCode)) return "Check the postal code. Use the form A1A 1A1.";
  return "";
}

export default function AddressFields({
  value,
  onChange,
  disabled = false,
  id = "address-fields",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useI18n();
  // The fields hold what the person typed; the parent holds the composed line.
  // Re-reading the composed line on every keystroke ate the spaces, because
  // composing trims each part: "955 " became "955" before the next letter.
  const [parts, setParts] = useState<AddressParts>(() => parseAddress(value));
  const issue = addressIssue(value);

  useEffect(() => {
    // Only when the value came from somewhere else, such as another device.
    if (composeAddress(parts) !== value) setParts(parseAddress(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (next: Partial<AddressParts>) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange(composeAddress(merged));
  };

  return (
    <fieldset className="address-fields" aria-describedby={`${id}-help`}>
      <legend>{t("Address")}</legend>
      <p className="address-help" id={`${id}-help`}>
        {t("Shown on the public screen page, and used to label the city on the screen preview.")}
      </p>

      <label className="address-wide">
        {t("Street address")}
        <input
          autoComplete="street-address"
          aria-invalid={parts.street ? undefined : true}
          disabled={disabled}
          id={`${id}-street`}
          onBlur={(event) => update({ street: tidy(event.target.value) })}
          onChange={(event) => update({ street: event.target.value })}
          placeholder={t("955 Oliver Rd")}
          value={parts.street}
        />
      </label>

      <label>
        {t("City")}
        <input
          autoComplete="address-level2"
          aria-invalid={parts.city ? undefined : true}
          disabled={disabled}
          id={`${id}-city`}
          onBlur={(event) => update({ city: tidy(event.target.value) })}
          onChange={(event) => update({ city: event.target.value })}
          placeholder={t("Thunder Bay")}
          value={parts.city}
        />
      </label>

      <label>
        {t("Province or territory")}
        <select
          aria-invalid={parts.province ? undefined : true}
          autoComplete="address-level1"
          className="select"
          disabled={disabled}
          id={`${id}-province`}
          onChange={(event) => update({ province: event.target.value })}
          value={parts.province}
        >
          <option value="">{t("Choose a province or territory")}</option>
          {provinces.map(([code, name]) => <option key={code} value={code}>{t(name)}</option>)}
        </select>
      </label>

      <label>
        {t("Postal code")}
        <input
          autoComplete="postal-code"
          disabled={disabled}
          id={`${id}-postal`}
          maxLength={7}
          onBlur={(event) => update({ postalCode: event.target.value ? formatPostalCode(event.target.value) : "" })}
          onChange={(event) => update({ postalCode: event.target.value })}
          placeholder={t("P7B 5E1")}
          value={parts.postalCode}
        />
        <small className="address-optional">{t("Optional")}</small>
      </label>

      {/* What the person will see stored, before they save it. */}
      <p aria-live="polite" className="address-echo address-wide">
        {value
          ? t("Saved as: {address}", { address: value })
          : t("Nothing is entered yet.")}
      </p>
      {issue ? <p className="address-hint address-wide">{t(issue)}</p> : null}
    </fieldset>
  );
}
