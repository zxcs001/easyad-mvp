import type { FormatKey, InventoryItem } from "./data";
import type { MapLocation } from "./lib/geo/regions";

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
};

export type CreativeDraft = {
  template: "retail" | "finance" | "event";
  htmlByTopic?: Partial<Record<"retail" | "finance" | "event", string>>;
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
