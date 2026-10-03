import { INTRO_COOKIE_NAME } from "./preferences";

export const CONSENT_COOKIE_NAME = "easyad_cookie_consent";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
export type CookieConsent = "preferences" | "necessary";

export function readCookieConsent(): CookieConsent | null {
  const value = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${CONSENT_COOKIE_NAME}=`))?.split("=")[1];
  return value === "v1.preferences" ? "preferences" : value === "v1.necessary" ? "necessary" : null;
}

export function saveCookieConsent(consent: CookieConsent) {
  const attributes = `Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  document.cookie = `${CONSENT_COOKIE_NAME}=v1.${consent}; Max-Age=${CONSENT_MAX_AGE}; ${attributes}`;
  if (consent === "necessary") document.cookie = `${INTRO_COOKIE_NAME}=; Max-Age=0; ${attributes}`;
}
