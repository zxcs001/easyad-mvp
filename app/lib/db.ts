import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";
import { ApprovalEvent, Booking, Creative, DisplayTemplate, InventoryAdvertiserResource, InventoryComment, InventoryItem, MediaResource, PopLog, Role, Transaction, TransactionStatus, UserStatus, displayTemplates } from "../data";
import { expectedPlays, splitRevenue } from "../utils";

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  status?: UserStatus;
  institution_id?: string | null;
  operator_limit?: number;
  created_at: string;
};

type InventoryRow = {
  id: string;
  name: string;
  operator: string;
  format: InventoryItem["format"];
  x: number;
  y: number;
  address: string;
  price: number;
  impressions: number;
  traffic: number;
  income: number;
  audience: string;
  competitor: InventoryItem["competitor"];
  occupancy: number;
  image_interval: number;
  max_loop_seconds: number;
  available_from: string;
  available_to: string;
  approval_status: NonNullable<InventoryItem["approvalStatus"]>;
  tags: unknown;
  display_template: string | null;
  comments_enabled: boolean;
  institution_id: string | null;
};

type BookingRow = {
  id: string;
  advertiser: string;
  inventory_id: string;
  campaign: string;
  start_date: string;
  end_date: string;
  ad_slots: number;
  creative_status: Booking["creativeStatus"];
  status: Booking["status"];
  spend: number;
  paid: boolean;
  pop: number;
  created_by: string | null;
};

type ApprovalEventRow = {
  id: string;
  booking_id: string;
  action: ApprovalEvent["action"];
  previous_status: Booking["status"];
  next_status: Booking["status"];
  created_at: string;
  campaign: string;
  inventory_id: string;
  actor_name: string;
};

type MediaRow = {
  id: string;
  inventory_id: string;
  owner_id: string;
  title: string;
  original_name: string;
  mime_type: string;
  media_type: MediaResource["mediaType"];
  size_bytes: number;
  storage_path: string;
  public_url: string;
  created_at: string;
};

type TransactionRow = {
  id: string;
  booking_id: string;
  advertiser: string;
  amount: number;
  platform_fee: number;
  operator_payout: number;
  status: TransactionStatus;
  method: string;
  gateway_ref: string | null;
  created_at: string;
  paid_at: string | null;
};

type PopLogRow = {
  id: string;
  booking_id: string;
  inventory_id: string;
  plays: number;
  impressions: number;
  status: PopLog["status"];
  source: string;
  played_at: string;
};

type CreativeRow = {
  id: string;
  booking_id: string;
  source: Creative["source"];
  template: Creative["template"];
  format: Creative["format"];
  width: number;
  height: number;
  file_type: Creative["fileType"];
  file_size: number;
  safe_zone: number;
  distortion: number;
  original_name: string | null;
  mime_type: string | null;
  public_url: string | null;
  storage_path: string | null;
  status: Creative["status"];
  created_at: string;
};

type InventoryAdvertiserResourceRow = CreativeRow & {
  advertiser: string;
  campaign: string;
  start_date: string;
  end_date: string;
  booking_status: Booking["status"];
};

type PublicMediaRow = {
  original_name: string | null;
  mime_type: string | null;
  storage_path: string;
};

type InventoryCommentRow = {
  id: string;
  inventory_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export type DbUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  institutionId: string | null;
  operatorLimit: number;
  createdAt: string;
};

const dataDir = path.join(process.cwd(), ".data");
export const uploadsDir = path.join(dataDir, "uploads");

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getDb() {
  return getPool();
}

function getPool() {
  if (!pool) {
    mkdirSync(uploadsDir, { recursive: true });
    const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "postgres://postgres:postgres@localhost:5432/ooh_market";
    pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!schemaReady) schemaReady = migrate();
  return schemaReady;
}

