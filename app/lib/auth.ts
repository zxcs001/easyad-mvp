import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { InventoryItem, Role } from "../data";
import { createSessionRecord, deleteSessionRecord, getUserBySession, type DbUser } from "./db";

export const sessionCookie = "ooh_session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  const user = token ? await getUserBySession(token) : null;
  return user?.status === "banned" ? null : user;
}

export async function setSessionCookie(response: NextResponse, userId: string) {
  const token = randomBytes(32).toString("hex");
  const maxAgeSeconds = 60 * 60 * 12;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
  await createSessionRecord(token, userId, expiresAt.toISOString());
  response.cookies.set(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    maxAge: maxAgeSeconds,
    path: "/",
    priority: "high",
  });
}

export async function clearSessionCookie(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(sessionCookie)?.value;
  if (token) await deleteSessionRecord(token);
  response.cookies.set(sessionCookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: new Date(0), path: "/", priority: "high" });
}

export function canManageInventory(user: DbUser | null) {
  return user?.role === "institutional" || user?.role === "admin" || (user?.role === "operator" && Boolean(user.institutionId));
}

export function getInstitutionScope(user: DbUser | null) {
  if (user?.role === "institutional") return user.id;
  if (user?.role === "operator") return user.institutionId;
  return null;
}

export function canManageInventoryRecord(user: DbUser | null, inventory: InventoryItem) {
  if (user?.role === "admin") return true;
  const institutionId = getInstitutionScope(user);
  return Boolean(institutionId && inventory.institutionId === institutionId);
}

export function canBuyAds(user: DbUser | null) {
  return user?.role === "advertiser" || user?.role === "admin";
}

export function canSubmitCreative(user: DbUser | null, bookingOwnerId: string | null) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.role === "advertiser" && bookingOwnerId === user.id;
}

export function canReadBooking(user: DbUser | null, bookingOwnerId: string | null, inventory: InventoryItem | null) {
  if (!user || !inventory) return false;
  if (user.role === "advertiser") return bookingOwnerId === user.id;
  return canManageInventoryRecord(user, inventory);
}

export function isAllowedRole(value: string | null): value is Role {
  return value === "advertiser" || value === "operator" || value === "institutional" || value === "admin";
}
