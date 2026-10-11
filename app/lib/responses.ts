// Response tracking: one QR code and short link per booking, so an advertiser
// sees what an ad made people do, not only that it played. Server only.
//
// - /go/{code} counts a response and sends the person to the advertiser's page.
// - A response event stores only its time: no IP address, cookie or device.
// - Link-preview bots and HEAD requests are not counted.
// - A promo code and its redemptions are what the advertiser reports; the
//   report labels them as reported, never as measured.
import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { getDb, initializeDatabase } from "./db";

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;
export const MAX_DESTINATION_LENGTH = 500;

export class ResponseLinkError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type ResponseSummary = {
  bookingId: string;
  code: string;
  shortUrl: string;
  destinationUrl: string;
  onAd: boolean;
  promoCode: string | null;
  promoRedemptions: number;
  promoUpdatedAt: string | null;
  responses: number;
  /** The last 14 days, oldest first, in UTC days. */
  daily: { date: string; count: number }[];
  firstResponseAt: string | null;
  lastResponseAt: string | null;
};

export function newResponseCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export function isResponseCode(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}

/** Only absolute http(s) addresses, so a QR code can never open a script or a local file. */
export function cleanDestination(value: unknown) {
  if (typeof value !== "string") throw new ResponseLinkError(400, "Enter the web address people should open.");
  const trimmed = value.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try { url = new URL(candidate); } catch { throw new ResponseLinkError(400, "Enter a web address such as yourbusiness.ca/offer."); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new ResponseLinkError(400, "Enter a web address such as yourbusiness.ca/offer.");
  if (url.href.length > MAX_DESTINATION_LENGTH) throw new ResponseLinkError(400, "That web address is too long. Use a shorter page address.");
  return url.href;
}

export function shortUrlFor(code: string, origin = process.env.APP_ORIGIN ?? "") {
  return `${origin.replace(/\/$/, "")}/go/${code}`;
}

// Link unfurlers and crawlers fetch a URL without a person behind it.
const botPattern = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|embedly|quora|pinterest|vkshare|w3c_validator|curl|wget|python-requests|httpclient|headless/i;

export function isAutomatedRequest(method: string, userAgent: string | null) {
  return method !== "GET" || !userAgent || botPattern.test(userAgent);
}

/**
 * Creates the booking's link, or updates its destination and promo code. The
 * code never changes, so a QR code already printed keeps working. Leaving
 * promoCode out keeps the stored one.
 */
export async function saveResponseLink(bookingId: string, actorId: string, input: { destinationUrl: unknown; promoCode?: unknown; onAd?: boolean }) {
  const destinationUrl = cleanDestination(input.destinationUrl);
  const promoCode = typeof input.promoCode === "string" && input.promoCode.trim() ? input.promoCode.trim().slice(0, 24) : null;
  await initializeDatabase();
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await getDb().query<{ code: string }>(`
        INSERT INTO response_links (code,booking_id,destination_url,on_ad,promo_code,created_by,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
        ON CONFLICT (booking_id) DO UPDATE SET destination_url=EXCLUDED.destination_url,
          promo_code=CASE WHEN $8 THEN response_links.promo_code ELSE EXCLUDED.promo_code END,
          on_ad=response_links.on_ad OR EXCLUDED.on_ad, updated_at=EXCLUDED.updated_at
        RETURNING code`, [newResponseCode(), bookingId, destinationUrl, Boolean(input.onAd), promoCode, actorId, now, input.promoCode === undefined]);
      return result.rows[0].code;
    } catch (error) {
      // A random code collided with another booking's code: draw again.
      if ((error as { code?: string; constraint?: string }).code === "23505" && (error as { constraint?: string }).constraint === "response_links_pkey") continue;
      throw error;
    }
  }
  throw new ResponseLinkError(503, "Could not create a short link. Try again.");
}

export async function setPromoRedemptions(bookingId: string, redemptions: unknown) {
  const count = Number(redemptions);
  if (!Number.isInteger(count) || count < 0 || count > 1_000_000) throw new ResponseLinkError(400, "Enter the number of times the promo code was used.");
  await initializeDatabase();
  const result = await getDb().query("UPDATE response_links SET promo_redemptions=$2, promo_updated_at=$3, updated_at=$3 WHERE booking_id=$1 AND promo_code IS NOT NULL", [bookingId, count, new Date().toISOString()]);
  if (!result.rowCount) throw new ResponseLinkError(409, "Add a promo code before recording its use.");
  return count;
}

/** Counts a response and returns where to send the person. Null for an unknown code. */
export async function followResponseLink(code: string, count: boolean) {
  if (!isResponseCode(code)) return null;
  await initializeDatabase();
  const link = (await getDb().query<{ destination_url: string }>("SELECT destination_url FROM response_links WHERE code=$1", [code])).rows[0];
  if (!link) return null;
  if (count) await getDb().query("INSERT INTO response_events (code) VALUES ($1)", [code]);
  return link.destination_url;
}

export async function responseSummaries(bookingIds: string[], now = new Date()): Promise<ResponseSummary[]> {
  if (!bookingIds.length) return [];
  await initializeDatabase();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13));
  const rows = (await getDb().query<{ booking_id: string; code: string; destination_url: string; on_ad: boolean; promo_code: string | null; promo_redemptions: number; promo_updated_at: string | null; responses: number; first_at: Date | null; last_at: Date | null; daily: { date: string; count: number }[] | null }>(`
    SELECT l.booking_id,l.code,l.destination_url,l.on_ad,l.promo_code,l.promo_redemptions,l.promo_updated_at,
      (SELECT COUNT(*) FROM response_events e WHERE e.code=l.code)::int responses,
      (SELECT MIN(occurred_at) FROM response_events e WHERE e.code=l.code) first_at,
      (SELECT MAX(occurred_at) FROM response_events e WHERE e.code=l.code) last_at,
      (SELECT json_agg(json_build_object('date',d,'count',c)) FROM (
        SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD') d, COUNT(*)::int c FROM response_events e WHERE e.code=l.code AND occurred_at >= $2 GROUP BY 1
      ) days) daily
    FROM response_links l WHERE l.booking_id = ANY($1::text[])`, [bookingIds, since.toISOString()])).rows;
  return rows.map((row) => {
    const counts = new Map((row.daily ?? []).map((entry) => [entry.date, entry.count]));
    const daily = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(since.getTime() + index * 86400000).toISOString().slice(0, 10);
      return { date, count: counts.get(date) ?? 0 };
    });
    return {
      bookingId: row.booking_id, code: row.code, shortUrl: shortUrlFor(row.code), destinationUrl: row.destination_url, onAd: row.on_ad,
      promoCode: row.promo_code, promoRedemptions: Number(row.promo_redemptions), promoUpdatedAt: row.promo_updated_at,
      responses: Number(row.responses), daily, firstResponseAt: row.first_at?.toISOString() ?? null, lastResponseAt: row.last_at?.toISOString() ?? null,
    };
  });
}

/** A QR code as SVG markup. Error correction M survives a little glare on a screen. */
export function responseQrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
