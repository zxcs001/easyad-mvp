export const INTRO_COOKIE_NAME = "ooh_intro_dismissed";
export const INTRO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function shouldShowStarter(view: string, cookieValue?: string) {
  return view === "portal" && cookieValue !== "1";
}
