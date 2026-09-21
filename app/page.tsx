import OohApp from "./ooh-app";
import { FormatKey, Role, View, formats, locations } from "./data";
import { getCurrentUser, getInstitutionScope } from "./lib/auth";
import { ensureBookingTransactions, listApprovalEvents, listApprovalEventsForInstitution, listBookings, listBookingsCreatedBy, listBookingsForInstitution, listCreatives, listDeviceAlerts, listInventory, listInventoryByInstitution, listInstitutionOperators, listMediaResources, listMediaResourcesForInstitution, listNonAdminUsers, listPublishedInventory, listTransactions, listTransactionsCreatedBy, listTransactionsForInstitution } from "./lib/db";
import type { CreativeDraft, Filters } from "./types";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import TorontoStarter from "./component/toronto-starter";

import { INTRO_COOKIE_NAME, SIDEBAR_COOKIE_NAME, shouldShowStarter } from "./lib/preferences";
import { CONSENT_COOKIE_NAME } from "./lib/cookie-consent";

import { canAccessInstitutionWorkspace, roleValues, roleWorkspaceView } from "./roles";
import GovernmentAccessDenied from "./component/government-access-denied";
import { getFeatureFlags } from "./lib/feature-flags";
import { resolveCampaignView } from "./lib/campaign-creation-flow";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const views: View[] = ["portal", "network", "discover", "booking", "campaigns", "creative", "resources", "inventory", "calendar", "approvals", "accounts", "reports", "billing"];
const templates: CreativeDraft["template"][] = ["retail", "finance", "event"];
const fileTypes: CreativeDraft["fileType"][] = ["png", "jpg", "gif", "pdf", "mp4"];
const filterFormats: Filters["format"][] = ["all", "digital", "static", "transit"];
const competitors: Filters["competitor"][] = ["all", "Low", "Medium", "High"];
const roleAllowedViews: Record<Role, View[]> = {
  advertiser: ["portal", "discover", "booking", "campaigns", "creative", "resources", "reports", "billing"],
  operator: ["portal", "resources", "inventory", "calendar", "approvals", "reports", "billing"],
  institutional: ["portal", "network", "resources", "inventory", "calendar", "approvals", "accounts", "reports", "billing"],
  admin: views,
};
const governmentViews: View[] = ["network", "resources", "inventory", "calendar", "approvals", "accounts", "reports", "billing"];

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const surface = readOne(params.__surface) === "government" ? "government" : "marketplace";
  const isGovernmentSurface = surface === "government";
  const user = await getCurrentUser();
  const role = readOne(params.role);
  const view = readOne(params.view);
  const bookingId = readOne(params.bookingId);
  const requestedRole = isGovernmentSurface ? user?.role : isRole(role) ? role : user?.role;
  const requestedView = isView(view) ? view : isGovernmentSurface ? "network" : "portal";
  const cookieStore = await cookies();

  // The starter is the ad buyer's "Start my campaign" screen. Operators and
  // institution owners reach the portal too (the sidebar's "Open EasyAD
  // Platform"), and were shown advertiser marketing before their own portal.
  const starterAudience = !user || user.role === "advertiser";
  const showStarter = !isGovernmentSurface && starterAudience && shouldShowStarter(requestedView, cookieStore.get(INTRO_COOKIE_NAME)?.value);


  if (!user && (isGovernmentSurface || requestedView !== "portal")) {
    const destination = isGovernmentSurface ? governmentPathFromParams(params) : queryFromParams(params);
    redirect(`${isGovernmentSurface ? "/government/login" : "/login"}?returnTo=${encodeURIComponent(destination)}`);
  }

  if (isGovernmentSurface && user && !canAccessInstitutionWorkspace(user.role)) {
    return <GovernmentAccessDenied currentRole={user.role} />;
  }

  if (!isGovernmentSurface && user?.role === "institutional" && requestedView !== "portal") {
    redirect(`/government?view=${governmentViews.includes(requestedView) ? requestedView : "network"}`);
  }

  const effectiveRole = !user ? "advertiser" : user.role === "admin" ? requestedRole ?? "admin" : user.role;
  const allowedViews = isGovernmentSurface ? governmentViews : roleAllowedViews[effectiveRole];
  const effectiveView = allowedViews.includes(requestedView) ? requestedView : isGovernmentSurface ? "network" : roleWorkspaceView[effectiveRole];

  if (user && (requestedRole !== effectiveRole || requestedView !== effectiveView)) {
    redirect(isGovernmentSurface ? `/government?view=${effectiveView}` : `/?role=${effectiveRole}&view=${effectiveView}`);
  }

  const institutionId = getInstitutionScope(user);
  const isUnassignedOperator = user?.role === "operator" && !institutionId;
  const inventory = (user?.role === "admin" ? await listInventory() : institutionId ? await listInventoryByInstitution(institutionId) : await listPublishedInventory()).filter(item=>user?.role!=="operator"||!Array.isArray(user.screenScope)||user.screenScope.includes(item.id));
  const bookings = (!user || isUnassignedOperator ? [] : user.role === "advertiser" ? await listBookingsCreatedBy(user.id) : institutionId ? await listBookingsForInstitution(institutionId) : await listBookings()).filter(b=>user?.role!=="operator"||!Array.isArray(user.screenScope)||user.screenScope.includes(b.inventoryId));
  const guardedView = effectiveRole === "advertiser"
    ? resolveCampaignView({ requestedView: effectiveView, activeStep: null, bookingId, accessibleBookingIds: new Set(bookings.map((booking) => booking.id)) })
    : effectiveView;
  if (guardedView !== effectiveView) redirect(`/?role=${effectiveRole}&view=${guardedView}`);
  const mediaResources = (user?.role === "admin" ? await listMediaResources() : institutionId ? await listMediaResourcesForInstitution(institutionId) : []).filter(r=>inventory.some(i=>i.id===r.inventoryId));
  const deviceAlerts = user?.role === "admin" ? await listDeviceAlerts() : user?.role === "institutional" ? await listDeviceAlerts(user.id) : [];
  if (user?.role === "admin" || institutionId) await ensureBookingTransactions();
  const transactions = (!user || isUnassignedOperator ? [] : user.role === "advertiser" ? await listTransactionsCreatedBy(user.id) : institutionId ? await listTransactionsForInstitution(institutionId) : await listTransactions()).filter(t=>user?.role!=="operator"||!Array.isArray(user.screenScope)||bookings.some(b=>b.id===t.bookingId));
  const approvalHistory = (user?.role === "admin" ? await listApprovalEvents() : institutionId ? await listApprovalEventsForInstitution(institutionId) : []).filter(e=>user?.role!=="operator"||!Array.isArray(user.screenScope)||user.screenScope.includes(e.inventoryId));
  const bookingIds = new Set(bookings.map((booking) => booking.id));
  const allCreatives = user ? await listCreatives() : [];
  const creatives = user?.role === "admin" ? allCreatives : user ? allCreatives.filter((creative) => bookingIds.has(creative.bookingId)) : [];
  const managedUsers = user?.role === "admin" ? await listNonAdminUsers() : [];
  const institutionOperators = user?.role === "institutional" ? await listInstitutionOperators(user.id) : [];
  const format = readOne(params.format);
  const creativeFormat = readOne(params.creativeFormat);
  const template = readOne(params.template);
  const fileType = readOne(params.fileType);
  const locationId = readOne(params.location);
  const itemId = readOne(params.itemId);
  const filterFormat = readOne(params.format);
  const competitor = readOne(params.competitor);
  const audience = readOne(params.audience);
  const areaX = readNumber(params.areaX, 0, 100);
  const areaY = readNumber(params.areaY, 0, 100);
  const mapZoom = readNumber(params.mapZoom, 2, 15);
  const selectedTags = readTags(params.tags, inventory);

  return (
    <TorontoStarter show={showStarter}>
      <OohApp
        currentUser={user}
        initialInventoryData={inventory}
        initialBookingsData={bookings}
        initialMediaResources={mediaResources}
        initialDeviceAlerts={deviceAlerts}
        initialTransactions={transactions}
        initialApprovalHistory={approvalHistory}
        initialCreatives={creatives}
        initialManagedUsers={managedUsers}
        initialInstitutionOperators={institutionOperators}
        initialRole={effectiveRole}
        initialView={guardedView}
        initialNavCollapsed={cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === "1"}
        initialFormat={isFormat(format) ? format : undefined}
        initialLocationId={isLocation(locationId) ? locationId : undefined}
        initialArea={areaX !== undefined && areaY !== undefined ? { x: areaX, y: areaY } : undefined}
        initialMapZoom={mapZoom}
        initialInventoryId={isInventoryItem(itemId, inventory) ? itemId : undefined}
        initialFilters={{
          radius: readNumber(params.radius, 8, 30),
          format: isFilterFormat(filterFormat) ? filterFormat : undefined,
          minImpressions: readNumber(params.minImpressions, 0, 180000),
          minTraffic: readNumber(params.minTraffic, 0, 130000),
          minIncome: readNumber(params.minIncome, 0, 140000),
          audience: audience && audience !== "all" ? audience : undefined,
          competitor: isCompetitor(competitor) ? competitor : undefined,
          priceMax: readNumber(params.priceMax, 300, 1000),
          showCompetitors: readBoolean(params.showCompetitors),
          selectedTags: selectedTags.length ? selectedTags : undefined,
        }}
        initialBookingId={bookingId}
        initialCreativeSubmitted={readOne(params.submitted) === "creative"}
        featureFlags={getFeatureFlags()}
        surface={surface}
        initialCreative={{
          template: isTemplate(template) ? template : undefined,
          format: isFormat(creativeFormat) ? creativeFormat : undefined,
          width: readNumber(params.width, 320, 10000),
          height: readNumber(params.height, 180, 5000),
          fileType: isFileType(fileType) ? fileType : undefined,
          fileSize: readNumber(params.fileSize, 1, 600),
          safeZone: readNumber(params.safeZone, 0, 18),
          distortion: readNumber(params.distortion, 0, 12),
        }}
      />
    </TorontoStarter>
  );
}

