import type { FormatKey, InventoryItem } from "./data";

export type MapPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type Filters = {
  radius: number;
  format: FormatKey | "all";
  minImpressions: number;
  minTraffic: number;
  minIncome: number;
  audience: string;
  competitor: InventoryItem["competitor"] | "all";
  priceMax: number;
  showCompetitors: boolean;
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
  format: FormatKey;
  width: number;
  height: number;
  fileType: "png" | "jpg" | "pdf" | "mp4";
  fileSize: number;
  safeZone: number;
  distortion: number;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};
