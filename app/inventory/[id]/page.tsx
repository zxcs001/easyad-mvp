import { PublicInventoryProfile } from "../../component/public-inventory-profile";

type InventoryPublicPageProps = {
  params: Promise<{ id: string }>;
};

export default async function InventoryPublicPage({ params }: InventoryPublicPageProps) {
  const { id } = await params;
  return <PublicInventoryProfile inventoryId={id} />;
}
