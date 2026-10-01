import type { DeviceAlert, DisplayTemplate } from "./data";
import type { Locale } from "./i18n/config";

export type PlayerSlide = {
  placementId?: string;
  legacyBookingId?: string;
  creativeVersionId?: string;
  allocation?: import("./lib/digital-schedule").Allocation;
  id: string;
  assetVersion: string;
  title: string;
  subtitle: string;
  mediaType: "image" | "video" | "html";
  publicUrl: string;
  createdAt: string;
  startsOn: string | null;
  endsOn: string | null;
  durationSeconds: number | null;
};

export type PlayerManifest = {
  privateContent?: boolean;
  playerId: string;
  revision: number;
  generatedAt: string;
  validUntil: string;
  inventoryId: string;
  inventoryName: string;
  city: string;
  published: boolean;
  imageInterval: number;
  template: DisplayTemplate;
  displayLanguage: Locale;
  slides: PlayerSlide[];
  activeAlert: DeviceAlert | null;
  loopSeconds?: number;
};

export type PlayerTiming = { pollMs: number; heartbeatMs: number; staleMs: number };
export type PlayerStatus = {
  enabled: boolean;
  player: null | {
    id: string;
    connection: "waiting" | "online" | "stale";
    lastSeenAt: string | null;
    expectedRevision: number;
    receivedRevision: number;
    validatedRevision: number;
    appliedRevision: number;
    appliedAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    lastPlaybackAt: string | null;
  };
};

export type PlaybackEvent = {
  eventId: string; sessionId: string; sequence: number; revision: number; slideId: string;
  assetVersion: string; startedAt: string; occurredAt: string; durationMs: number;
  outcome: "completed" | "failed" | "interrupted";
};
