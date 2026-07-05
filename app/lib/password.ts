import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const iterations = 120000;
const keyLength = 32;
const digest = "sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [storedIterations, salt, hash] = stored.split(":");
  if (!storedIterations || !salt || !hash) return false;
  const candidate = pbkdf2Sync(password, salt, Number(storedIterations), keyLength, digest);
  const existing = Buffer.from(hash, "hex");
  return existing.length === candidate.length && timingSafeEqual(existing, candidate);
}

export function isAcceptablePassword(password: string) {
  return password.length >= 10 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

export function constantTimeEquals(left: string, right: string) {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}
