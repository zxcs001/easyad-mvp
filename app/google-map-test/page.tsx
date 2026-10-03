import GoogleInventoryMap from "../component/google-inventory-map";
import { listPublishedInventory } from "../lib/db";
import { getServerI18n } from "../i18n/server";

export const dynamic = "force-dynamic";

export default async function GoogleMapTestPage() {
  const { t } = await getServerI18n();
  const inventory = await readInventory();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <main className="google-map-page">
      <header className="google-map-header">
        <div>
          <p className="eyebrow">{t("Map test ground")}</p>
          <h1>{t("Google Maps Inventory Sandbox")}</h1>
          <p>{t("Use this page to evaluate Google Maps rendering, markers, radius overlays, and satellite mode without changing the current MapLibre discovery map.")}</p>
        </div>
        <a className="ghost-button" href="/">{t("Back to Portal")}</a>
      </header>
      <GoogleInventoryMap apiKey={apiKey} inventory={inventory} />
    </main>
  );
}

async function readInventory() {
  try {
    return await listPublishedInventory();
  } catch {
    return [];
  }
}
