import { NextRequest } from "next/server";
import { absoluteRequestUrl, publicApiJson, publicApiOptions } from "../../../../../lib/public-api";
import { getActiveDeviceMedia } from "../../../../../lib/public-device-media";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const result = await getActiveDeviceMedia(id);
  if (!result) return publicApiJson({ error: "Published device not found" }, { status: 404, cacheControl: "no-store" });

  const images = result.items.filter((item) => item.mediaType === "image").length;
  const videos = result.items.length - images;
  const devicePath = `/api/public/devices/${encodeURIComponent(result.inventory.id)}/media`;

  return publicApiJson({
    apiVersion: "1.0",
    generatedAt: new Date().toISOString(),
    device: {
      id: result.inventory.id,
      name: result.inventory.name,
      address: result.inventory.address,
      format: result.inventory.format,
      displayTemplate: result.inventory.displayTemplate ?? "fullscreen",
      imageIntervalSeconds: result.inventory.imageInterval,
      links: {
        api: absoluteRequestUrl(request, devicePath),
        display: absoluteRequestUrl(request, `/devices/${encodeURIComponent(result.inventory.id)}`),
        inventory: absoluteRequestUrl(request, `/inventory/${encodeURIComponent(result.inventory.id)}`),
      },
    },
    summary: {
      total: result.items.length,
      images,
      videos,
    },
    items: result.items.map((item) => ({
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
      representation: item.mediaType === "image" ? "base64" : "url",
      apiUrl: absoluteRequestUrl(request, `${devicePath}/${encodeURIComponent(item.id)}`),
      positionApiUrl: absoluteRequestUrl(request, `${devicePath}/${item.position}`),
      mediaUrl: absoluteRequestUrl(request, item.publicUrl),
    })),
  });
}

export function OPTIONS() {
  return publicApiOptions();
}
