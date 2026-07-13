import { NextRequest } from "next/server";
import { getPublicMediaResource } from "../../../../../../lib/db";
import { readStoredMedia, storedMediaSize } from "../../../../../../lib/media-storage";
import { absoluteRequestUrl, publicApiJson, publicApiOptions } from "../../../../../../lib/public-api";
import { getActiveDeviceMedia, resolveDeviceMediaItem } from "../../../../../../lib/public-device-media";

type RouteContext = {
  params: Promise<{ id: string; media: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id, media } = await context.params;
  const result = await getActiveDeviceMedia(id);
  if (!result) return publicApiJson({ error: "Published device not found" }, { status: 404, cacheControl: "no-store" });

  const item = resolveDeviceMediaItem(result.items, media);
  if (!item) return publicApiJson({ error: "Active media item not found" }, { status: 404, cacheControl: "no-store" });

  const devicePath = `/api/public/devices/${encodeURIComponent(result.inventory.id)}/media`;
  const mediaUrl = absoluteRequestUrl(request, item.publicUrl);
  const metadata = {
    apiVersion: "1.0",
    generatedAt: new Date().toISOString(),
    device: {
      id: result.inventory.id,
      name: result.inventory.name,
      imageIntervalSeconds: result.inventory.imageInterval,
      totalMedia: result.items.length,
      totalImages: result.items.filter((entry) => entry.mediaType === "image").length,
      totalVideos: result.items.filter((entry) => entry.mediaType === "video").length,
      apiUrl: absoluteRequestUrl(request, devicePath),
    },
    item: {
      position: item.position,
      id: item.id,
      source: item.source,
      mediaType: item.mediaType,
      mimeType: item.mimeType,
      title: item.title,
      originalName: item.originalName,
      advertiser: item.advertiser,
      campaign: item.campaign,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      createdAt: item.createdAt,
      currentlyShowing: true,
      mediaUrl,
      stableApiUrl: absoluteRequestUrl(request, `${devicePath}/${encodeURIComponent(item.id)}`),
      positionApiUrl: absoluteRequestUrl(request, `${devicePath}/${item.position}`),
    },
  };

  if (item.mediaType === "video" || request.nextUrl.searchParams.get("encoding") === "url") {
    return publicApiJson({ ...metadata, content: { encoding: "url", url: mediaUrl } });
  }

  const resource = await getPublicMediaResource(item.id);
  if (!resource || !resource.mimeType.startsWith("image/")) {
    return publicApiJson({ error: "Image file is unavailable" }, { status: 404, cacheControl: "no-store" });
  }

  try {
    const fileSize = await storedMediaSize(resource.storagePath);
    const maxBase64Bytes = configuredBase64Limit();
    if (fileSize > maxBase64Bytes) {
      return publicApiJson({
        ...metadata,
        error: "Image exceeds the Base64 response limit",
        content: { encoding: "url", url: mediaUrl, bytes: fileSize },
      }, { status: 413, cacheControl: "no-store" });
    }
    const file = await readStoredMedia(resource.storagePath);
    return publicApiJson({
      ...metadata,
      content: {
        encoding: "base64",
        mimeType: resource.mimeType,
        bytes: file.size,
        data: file.bytes.toString("base64"),
      },
    });
  } catch {
    return publicApiJson({ error: "Image file is unavailable" }, { status: 404, cacheControl: "no-store" });
  }
}

export function OPTIONS() {
  return publicApiOptions();
}

function configuredBase64Limit() {
  const configured = Number(process.env.PUBLIC_API_BASE64_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 50 * 1024 * 1024) : 20 * 1024 * 1024;
}
