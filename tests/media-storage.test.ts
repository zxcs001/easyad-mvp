import * as assert from "node:assert/strict";
import path from "node:path";
import { afterEach, test } from "vitest";
import { deleteStoredMedia, mediaStorageProvider, readStoredMedia, storeMedia } from "../app/lib/media-storage";

const originalProvider = process.env.MEDIA_STORAGE_PROVIDER;
const originalBucket = process.env.MEDIA_BUCKET;

afterEach(() => {
  if (originalProvider === undefined) delete process.env.MEDIA_STORAGE_PROVIDER;
  else process.env.MEDIA_STORAGE_PROVIDER = originalProvider;
  if (originalBucket === undefined) delete process.env.MEDIA_BUCKET;
  else process.env.MEDIA_BUCKET = originalBucket;
});

test("local media storage persists, reads, and deletes an object", async () => {
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  delete process.env.MEDIA_BUCKET;
  const key = `tests/${Date.now()}-storage.txt`;
  const bytes = Buffer.from("durable media");
  const storagePath = await storeMedia(key, bytes, "text/plain");

  assert.equal(mediaStorageProvider(), "local");
  assert.equal(storagePath, path.join(process.cwd(), ".data", "uploads", key));
  assert.deepEqual((await readStoredMedia(storagePath)).bytes, bytes);

  await deleteStoredMedia(storagePath);
  await assert.rejects(() => readStoredMedia(storagePath));
});

test("media storage rejects traversal keys and paths", async () => {
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  await assert.rejects(() => storeMedia("../outside.txt", Buffer.from("no"), "text/plain"));
  await assert.rejects(() => readStoredMedia(path.join(process.cwd(), "outside.txt")));
});

test("S3 storage requires a bucket", async () => {
  process.env.MEDIA_STORAGE_PROVIDER = "s3";
  delete process.env.MEDIA_BUCKET;
  await assert.rejects(
    () => storeMedia("inventory/test.png", Buffer.from("x"), "image/png"),
    /MEDIA_BUCKET is required/,
  );
});

test("S3 media references cannot escape the configured bucket", async () => {
  process.env.MEDIA_STORAGE_PROVIDER = "s3";
  process.env.MEDIA_BUCKET = "approved-media";
  await assert.rejects(
    () => readStoredMedia("s3://another-bucket/inventory/test.png"),
    /outside the configured bucket/,
  );
});
