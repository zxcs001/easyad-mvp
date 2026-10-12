import sharp from "sharp";
import { MAX_LOGO_BYTES } from "../creative-design";

/** Decode before embedding. MIME strings and a base64 prefix are not evidence
 * that an image is valid. Bounds also prevent oversized decoded images. */
export async function validateDesignLogo(dataUrl: string) {
  if (!dataUrl) return;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("Choose a valid PNG or JPEG logo.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw new Error("Choose a PNG or JPEG logo up to 128 KB after resizing.");
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 1024 * 1024 }).metadata();
    if (metadata.format !== match[1] || !metadata.width || !metadata.height || metadata.width > 1024 || metadata.height > 1024 || (metadata.pages ?? 1) !== 1) throw new Error();
    // Metadata alone can accept a truncated image. Force a full decode.
    await sharp(bytes, { limitInputPixels: 1024 * 1024 }).raw().toBuffer();
  } catch { throw new Error("Choose a valid PNG or JPEG logo no larger than 1024 × 1024."); }
}