async function migrate() {
  const database = getPool();
  await database.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('advertiser', 'operator', 'institutional', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
      institution_id TEXT,
      operator_limit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      operator TEXT NOT NULL,
      format TEXT NOT NULL,
      x DOUBLE PRECISION NOT NULL,
      y DOUBLE PRECISION NOT NULL,
      address TEXT NOT NULL,
      price INTEGER NOT NULL,
      impressions INTEGER NOT NULL,
      traffic INTEGER NOT NULL,
      income INTEGER NOT NULL,
      audience TEXT NOT NULL,
      competitor TEXT NOT NULL,
      occupancy INTEGER NOT NULL,
      image_interval INTEGER NOT NULL DEFAULT 6,
      max_loop_seconds INTEGER NOT NULL DEFAULT 120,
      available_from TEXT NOT NULL,
      available_to TEXT NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      display_template TEXT NOT NULL DEFAULT 'fullscreen',
      comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      institution_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      advertiser TEXT NOT NULL,
      inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      campaign TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      ad_slots INTEGER NOT NULL DEFAULT 1,
      creative_status TEXT NOT NULL,
      status TEXT NOT NULL,
      spend INTEGER NOT NULL,
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      pop INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_resources (
      id TEXT PRIMARY KEY,
      inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      advertiser TEXT NOT NULL,
      amount INTEGER NOT NULL,
      platform_fee INTEGER NOT NULL,
      operator_payout INTEGER NOT NULL,
      status TEXT NOT NULL,
      method TEXT NOT NULL,
      gateway_ref TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pop_logs (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      plays INTEGER NOT NULL,
      impressions INTEGER NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      played_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creatives (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'template',
      template TEXT NOT NULL,
      format TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      safe_zone INTEGER NOT NULL,
      distortion INTEGER NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      public_url TEXT,
      storage_path TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_events (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
      previous_status TEXT NOT NULL,
      next_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_comments (
      id TEXT PRIMARY KEY,
      inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_booking ON transactions(booking_id);
    CREATE INDEX IF NOT EXISTS idx_pop_logs_booking ON pop_logs(booking_id);
    CREATE INDEX IF NOT EXISTS idx_creatives_booking ON creatives(booking_id);
    CREATE INDEX IF NOT EXISTS idx_approval_events_actor ON approval_events(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inventory_comments_inventory ON inventory_comments(inventory_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inventory_institution ON inventory(institution_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings(created_by);
  `);
  await database.query("DELETE FROM sessions WHERE expires_at <= $1", [new Date().toISOString()]);
  await backfillInventoryTags();
}

async function rows<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  await ensureSchema();
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

async function row<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await rows<T>(sql, params);
  return result[0];
}

async function exec(sql: string, params: unknown[] = []) {
  await ensureSchema();
  return getPool().query(sql, params);
}

async function backfillInventoryTags() {
  const migrationKey = "inventory-tag-backfill";
  const migrationValue = "postgres-v1";
  const completed = await getPool().query<{ value: string }>("SELECT value FROM app_metadata WHERE key = $1", [migrationKey]);
  if (completed.rows[0]?.value === migrationValue) return;
  const result = await getPool().query<InventoryRow>("SELECT * FROM inventory");
  for (const entry of result.rows) {
    const item = mapInventory(entry);
    if (item.tags?.length) continue;
    await getPool().query("UPDATE inventory SET tags = $1::jsonb WHERE id = $2", [JSON.stringify(suggestedTagsForInventory(item)), item.id]);
  }
  await getPool().query(`
    INSERT INTO app_metadata (key, value) VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [migrationKey, migrationValue]);
}

export async function resetDatabaseForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("resetDatabaseForTests is only available during tests");
  await ensureSchema();
  await getPool().query(`
    TRUNCATE inventory_comments, approval_events, creatives, pop_logs, transactions, media_resources, bookings, inventory, sessions, users, app_metadata
    RESTART IDENTITY CASCADE
  `);
}

export async function closeDb() {
  if (!pool) return;
  await pool.end();
  pool = null;
  schemaReady = null;
}

export async function listInventory() {
  return (await rows<InventoryRow>("SELECT * FROM inventory ORDER BY id")).map(mapInventory);
}

export async function listInventoryByInstitution(institutionId: string) {
  return (await rows<InventoryRow>("SELECT * FROM inventory WHERE institution_id = $1 ORDER BY id", [institutionId])).map(mapInventory);
}

export async function getInventory(id: string) {
  const entry = await row<InventoryRow>("SELECT * FROM inventory WHERE id = $1", [id]);
  return entry ? mapInventory(entry) : null;
}

export async function listPublishedInventory() {
  return (await rows<InventoryRow>("SELECT * FROM inventory WHERE approval_status = 'approved' ORDER BY id")).map(mapInventory);
}

export async function getPublishedInventory(id: string) {
  const entry = await row<InventoryRow>("SELECT * FROM inventory WHERE id = $1 AND approval_status = 'approved'", [id]);
  return entry ? mapInventory(entry) : null;
}

export async function createInventory(item: InventoryItem, userId: string, institutionId: string | null = null) {
  const now = new Date().toISOString();
  const tags = normalizeTags(item.tags);
  await exec(`
    INSERT INTO inventory
    (id, name, operator, format, x, y, address, price, impressions, traffic, income, audience, competitor, occupancy, image_interval, max_loop_seconds, available_from, available_to, approval_status, tags, display_template, comments_enabled, institution_id, created_by, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22, $23, $24, $25, $26)
  `, [item.id, item.name, item.operator, item.format, item.x, item.y, item.address, item.price, item.impressions, item.traffic, item.income, item.audience, item.competitor, item.occupancy, clampImageInterval(item.imageInterval), clampLoopCapacity(item.maxLoopSeconds), item.availableFrom, item.availableTo, item.approvalStatus ?? "approved", serializeTags(tags.length ? tags : suggestedTagsForInventory(item)), normalizeDisplayTemplate(item.displayTemplate), item.commentsEnabled !== false, institutionId, userId, now, now]);
  return getInventory(item.id);
}

export async function updateInventoryRecord(id: string, updates: Partial<InventoryItem>) {
  const current = await getInventory(id);
  if (!current) return null;
  const next = { ...current, ...updates };
  await exec(`
    UPDATE inventory SET
      name = $1, operator = $2, format = $3, x = $4, y = $5, address = $6, price = $7, impressions = $8, traffic = $9, income = $10,
      audience = $11, competitor = $12, occupancy = $13, image_interval = $14, max_loop_seconds = $15, available_from = $16, available_to = $17,
      approval_status = $18, tags = $19::jsonb, display_template = $20, comments_enabled = $21, updated_at = $22
    WHERE id = $23
  `, [next.name, next.operator, next.format, next.x, next.y, next.address, next.price, next.impressions, next.traffic, next.income, next.audience, next.competitor, next.occupancy, clampImageInterval(next.imageInterval), clampLoopCapacity(next.maxLoopSeconds), next.availableFrom, next.availableTo, next.approvalStatus ?? "approved", serializeTags(next.tags), normalizeDisplayTemplate(next.displayTemplate), next.commentsEnabled !== false, new Date().toISOString(), id]);
  return getInventory(id);
}

export async function deleteInventoryRecord(id: string) {
  await exec("DELETE FROM inventory WHERE id = $1", [id]);
}

export async function listBookings() {
  return (await rows<BookingRow>("SELECT * FROM bookings ORDER BY created_at DESC, id DESC")).map(mapBooking);
}

export async function listBookingsCreatedBy(userId: string) {
  return (await rows<BookingRow>("SELECT * FROM bookings WHERE created_by = $1 ORDER BY created_at DESC, id DESC", [userId])).map(mapBooking);
}

export async function listBookingsForInstitution(institutionId: string) {
  return (await rows<BookingRow>(`
    SELECT bookings.* FROM bookings
    JOIN inventory ON inventory.id = bookings.inventory_id
    WHERE inventory.institution_id = $1
    ORDER BY bookings.created_at DESC, bookings.id DESC
  `, [institutionId])).map(mapBooking);
}

export async function createBookingRecord(booking: Booking, userId: string) {
  const now = new Date().toISOString();
  await exec(`
    INSERT INTO bookings (id, advertiser, inventory_id, campaign, start_date, end_date, ad_slots, creative_status, status, spend, paid, pop, created_by, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  `, [booking.id, booking.advertiser, booking.inventoryId, booking.campaign, booking.start, booking.end, clampAdSlots(booking.adSlots), booking.creativeStatus, booking.status, booking.spend, booking.paid, booking.pop, userId, now, now]);
  return { ...booking, adSlots: clampAdSlots(booking.adSlots), createdBy: userId };
}

export async function updateBookingRecord(id: string, updates: Partial<Booking>) {
  const current = await getBooking(id);
  if (!current) return null;
  const next = { ...current, ...updates };
  await exec(`
    UPDATE bookings SET advertiser = $1, inventory_id = $2, campaign = $3, start_date = $4, end_date = $5, creative_status = $6,
      ad_slots = $7, status = $8, spend = $9, paid = $10, pop = $11, updated_at = $12
    WHERE id = $13
  `, [next.advertiser, next.inventoryId, next.campaign, next.start, next.end, next.creativeStatus, clampAdSlots(next.adSlots), next.status, next.spend, next.paid, next.pop, new Date().toISOString(), id]);
  return getBooking(id);
}

export async function getBooking(id: string) {
  const entry = await row<BookingRow>("SELECT * FROM bookings WHERE id = $1", [id]);
  return entry ? mapBooking(entry) : null;
}

export async function getBookingOwnerId(id: string) {
  const entry = await row<{ created_by: string | null }>("SELECT created_by FROM bookings WHERE id = $1", [id]);
  return entry?.created_by ?? null;
}

export async function createApprovalEvent(event: Omit<ApprovalEvent, "id" | "campaign" | "inventoryId" | "actorName" | "createdAt"> & { actorId: string }) {
  const id = `APR-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  await exec(`
    INSERT INTO approval_events (id, booking_id, actor_id, action, previous_status, next_status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, event.bookingId, event.actorId, event.action, event.previousStatus, event.nextStatus, createdAt]);
  return getApprovalEvent(id);
}

export async function listApprovalEvents(actorId?: string) {
  const base = `
    SELECT approval_events.*, bookings.campaign, bookings.inventory_id, users.name AS actor_name
    FROM approval_events
    JOIN bookings ON bookings.id = approval_events.booking_id
    JOIN users ON users.id = approval_events.actor_id
  `;
  const result = actorId
    ? await rows<ApprovalEventRow>(`${base} WHERE approval_events.actor_id = $1 ORDER BY approval_events.created_at DESC`, [actorId])
    : await rows<ApprovalEventRow>(`${base} ORDER BY approval_events.created_at DESC`);
  return result.map(mapApprovalEvent);
}

export async function listApprovalEventsForInstitution(institutionId: string) {
  return (await rows<ApprovalEventRow>(`
    SELECT approval_events.*, bookings.campaign, bookings.inventory_id, users.name AS actor_name
    FROM approval_events
    JOIN bookings ON bookings.id = approval_events.booking_id
    JOIN inventory ON inventory.id = bookings.inventory_id
    JOIN users ON users.id = approval_events.actor_id
    WHERE inventory.institution_id = $1
    ORDER BY approval_events.created_at DESC
  `, [institutionId])).map(mapApprovalEvent);
}

async function getApprovalEvent(id: string) {
  const entry = await row<ApprovalEventRow>(`
    SELECT approval_events.*, bookings.campaign, bookings.inventory_id, users.name AS actor_name
    FROM approval_events
    JOIN bookings ON bookings.id = approval_events.booking_id
    JOIN users ON users.id = approval_events.actor_id
    WHERE approval_events.id = $1
  `, [id]);
  return entry ? mapApprovalEvent(entry) : null;
}

export async function listPopLogs(bookingId?: string) {
  const result = bookingId
    ? await rows<PopLogRow>("SELECT * FROM pop_logs WHERE booking_id = $1 ORDER BY played_at DESC", [bookingId])
    : await rows<PopLogRow>("SELECT * FROM pop_logs ORDER BY played_at DESC");
  return result.map(mapPopLog);
}

export async function createPopLog(log: Omit<PopLog, "id">) {
  const id = `POP-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await exec(`
    INSERT INTO pop_logs (id, booking_id, inventory_id, plays, impressions, status, source, played_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [id, log.bookingId, log.inventoryId, log.plays, log.impressions, log.status, log.source, log.playedAt]);
  await recomputeBookingPop(log.bookingId);
  return { ...log, id } satisfies PopLog;
}

export async function recomputeBookingPop(bookingId: string) {
  const booking = await getBooking(bookingId);
  const inventory = booking ? await getInventory(booking.inventoryId) : null;
  if (!booking || !inventory) return null;
  const logs = await listPopLogs(bookingId);
  const verifiedPlays = logs.filter((log) => log.status === "verified").reduce((sum, log) => sum + log.plays, 0);
  const pop = Math.min(100, Math.round((verifiedPlays / Math.max(1, expectedPlays(booking.start, booking.end))) * 100));
  await exec("UPDATE bookings SET pop = $1, updated_at = $2 WHERE id = $3", [pop, new Date().toISOString(), bookingId]);
  return pop;
}

export async function listTransactions() {
  return (await rows<TransactionRow>("SELECT * FROM transactions ORDER BY created_at DESC")).map(mapTransaction);
}

export async function listTransactionsForInstitution(institutionId: string) {
  return (await rows<TransactionRow>(`
    SELECT transactions.* FROM transactions
    JOIN bookings ON bookings.id = transactions.booking_id
    JOIN inventory ON inventory.id = bookings.inventory_id
    WHERE inventory.institution_id = $1
    ORDER BY transactions.created_at DESC
  `, [institutionId])).map(mapTransaction);
}

export async function listTransactionsCreatedBy(userId: string) {
  return (await rows<TransactionRow>(`
    SELECT transactions.* FROM transactions
    JOIN bookings ON bookings.id = transactions.booking_id
    WHERE bookings.created_by = $1
    ORDER BY transactions.created_at DESC
  `, [userId])).map(mapTransaction);
}

export async function getTransactionByBooking(bookingId: string) {
  const entry = await row<TransactionRow>("SELECT * FROM transactions WHERE booking_id = $1", [bookingId]);
  return entry ? mapTransaction(entry) : null;
}

export async function ensureBookingTransactions() {
  const bookings = await listBookings();
  for (const booking of bookings) {
    if (await getTransactionByBooking(booking.id)) continue;
    const split = splitRevenue(booking.spend);
    await exec(`
      INSERT INTO transactions (id, booking_id, advertiser, amount, platform_fee, operator_payout, status, method, gateway_ref, created_at, paid_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (booking_id) DO NOTHING
    `, [
      `TX-${booking.id.replace(/^BK-/, "")}`,
      booking.id,
      booking.advertiser,
      split.gross,
      split.platformFee,
      split.operatorPayout,
      booking.paid ? "paid" : "pending",
      booking.paid ? "card" : "unpaid",
      null,
      new Date().toISOString(),
      booking.paid ? new Date().toISOString() : null,
    ]);
  }
}

export async function upsertTransaction(transaction: Transaction) {
  await exec(`
    INSERT INTO transactions (id, booking_id, advertiser, amount, platform_fee, operator_payout, status, method, gateway_ref, created_at, paid_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (booking_id) DO UPDATE SET
      advertiser = EXCLUDED.advertiser,
      amount = EXCLUDED.amount,
      platform_fee = EXCLUDED.platform_fee,
      operator_payout = EXCLUDED.operator_payout,
      status = EXCLUDED.status,
      method = EXCLUDED.method,
      gateway_ref = EXCLUDED.gateway_ref,
      paid_at = EXCLUDED.paid_at
  `, [transaction.id, transaction.bookingId, transaction.advertiser, transaction.amount, transaction.platformFee, transaction.operatorPayout, transaction.status, transaction.method, transaction.gatewayRef, transaction.createdAt, transaction.paidAt]);
  return getTransactionByBooking(transaction.bookingId);
}

export async function listCreatives(bookingId?: string) {
  const result = bookingId
    ? await rows<CreativeRow>("SELECT * FROM creatives WHERE booking_id = $1 ORDER BY created_at DESC", [bookingId])
    : await rows<CreativeRow>("SELECT * FROM creatives ORDER BY created_at DESC");
  return result.map(mapCreative);
}

export async function createCreative(creative: Omit<Creative, "id" | "createdAt"> & { id?: string; storagePath?: string | null }) {
  const id = creative.id ?? `CRV-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  await exec(`
    INSERT INTO creatives (id, booking_id, source, template, format, width, height, file_type, file_size, safe_zone, distortion, original_name, mime_type, public_url, storage_path, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
  `, [id, creative.bookingId, creative.source, creative.template, creative.format, creative.width, creative.height, creative.fileType, creative.fileSize, creative.safeZone, creative.distortion, creative.originalName, creative.mimeType, creative.publicUrl, creative.storagePath ?? null, creative.status, createdAt]);
  const { storagePath: _storagePath, ...storedCreative } = creative;
  return { ...storedCreative, id, createdAt } satisfies Creative;
}

export async function getPublicMediaResource(id: string) {
  const media = await row<PublicMediaRow>("SELECT original_name, mime_type, storage_path FROM media_resources WHERE id = $1", [id]);
  if (media) return {
    originalName: media.original_name ?? "media-resource",
    mimeType: media.mime_type ?? "application/octet-stream",
    storagePath: media.storage_path,
    cacheable: true,
  };

  const creative = await row<PublicMediaRow>(`
    SELECT creatives.original_name, creatives.mime_type, creatives.storage_path
    FROM creatives
    JOIN bookings ON bookings.id = creatives.booking_id
    WHERE creatives.id = $1
      AND creatives.source = 'upload'
      AND creatives.storage_path IS NOT NULL
      AND bookings.status IN ('approved', 'scheduled', 'live')
      AND bookings.end_date >= CURRENT_DATE::text
  `, [id]);
  return creative ? {
    originalName: creative.original_name ?? "uploaded-creative",
    mimeType: creative.mime_type ?? "application/octet-stream",
    storagePath: creative.storage_path,
    cacheable: false,
  } : null;
}

export async function listInventoryAdvertiserResources(inventoryId: string, asOf = new Date().toISOString().slice(0, 10)) {
  const result = await rows<InventoryAdvertiserResourceRow>(`
    SELECT
      creatives.*,
      bookings.advertiser,
      bookings.campaign,
      bookings.start_date,
      bookings.end_date,
      bookings.status AS booking_status
    FROM creatives
    JOIN bookings ON bookings.id = creatives.booking_id
    WHERE bookings.inventory_id = $1
      AND creatives.source = 'upload'
      AND creatives.public_url IS NOT NULL
      AND bookings.status IN ('approved', 'scheduled', 'live')
      AND bookings.end_date >= $2
    ORDER BY creatives.created_at DESC
  `, [inventoryId, asOf]);

  return result.map((entry) => ({
    ...mapCreative(entry),
    advertiser: entry.advertiser,
    campaign: entry.campaign,
    start: entry.start_date,
    end: entry.end_date,
    bookingStatus: entry.booking_status,
  } satisfies InventoryAdvertiserResource));
}

export async function listMediaResources(inventoryId?: string) {
  const result = inventoryId
    ? await rows<MediaRow>("SELECT * FROM media_resources WHERE inventory_id = $1 ORDER BY created_at DESC", [inventoryId])
    : await rows<MediaRow>("SELECT * FROM media_resources ORDER BY created_at DESC");
  return result.map(mapMedia);
}

export async function listMediaResourcesForInstitution(institutionId: string) {
  return (await rows<MediaRow>(`
    SELECT media_resources.* FROM media_resources
    JOIN inventory ON inventory.id = media_resources.inventory_id
    WHERE inventory.institution_id = $1
    ORDER BY media_resources.created_at DESC
  `, [institutionId])).map(mapMedia);
}

export async function getMediaResource(id: string) {
  const entry = await row<MediaRow>("SELECT * FROM media_resources WHERE id = $1", [id]);
  return entry ? { resource: mapMedia(entry), storagePath: entry.storage_path } : null;
}

export async function deleteMediaResource(id: string) {
  const current = await getMediaResource(id);
  if (!current) return null;
  await exec("DELETE FROM media_resources WHERE id = $1", [id]);
  return current;
}

export async function createMediaResource(resource: MediaResource & { storagePath: string }) {
  await exec(`
    INSERT INTO media_resources
    (id, inventory_id, owner_id, title, original_name, mime_type, media_type, size_bytes, storage_path, public_url, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [resource.id, resource.inventoryId, resource.ownerId, resource.title, resource.originalName, resource.mimeType, resource.mediaType, resource.sizeBytes, resource.storagePath, resource.publicUrl, resource.createdAt]);
  return resource;
}

export async function getUserByEmail(email: string) {
  return row<UserRow>("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
}

export async function countUsers() {
  const entry = await row<{ count: string }>("SELECT COUNT(*) AS count FROM users");
  return Number(entry?.count ?? 0);
}

export async function getUserById(id: string) {
  const entry = await row<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return entry ? mapUser(entry) : null;
}

export async function createUser(name: string, email: string, passwordHash: string, role: Role, options: { institutionId?: string | null; operatorLimit?: number } = {}) {
  const entry = {
    id: `USR-${Date.now().toString(36).toUpperCase()}`,
    name,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    role,
    status: "active" as const,
    institution_id: role === "operator" ? options.institutionId ?? null : null,
    operator_limit: role === "institutional" ? clampOperatorLimit(options.operatorLimit) : 0,
    created_at: new Date().toISOString(),
  };
  await exec("INSERT INTO users (id, name, email, password_hash, role, status, institution_id, operator_limit, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [entry.id, entry.name, entry.email, entry.password_hash, entry.role, entry.status, entry.institution_id, entry.operator_limit, entry.created_at]);
  return mapUser(entry);
}

export async function listNonAdminUsers() {
  return (await rows<UserRow>("SELECT * FROM users WHERE role != 'admin' ORDER BY created_at DESC, lower(name)")).map(mapUser);
}

export async function listInstitutionOperators(institutionId: string) {
  return (await rows<UserRow>("SELECT * FROM users WHERE role = 'operator' AND institution_id = $1 ORDER BY created_at DESC, lower(name)", [institutionId])).map(mapUser);
}

export async function countInstitutionOperators(institutionId: string) {
  const entry = await row<{ count: string }>("SELECT COUNT(*) AS count FROM users WHERE role = 'operator' AND institution_id = $1", [institutionId]);
  return Number(entry?.count ?? 0);
}

export async function updateManagedUser(id: string, updates: { role?: Exclude<Role, "admin">; status?: UserStatus; institutionId?: string | null; operatorLimit?: number }) {
  const current = await getUserById(id);
  if (!current || current.role === "admin") return null;
  const role = updates.role ?? current.role;
  const status = updates.status ?? current.status;
  const institutionId = role === "operator" ? updates.institutionId ?? current.institutionId : null;
  const operatorLimit = role === "institutional" ? clampOperatorLimit(updates.operatorLimit ?? current.operatorLimit) : 0;
  if (role === "operator" && !institutionId) return null;
  if (current.role === "institutional" && role !== "institutional" && await countInstitutionOperators(current.id) > 0) return null;
  if (role === "institutional" && operatorLimit < await countInstitutionOperators(current.id)) return null;
  await exec("UPDATE users SET role = $1, status = $2, institution_id = $3, operator_limit = $4 WHERE id = $5", [role, status, institutionId, operatorLimit, id]);
  if (status === "banned") await deleteSessionsForUser(id);
  return getUserById(id);
}

export async function deleteManagedUser(id: string) {
  const current = await getUserById(id);
  if (!current || current.role === "admin") return false;
  if (current.role === "institutional") await exec("DELETE FROM users WHERE institution_id = $1", [id]);
  await exec("DELETE FROM users WHERE id = $1", [id]);
  return true;
}

export async function createSessionRecord(token: string, userId: string, expiresAt: string) {
  await exec("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)", [hashSessionToken(token), userId, expiresAt, new Date().toISOString()]);
}

export async function getUserBySession(token: string) {
  const entry = await row<UserRow>(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = $1 AND sessions.expires_at > $2
  `, [hashSessionToken(token), new Date().toISOString()]);
  return entry ? mapUser(entry) : null;
}

export async function deleteSessionRecord(token: string) {
  await exec("DELETE FROM sessions WHERE token = $1", [hashSessionToken(token)]);
}

export async function deleteSessionsForUser(userId: string) {
  await exec("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

export async function listInventoryComments(inventoryId: string) {
  return (await rows<InventoryCommentRow>("SELECT * FROM inventory_comments WHERE inventory_id = $1 ORDER BY created_at ASC", [inventoryId])).map(mapInventoryComment);
}

export async function createInventoryComment(comment: Omit<InventoryComment, "id" | "createdAt">) {
  const id = `CMT-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  await exec("INSERT INTO inventory_comments (id, inventory_id, author_id, author_name, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, comment.inventoryId, comment.authorId, comment.authorName, comment.body, createdAt]);
  return { ...comment, id, createdAt } satisfies InventoryComment;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function clampOperatorLimit(value: unknown) {
  const parsed = Number(value);
  return Math.min(100, Math.max(1, Math.round(Number.isFinite(parsed) ? parsed : 5)));
}

function normalizeDisplayTemplate(value: unknown): DisplayTemplate {
  return typeof value === "string" && (displayTemplates as string[]).includes(value) ? (value as DisplayTemplate) : "fullscreen";
}

function mapInventoryComment(entry: InventoryCommentRow): InventoryComment {
  return {
    id: entry.id,
    inventoryId: entry.inventory_id,
    authorId: entry.author_id,
    authorName: entry.author_name,
    body: entry.body,
    createdAt: stringifyDate(entry.created_at),
  };
}

function mapInventory(entry: InventoryRow): InventoryItem {
  return {
    id: entry.id,
    name: entry.name,
    operator: entry.operator,
    format: entry.format,
    x: Number(entry.x),
    y: Number(entry.y),
    address: entry.address,
    price: Number(entry.price),
    impressions: Number(entry.impressions),
    traffic: Number(entry.traffic),
    income: Number(entry.income),
    audience: entry.audience,
    competitor: entry.competitor,
    occupancy: Number(entry.occupancy),
    imageInterval: clampImageInterval(Number(entry.image_interval ?? 6)),
    maxLoopSeconds: clampLoopCapacity(Number(entry.max_loop_seconds ?? 120)),
    availableFrom: entry.available_from,
    availableTo: entry.available_to,
    approvalStatus: entry.approval_status ?? "approved",
    tags: parseTags(entry.tags),
    displayTemplate: normalizeDisplayTemplate(entry.display_template),
    commentsEnabled: entry.comments_enabled !== false,
    institutionId: entry.institution_id ?? null,
  };
}

function serializeTags(value: unknown) {
  return JSON.stringify(normalizeTags(value));
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) return normalizeTags(value);
  if (typeof value === "string") {
    try {
      return normalizeTags(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .map((tag) => tag.slice(0, 40)))]
    .slice(0, 30);
}

function suggestedTagsForInventory(item: InventoryItem) {
  const audience = item.audience.toLowerCase();
  const context = `${item.name} ${item.address} ${item.operator}`.toLowerCase();
  const tags = [
    item.format === "digital" ? "digital" : "physical",
    item.impressions >= 130000 ? "large" : item.impressions >= 70000 ? "medium" : "small",
    item.income >= 110000 ? "high-income" : item.income >= 75000 ? "medium-income" : "low-income",
    item.format === "transit" ? "near-transit" : "commercial",
    audience.includes("student") ? "18-24" : audience.includes("professional") ? "35-49" : "25-34",
    audience.includes("student") ? "near-university" : "urban",
    audience.includes("commuter") ? "near-major-highway" : "private",
  ];
  if (context.includes("university")) tags.push("near-university");
  if (context.includes("airport") || context.includes("tourism")) tags.push("tourism");
  if (context.includes("retail") || context.includes("mall")) tags.push("retail");
  if (context.includes("arena") || context.includes("stadium")) tags.push("sports");
  return normalizeTags(tags);
}

function clampImageInterval(value: number) {
  return Math.min(60, Math.max(2, Math.round(Number.isFinite(value) ? value : 6)));
}

function clampLoopCapacity(value: number) {
  return Math.min(3600, Math.max(2, Math.round(Number.isFinite(value) ? value : 120)));
}

function clampAdSlots(value: number) {
  return Math.min(100, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));
}

function mapBooking(entry: BookingRow): Booking {
  return {
    id: entry.id,
    advertiser: entry.advertiser,
    inventoryId: entry.inventory_id,
    campaign: entry.campaign,
    start: entry.start_date,
    end: entry.end_date,
    adSlots: clampAdSlots(Number(entry.ad_slots ?? 1)),
    creativeStatus: entry.creative_status,
    status: entry.status,
    spend: Number(entry.spend),
    paid: Boolean(entry.paid),
    pop: Number(entry.pop),
    createdBy: entry.created_by ?? undefined,
  };
}

function mapApprovalEvent(entry: ApprovalEventRow): ApprovalEvent {
  return {
    id: entry.id,
    bookingId: entry.booking_id,
    campaign: entry.campaign,
    inventoryId: entry.inventory_id,
    action: entry.action,
    previousStatus: entry.previous_status,
    nextStatus: entry.next_status,
    actorName: entry.actor_name,
    createdAt: stringifyDate(entry.created_at),
  };
}

function mapMedia(entry: MediaRow): MediaResource {
  return {
    id: entry.id,
    inventoryId: entry.inventory_id,
    ownerId: entry.owner_id,
    title: entry.title,
    originalName: entry.original_name,
    mimeType: entry.mime_type,
    mediaType: entry.media_type,
    sizeBytes: Number(entry.size_bytes),
    publicUrl: entry.public_url,
    createdAt: stringifyDate(entry.created_at),
  };
}

function mapUser(entry: UserRow): DbUser {
  return {
    id: entry.id,
    name: entry.name,
    email: entry.email,
    role: entry.role,
    status: entry.status === "banned" ? "banned" : "active",
    institutionId: entry.institution_id ?? null,
    operatorLimit: entry.role === "institutional" ? clampOperatorLimit(entry.operator_limit) : 0,
    createdAt: stringifyDate(entry.created_at),
  };
}

function mapTransaction(entry: TransactionRow): Transaction {
  return {
    id: entry.id,
    bookingId: entry.booking_id,
    advertiser: entry.advertiser,
    amount: Number(entry.amount),
    platformFee: Number(entry.platform_fee),
    operatorPayout: Number(entry.operator_payout),
    status: entry.status,
    method: entry.method,
    gatewayRef: entry.gateway_ref,
    createdAt: stringifyDate(entry.created_at),
    paidAt: entry.paid_at ? stringifyDate(entry.paid_at) : null,
  };
}

function mapPopLog(entry: PopLogRow): PopLog {
  return {
    id: entry.id,
    bookingId: entry.booking_id,
    inventoryId: entry.inventory_id,
    plays: Number(entry.plays),
    impressions: Number(entry.impressions),
    status: entry.status,
    source: entry.source,
    playedAt: stringifyDate(entry.played_at),
  };
}

function mapCreative(entry: CreativeRow): Creative {
  return {
    id: entry.id,
    bookingId: entry.booking_id,
    source: entry.source ?? "template",
    template: entry.template,
    format: entry.format,
    width: Number(entry.width),
    height: Number(entry.height),
    fileType: entry.file_type,
    fileSize: Number(entry.file_size),
    safeZone: Number(entry.safe_zone),
    distortion: Number(entry.distortion),
    originalName: entry.original_name,
    mimeType: entry.mime_type,
    publicUrl: entry.public_url,
    status: entry.status,
    createdAt: stringifyDate(entry.created_at),
  };
}

function stringifyDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
