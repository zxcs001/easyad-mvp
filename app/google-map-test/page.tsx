import GoogleInventoryMap from "../component/google-inventory-map";
import { listPublishedInventory } from "../lib/db";

export const dynamic = "force-dynamic";

export default async function GoogleMapTestPage() {
  const inventory = await readInventory();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <main className="google-map-page">
      <header className="google-map-header">
        <div>
          <p className="eyebrow">Map test ground</p>
          <h1>Google Maps Inventory Sandbox</h1>
          <p>Use this page to evaluate Google Maps rendering, markers, radius overlays, and satellite mode without changing the current MapLibre discovery map.</p>
        </div>
        <a className="ghost-button" href="/">Back to Portal</a>
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
