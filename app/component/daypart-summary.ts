import { DAYPARTS, isAllDay, type DaypartId } from "../lib/booking-schedule";

type Translate = (message: string, variables?: Record<string, string | number>) => string;

/** "All day", or the chosen time-of-day slots in day order: "Morning, Evening". */
export function daypartSummary(dayparts: readonly DaypartId[] | undefined, t: Translate) {
  if (isAllDay(dayparts)) return t("All day");
  return DAYPARTS.filter((daypart) => dayparts!.includes(daypart.id)).map((daypart) => t(daypart.label)).join(", ");
}
