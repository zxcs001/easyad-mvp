export type FormatKey = "digital" | "static" | "transit";
export type Role = "advertiser" | "operator" | "institutional" | "admin";
export type UserStatus = "active" | "banned";
export type View =
  | "portal"
  | "discover"
  | "booking"
  | "campaigns"
  | "creative"
  | "inventory"
  | "calendar"
  | "approvals"
  | "accounts"
  | "reports"
  | "billing";

export type DisplayTemplate = "fullscreen" | "weather" | "public-info" | "transit" | "community";

export const displayTemplates: DisplayTemplate[] = ["fullscreen", "weather", "public-info", "transit", "community"];

export type InventoryItem = {
  id: string;
  name: string;
  operator: string;
  format: FormatKey;
  x: number;
  y: number;
  address: string;
  price: number;
  impressions: number;
  traffic: number;
  income: number;
  audience: string;
  competitor: "Low" | "Medium" | "High";
  occupancy: number;
  imageInterval: number;
  maxLoopSeconds: number;
  availableFrom: string;
  availableTo: string;
  approvalStatus?: "pending approval" | "approved" | "rejected";
  tags?: string[];
  displayTemplate?: DisplayTemplate;
  commentsEnabled?: boolean;
  institutionId?: string | null;
};

export type InventoryComment = {
  id: string;
  inventoryId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
};

export type MediaResource = {
  id: string;
  inventoryId: string;
  ownerId: string;
  title: string;
  originalName: string;
  mimeType: string;
  mediaType: "image" | "video" | "file";
  sizeBytes: number;
  publicUrl: string;
  createdAt: string;
};

export type Booking = {
  id: string;
  advertiser: string;
  inventoryId: string;
  campaign: string;
  start: string;
  end: string;
  adSlots: number;
  creativeStatus: "approved" | "pending review" | "needs changes";
  status: "pending approval" | "creative review" | "approved" | "scheduled" | "live" | "completed" | "rejected";
  spend: number;
  paid: boolean;
  pop: number;
  createdBy?: string;
};

export type ApprovalEvent = {
  id: string;
  bookingId: string;
  campaign: string;
  inventoryId: string;
  action: "approved" | "rejected";
  previousStatus: Booking["status"];
  nextStatus: Booking["status"];
  actorName: string;
  createdAt: string;
};

export type TransactionStatus = "pending" | "paid" | "refunded" | "failed";

export type Transaction = {
  id: string;
  bookingId: string;
  advertiser: string;
  amount: number;
  platformFee: number;
  operatorPayout: number;
  status: TransactionStatus;
  method: string;
  gatewayRef: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type PopLog = {
  id: string;
  bookingId: string;
  inventoryId: string;
  plays: number;
  impressions: number;
  status: "verified" | "missed";
  source: string;
  playedAt: string;
};

export type Creative = {
  id: string;
  bookingId: string;
  source: "template" | "upload";
  template: "retail" | "finance" | "event";
  format: FormatKey;
  width: number;
  height: number;
  fileType: "png" | "jpg" | "pdf" | "mp4";
  fileSize: number;
  safeZone: number;
  distortion: number;
  originalName: string | null;
  mimeType: string | null;
  publicUrl: string | null;
  status: "pending review" | "approved" | "needs changes";
  createdAt: string;
};

export type InventoryAdvertiserResource = Creative & {
  advertiser: string;
  campaign: string;
  start: string;
  end: string;
  bookingStatus: Booking["status"];
};

export const formats = {
  digital: {
    label: "Digital Screen",
    ratio: 16 / 9,
    spec: "1920 x 1080, JPG/PNG/MP4, 10s loop",
    maxSize: 250,
    safeZone: 8,
    priceMultiplier: 1.25,
  },
  static: {
    label: "Static Billboard",
    ratio: 4 / 1,
    spec: "5760 x 1440, PDF/JPG, CMYK ready",
    maxSize: 500,
    safeZone: 6,
    priceMultiplier: 1,
  },
  transit: {
    label: "Transit Panel",
    ratio: 3 / 1,
    spec: "3000 x 1000, PDF/JPG, 150 DPI",
    maxSize: 300,
    safeZone: 10,
    priceMultiplier: 0.8,
  },
} satisfies Record<FormatKey, {
  label: string;
  ratio: number;
  spec: string;
  maxSize: number;
  safeZone: number;
  priceMultiplier: number;
}>;

export const locations = [
  { id: "thunder-bay", label: "Thunder Bay, ON", x: 67.29, y: 40.95 },
  { id: "downtown", label: "Downtown Port Arthur", x: 67.29, y: 40.88 },
  { id: "airport", label: "Thunder Bay Airport", x: 67.17, y: 41.05 },
  { id: "university", label: "Lakehead University", x: 67.32, y: 40.94 },
  { id: "retail", label: "Intercity Retail District", x: 67.33, y: 40.99 },
  { id: "waterfront", label: "Marina Park Waterfront", x: 67.28, y: 40.88 },
];

export const businesses = [
  { name: "Northline Fitness", category: "fitness", x: 67.28, y: 40.95 },
  { name: "Civic Bank", category: "finance", x: 67.32, y: 40.89 },
  { name: "Mesa Burger", category: "restaurant", x: 67.46, y: 41.02 },
  { name: "Atlas Grocery", category: "retail", x: 67.43, y: 41.08 },
  { name: "Bluebird Cinema", category: "entertainment", x: 67.25, y: 41.13 },
  { name: "Arcade Coffee", category: "restaurant", x: 67.39, y: 40.81 },
  { name: "Sprint Wireless", category: "telecom", x: 67.15, y: 41.05 },
  { name: "Bloom Pharmacy", category: "health", x: 67.33, y: 40.96 },
];
