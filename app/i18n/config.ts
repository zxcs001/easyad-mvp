export const locales = ["en", "fr"] as const;

export type Locale = (typeof locales)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE_NAME = "easyad_locale";
export const LOCALE_REQUEST_HEADER = "x-easyad-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const localeNames: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  if (typeof value === "string") {
    const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
    if (isLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}

export function detectLocaleFromGeo(headers: Pick<Headers, "get">): Locale {
  const country = firstHeader(headers, [
    "x-vercel-ip-country",
    "cloudfront-viewer-country",
    "cf-ipcountry",
    "x-country-code",
  ]);
  const region = firstHeader(headers, [
    "x-vercel-ip-country-region",
    "cloudfront-viewer-country-region",
    "cf-region-code",
    "x-region-code",
  ]);

  const normalizedCountry = country?.trim().toUpperCase();
  const normalizedRegion = region?.trim().toUpperCase();
  const isCanada = !normalizedCountry || normalizedCountry === "CA" || normalizedCountry === "CAN";
  const isQuebec = normalizedRegion === "QC" || normalizedRegion === "CA-QC" || normalizedRegion === "QUEBEC" || normalizedRegion === "QUÉBEC";

  return isCanada && isQuebec ? "fr" : DEFAULT_LOCALE;
}

function firstHeader(headers: Pick<Headers, "get">, names: string[]) {
  for (const name of names) {
    const value = headers.get(name)?.split(",", 1)[0]?.trim();
    if (value) return value;
  }
  return undefined;
}

