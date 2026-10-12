import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { canBuyAds, getCurrentUser } from "../../../lib/auth";
import { inspectMediaUpload } from "../../../lib/uploads";
import { MAX_LOGO_BYTES } from "../../../creative-design";

export async function POST(request: NextRequest) {
  if (!canBuyAds(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a PNG or JPEG logo." }, { status: 422 });
    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Logo uploads must be 2 MB or smaller." }, { status: 422 });
    const upload = await inspectMediaUpload(file, ["png", "jpg"]);
    if (!upload) throw new Error();
    const bytes = await sharp(upload.bytes, { limitInputPixels: 4096 * 4096 }).rotate().resize({ width: 512, height: 320, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    if (bytes.length > MAX_LOGO_BYTES) return NextResponse.json({ error: "This logo is too detailed. Choose a simpler or smaller image." }, { status: 422 });
    return NextResponse.json({ logoDataUrl: `data:image/png;base64,${bytes.toString("base64")}` }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Choose a valid PNG or JPEG logo." }, { status: 422 }); }
}
