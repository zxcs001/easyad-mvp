import type { InventoryItem } from "../../app/data";
import { createInventorySpecification, getDb, createInventory, createUser, getInventory, getUserByEmail, getUserById, updateInventoryRecord } from "../../app/lib/db";
import { hashPassword } from "../../app/lib/password";
import { createCampaignPlan } from "../../app/lib/campaigns";

export const pilotPassword = "PilotFixture!2026";
export async function createPlayerFixtures(prefix = "PILOT") {
  // This helper is exclusively for the dedicated local test database.
  const url = new URL(process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "http://invalid");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Player fixtures require a dedicated local *_test database.");
  async function account(suffix: string, role: "institutional" | "admin" | "advertiser" | "operator", institutionId?: string) {
    const email = `${prefix.toLowerCase()}.${suffix}@example.test`;
    const existing = await getUserByEmail(email);
    return existing ? (await getUserById(existing.id))! : await createUser(`${prefix} ${suffix}`, email, hashPassword(pilotPassword), role, { institutionId });
  }
  const institution = await account("owner", "institutional");
  const otherInstitution = await account("other", "institutional");
  const admin = await account("admin", "admin");
  const advertiser = await account("advertiser", "advertiser");
  const operator = await account("operator", "operator", institution.id);
  const base: InventoryItem = {
    advertisingOptIn:true,
    id: `INV-${prefix}-SCREEN`, name: `${prefix} City Hall Screen`, operator: institution.name,
    format: "digital", deliveryMode: "digital", x: 50, y: 50, address: "100 Main Street, Thunder Bay, ON",
    price: 100, impressions: 1000, traffic: 1000, income: 70000, audience: "Residents", competitor: "Low", occupancy: 0,
    imageInterval: 6, maxLoopSeconds: 120, availableFrom: "2026-01-01", availableTo: "2099-12-31",
    approvalStatus: "approved", displayTemplate: "fullscreen", displayLanguage: "en",
  };
  for (const [item, owner] of [
    [base, institution],
    [{ ...base, id: `INV-${prefix}-OTHER`, name: `${prefix} Other Institution Screen` }, otherInstitution],
    [{ ...base, id: `INV-${prefix}-STATIC`, name: `${prefix} Billboard`, format: "static", deliveryMode: "static" }, institution],
  ] as const) {
    if (!await getInventory(item.id)) await createInventory(item, owner.id, owner.id);
    else await updateInventoryRecord(item.id, item);
  }
  const existingSpec=await getDb().query("SELECT id FROM inventory_specifications WHERE inventory_id=$1",[`INV-${prefix}-STATIC`]);
  if(!existingSpec.rows[0])await createInventorySpecification(`INV-${prefix}-STATIC`,{trimWidthMm:100,trimHeightMm:100,visibleWidthMm:90,visibleHeightMm:90,bleedMm:5,safeAreaMm:5,scaleRatio:"1:1",minimumDpi:150,colourSpace:"CMYK",acceptedFileTypes:["png","pdf","jpg"],maximumFileBytes:10000000,substrate:"paper",finishing:"none",templateUrl:"",notes:"Pilot fixture only"},institution.id);
  const today = new Date().toISOString().slice(0, 10);
  const campaignId = await createCampaignPlan(advertiser, { name: `${prefix} mixed campaign`, objective: "Awareness", geography: "Thunder Bay", startDate: today, endDate: today, creativePath: "later", inventoryIds: [base.id, `INV-${prefix}-STATIC`], idempotencyKey: `${prefix}-mixed-${today}` });
  return { institution, otherInstitution, admin, advertiser, operator, screen: base, otherScreenId: `INV-${prefix}-OTHER`, staticId: `INV-${prefix}-STATIC`, campaignId };
}
