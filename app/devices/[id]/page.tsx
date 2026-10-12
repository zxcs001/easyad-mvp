import { getActiveDeviceMedia } from "../../lib/public-device-media";
import { notFound } from "next/navigation";
import { DeviceMediaSlide } from "../../component/device-media-carousel";
import DeviceScreen from "../../component/device-screen";
import { deriveScreenCity, resolveDeviceTemplate } from "../../component/device-templates";
import { getActiveDeviceAlertForDevice, getPublishedInventory, listInventoryAdvertiserResources, listMediaResources } from "../../lib/db";
import { isDigitalInventory } from "../../lib/inventory-delivery";
import { translate } from "../../i18n/messages";
import PublicDeviceRefresh from "../../component/public-device-refresh";

type DevicePublicPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};


export default async function DevicePublicPage({ params, searchParams }: DevicePublicPageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const inventory = await getPublishedInventory(id);
  if (!inventory || !isDigitalInventory(inventory)) notFound();
  const displayLanguage = inventory.displayLanguage ?? "en";
  const t = (message: string) => translate(displayLanguage, message);

  const templateParam = Array.isArray(query.template) ? query.template[0] : query.template;
  const template = resolveDeviceTemplate(templateParam, inventory.displayTemplate);
  const city = deriveScreenCity(inventory.address);
  const activeAlert = await getActiveDeviceAlertForDevice(inventory.id);

  const media=await getActiveDeviceMedia(id);
  // Upcoming institution content is available to the local clock without a reload at each window.
  // The inventory's public visibility was checked above; inactive assets remain gated by /media.
  const resources = await listMediaResources(id);
  const slides:DeviceMediaSlide[]=[...resources.filter(resource=>resource.approvalStatus==="approved"&&(resource.mediaType==="image"||resource.mediaType==="video")).map(resource=>({id:resource.id,title:resource.title,subtitle:"",mediaType:resource.mediaType as "image"|"video",publicUrl:resource.publicUrl,createdAt:resource.createdAt,contentSchedule:resource.contentSchedule,startsAt:resource.startsAt,endsAt:resource.endsAt})),...(media?.items??[]).filter(item=>item.source==="advertiser").map(item=>({id:item.id,title:item.title,subtitle:"",mediaType:item.mediaType,publicUrl:item.publicUrl,createdAt:item.createdAt}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));

  return (
    <><PublicDeviceRefresh /><DeviceScreen
      inventoryName={inventory.name}
      city={city}
      imageInterval={inventory.imageInterval}
      slides={slides}
      template={template}
      displayLanguage={displayLanguage}
      activeAlert={activeAlert}
    /></>
  );
}
