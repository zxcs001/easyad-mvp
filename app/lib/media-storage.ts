import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredMedia = {
  bytes: Buffer;
  size: number;
};

const localStorageRoot = path.join(process.cwd(), ".data", "uploads");
let s3Client: S3Client | null = null;

export function mediaStorageProvider() {
  const configured = process.env.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase();
  if (configured && configured !== "local" && configured !== "s3") {
    throw new Error("MEDIA_STORAGE_PROVIDER must be either local or s3");
  }
  return configured ?? (process.env.MEDIA_BUCKET ? "s3" : "local");
}

export function mediaStorageStatus() {
  const provider = mediaStorageProvider();
  return {
    provider,
    configured: provider === "local" || Boolean(process.env.MEDIA_BUCKET),
  };
}

export async function storeMedia(key: string, bytes: Buffer, mimeType: string) {
  const normalizedKey = normalizeKey(key);
  if (mediaStorageProvider() === "s3") {
    const bucket = requiredBucket();
    await client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: prefixedKey(normalizedKey),
      Body: bytes,
      ContentType: mimeType,
    }));
    return `s3://${bucket}/${prefixedKey(normalizedKey)}`;
  }

  const storagePath = localPath(normalizedKey);
  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, bytes);
  return storagePath;
}

export async function readStoredMedia(storagePath: string): Promise<StoredMedia> {
  const s3 = parseS3Reference(storagePath);
  if (s3) {
    const response = await client().send(new GetObjectCommand({ Bucket: s3.bucket, Key: s3.key }));
    if (!response.Body) throw new Error("Stored media has no body");
    const bytes = Buffer.from(await response.Body.transformToByteArray());
    return { bytes, size: response.ContentLength ?? bytes.byteLength };
  }

  const resolved = safeLocalPath(storagePath);
  const [bytes, details] = await Promise.all([readFile(resolved), stat(resolved)]);
  return { bytes, size: details.size };
}

export async function storedMediaSize(storagePath: string) {
  const s3 = parseS3Reference(storagePath);
  if (s3) {
    const response = await client().send(new HeadObjectCommand({ Bucket: s3.bucket, Key: s3.key }));
    return response.ContentLength ?? 0;
  }
  return (await stat(safeLocalPath(storagePath))).size;
}

export async function deleteStoredMedia(storagePath: string) {
  const s3 = parseS3Reference(storagePath);
  if (s3) {
    await client().send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: s3.key }));
    return;
  }
  await unlink(safeLocalPath(storagePath));
}

function client() {
  if (!s3Client) s3Client = new S3Client({ region: process.env.AWS_REGION ?? "ca-central-1" });
  return s3Client;
}

function requiredBucket() {
  const bucket = process.env.MEDIA_BUCKET?.trim();
  if (!bucket) throw new Error("MEDIA_BUCKET is required when S3 media storage is enabled");
  return bucket;
}

function prefixedKey(key: string) {
  const prefix = process.env.MEDIA_KEY_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${key}` : key;
}

function normalizeKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "." || !part)) {
    throw new Error("Invalid media storage key");
  }
  return normalized;
}

function localPath(key: string) {
  return safeLocalPath(path.join(localStorageRoot, key));
}

function safeLocalPath(storagePath: string) {
  const root = path.resolve(localStorageRoot);
  const resolved = path.resolve(storagePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid local media path");
  return resolved;
}

function parseS3Reference(storagePath: string) {
  if (!storagePath.startsWith("s3://")) return null;
  const withoutScheme = storagePath.slice(5);
  const separator = withoutScheme.indexOf("/");
  if (separator <= 0 || separator === withoutScheme.length - 1) throw new Error("Invalid S3 media reference");
  const reference = { bucket: withoutScheme.slice(0, separator), key: withoutScheme.slice(separator + 1) };
  const configuredBucket = requiredBucket();
  if (reference.bucket !== configuredBucket) throw new Error("S3 media reference is outside the configured bucket");
  const prefix = process.env.MEDIA_KEY_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
  if (prefix && reference.key !== prefix && !reference.key.startsWith(`${prefix}/`)) {
    throw new Error("S3 media reference is outside the configured prefix");
  }
  return reference;
}