function readOne(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryFromParams(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("__")) continue;
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, entry);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `/?${query}` : "/";
}

function governmentPathFromParams(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "role" || key.startsWith("__")) continue;
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, entry);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `/government?${query}` : "/government";
}

function isRole(value: string | undefined): value is Role {
  return Boolean(value && roleValues.includes(value as Role));
}

function isView(value: string | undefined): value is View {
  return Boolean(value && views.includes(value as View));
}

function isFormat(value: string | undefined): value is FormatKey {
  return Boolean(value && Object.keys(formats).includes(value));
}

function isFilterFormat(value: string | undefined): value is Filters["format"] {
  return Boolean(value && filterFormats.includes(value as Filters["format"]));
}

function isCompetitor(value: string | undefined): value is Filters["competitor"] {
  return Boolean(value && competitors.includes(value as Filters["competitor"]));
}

function isLocation(value: string | undefined) {
  return Boolean(value === "current" || value === "manual" || (value && locations.some((location) => location.id === value)));
}

function isInventoryItem(value: string | undefined, inventory: { id: string }[]) {
  return Boolean(value && inventory.some((item) => item.id === value));
}

function isTemplate(value: string | undefined): value is CreativeDraft["template"] {
  return Boolean(value && templates.includes(value as CreativeDraft["template"]));
}

function isFileType(value: string | undefined): value is CreativeDraft["fileType"] {
  return Boolean(value && fileTypes.includes(value as CreativeDraft["fileType"]));
}

function readNumber(value: string | string[] | undefined, min: number, max: number) {
  const parsed = Number(readOne(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined;
}

function readBoolean(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.includes("true");
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function readTags(value: string | string[] | undefined, inventory: { tags?: string[] }[]) {
  const knownTags = new Set(inventory.flatMap((item) => item.tags ?? []));
  const rawTags = Array.isArray(value) ? value : readOne(value)?.split(",");
  return Array.from(new Set((rawTags ?? []).map((tag) => tag.trim()).filter((tag) => knownTags.has(tag))));
}
