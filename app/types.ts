import type { FormatKey, InventoryItem } from "./data";
import type { MapLocation } from "./lib/geo/regions";
import type { DaypartId } from "./lib/booking-schedule";

// A point (current location, a map click) or a region (Ontario, a county).
export type MapPoint = MapLocation;

export type Filters = {
  radius: number;
  format: FormatKey | "all";
  minImpressions: number;
  minTraffic: number;
  minIncome: number;
  audience: string;
  competitor: InventoryItem["competitor"] | "all";
  priceMax: number;
  selectedTags: string[];
};

export type BookingDraft = {
  campaign: string;
  start: string;
  end: string;
  advertiser: string;
  adSlots: number;
  /** Time-of-day slots for a digital screen. Absent or empty means all day. */
  dayparts?: DaypartId[];
};

export type CreativeDraft = {
  template: "retail" | "finance" | "event";
  /** Hand-edited HTML per design. When present it wins over the fields. */
  htmlByTopic?: Partial<Record<"retail" | "finance" | "event", string>>;
  /** Fill-in-the-blanks values per design (see app/quick-ad.ts). */
  fieldsByTopic?: Partial<Record<"retail" | "finance" | "event", import("./quick-ad").QuickAdFields>>;
  /** Optional page a QR code on a template ad opens. Scans count in Results. */
  responseUrl?: string;
  format: FormatKey;
  width: number;
  height: number;
  fileType: "png" | "jpg" | "gif" | "pdf" | "mp4" | "html";
  fileSize: number;
  safeZone: number;
  distortion: number;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};
