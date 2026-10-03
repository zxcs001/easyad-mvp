import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_NAME, LOCALE_REQUEST_HEADER, type Locale } from "./config";
import { translate } from "./messages";

export async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const requestLocale = requestHeaders.get(LOCALE_REQUEST_HEADER);
  if (isLocale(requestLocale)) return requestLocale;

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  return isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
}

export async function getServerI18n() {
  const locale = await getRequestLocale();
  return {
    locale,
    t: (message: string, variables?: Record<string, string | number>) => translate(locale, message, variables),
    formatDate: (input: Date | string | number, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", options).format(new Date(input)),
    formatNumber: (input: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", options).format(input),
  };
}

