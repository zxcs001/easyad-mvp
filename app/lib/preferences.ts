export const INTRO_COOKIE_NAME = "ooh_intro_dismissed";
export const INTRO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function shouldShowStarter(view: string, cookieValue?: string) {
  return view === "portal" && cookieValue !== "1";
}

// Whether the advanced Discover filters are open. ADR 0008 stage 1: default the
// option groups closed and remember what a person opens, rather than asking
// them to choose a complexity level.
export const FILTERS_COOKIE_NAME = "ooh_filters_expanded";
export const FILTERS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readBrowserPreference(name: string) {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`))?.split("=")[1];
}

export function writeBrowserPreference(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

// Whether the workspace sidebar is collapsed to an icon rail.
export const SIDEBAR_COOKIE_NAME = "ooh_nav_collapsed";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
