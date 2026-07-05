import { notFound } from "next/navigation";
import { DeviceMediaSlide } from "../../component/device-media-carousel";
import DeviceScreen from "../../component/device-screen";
import { resolveDeviceTemplate } from "../../component/device-templates";
import { getPublishedInventory, listInventoryAdvertiserResources, listMediaResources } from "../../lib/db";

type DevicePublicPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function deriveCity(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(-1)[0] : "Thunder Bay, ON";
}

export default async function DevicePublicPage({ params, searchParams }: DevicePublicPageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const inventory = await getPublishedInventory(id);
  if (!inventory) notFound();

  const templateParam = Array.isArray(query.template) ? query.template[0] : query.template;
  const template = resolveDeviceTemplate(templateParam, inventory.displayTemplate);
  const city = deriveCity(inventory.address);

  const deviceSlides: DeviceMediaSlide[] = (await listMediaResources(id))
    .filter((resource) => resource.mediaType === "image" || resource.mediaType === "video")
    .map((resource) => ({
      id: resource.id,
      title: resource.title,
      subtitle: `${resource.mediaType} - ${resource.originalName}`,
      mediaType: resource.mediaType === "video" ? "video" : "image",
      publicUrl: resource.publicUrl,
      createdAt: resource.createdAt,
    }));

  const advertiserSlides: DeviceMediaSlide[] = (await listInventoryAdvertiserResources(id))
    .filter((resource) => Boolean(resource.publicUrl))
    .map((resource) => ({
      id: resource.id,
      title: resource.campaign,
      subtitle: `Advertiser creative - ${resource.advertiser} - ${resource.originalName ?? "uploaded media"}`,
      mediaType: resource.mimeType?.startsWith("video/") ? "video" : "image",
      publicUrl: resource.publicUrl ?? "",
      createdAt: resource.createdAt,
    }));

  const slides = [...deviceSlides, ...advertiserSlides].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <DeviceScreen
      inventoryName={inventory.name}
      city={city}
      imageInterval={inventory.imageInterval}
      slides={slides}
      template={template}
    />
  );
}
