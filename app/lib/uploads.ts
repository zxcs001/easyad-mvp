export type UploadedMedia = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "video/mp4" | "video/webm";
  extension: "png" | "jpg" | "webp" | "mp4" | "webm";
  mediaType: "image" | "video";
};

const maxUploadBytes = 50 * 1024 * 1024;

export async function inspectMediaUpload(file: File, allowedExtensions: UploadedMedia["extension"][]) {
  if (!file.size || file.size > maxUploadBytes) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectMedia(bytes);
  if (!detected || !allowedExtensions.includes(detected.extension) || file.type !== detected.mimeType) return null;
  return { bytes, ...detected } satisfies UploadedMedia;
}

export function isSafeMediaMimeType(value: string) {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp" || value === "video/mp4" || value === "video/webm";
}

function detectMedia(bytes: Buffer): Omit<UploadedMedia, "bytes"> | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", extension: "png", mediaType: "image" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg", mediaType: "image" };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mimeType: "image/webp", extension: "webp", mediaType: "image" };
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    return { mimeType: "video/mp4", extension: "mp4", mediaType: "video" };
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { mimeType: "video/webm", extension: "webm", mediaType: "video" };
  }
  return null;
}
