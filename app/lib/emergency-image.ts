import sharp from "sharp";
import { inspectMediaUpload } from "./uploads";
import { emergencyImageMaxBytes } from "./emergency-image-limits";

export async function prepareEmergencyImage(file: File) {
  if (!file.size || file.size > emergencyImageMaxBytes) return null;
  const upload = await inspectMediaUpload(file, ["png", "jpg", "webp"]);
  if (!upload) return null;
  try {
    // Decode before publishing. Normalize orientation, strip metadata and bound
    // download size without cropping the subject's face or the original frame.
    const bytes = await sharp(upload.bytes, { limitInputPixels: 40_000_000, failOn: "warning" })
      .rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    return { bytes, mimeType: "image/jpeg" };
  } catch { return null; }
}
