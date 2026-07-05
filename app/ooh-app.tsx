"use client";

import { useEffect, useMemo, useState } from "react";
import { ApprovalEvent, Booking, Creative, FormatKey, InventoryItem, MediaResource, Role, Transaction, View, locations } from "./data";
import BookingView from "./component/booking-view";
import CampaignSpacesView from "./component/campaign-spaces-view";
import CreativeView from "./component/creative-view";
import { Sidebar, Topbar } from "./component/dashboard-shell";
import DiscoverView from "./component/discover-view";
import { ApprovalsView, CalendarView, InventoryView } from "./component/operator-views";
import AccountManagementView from "./component/account-management-view";
import InstitutionTeamView from "./component/institution-team-view";
import Portal from "./component/portal";
import { BillingView, ReportsView } from "./component/reports-billing-views";
import type { BookingDraft, CreativeDraft, Filters, MapPoint } from "./types";
import { CURRENT_LOCATION_ID, MANUAL_LOCATION_ID, defaultFilters, estimateSpend, exceedsLoopCapacity, geoToMapPoint, isKnownLocationId, mapDistanceKm, overlaps } from "./utils";
import type { DbUser } from "./lib/db";

export default function OohApp({
  currentUser,
  initialInventoryData = [],
  initialBookingsData = [],
  initialMediaResources = [],
  initialTransactions = [],
  initialApprovalHistory = [],
  initialCreatives = [],
  initialManagedUsers = [],
  initialInstitutionOperators = [],
  initialRole = "advertiser",
  initialView = "portal",
  initialFormat,
  initialFilters,
  initialLocationId,
  initialArea,
  initialMapZoom,
  initialInventoryId,
  initialCreative,
  initialBookingId,
  initialCreativeSubmitted = false,
}: {
  currentUser?: DbUser | null;
  initialInventoryData?: InventoryItem[];
  initialBookingsData?: Booking[];
  initialMediaResources?: MediaResource[];
  initialTransactions?: Transaction[];
  initialApprovalHistory?: ApprovalEvent[];
  initialCreatives?: Creative[];
  initialManagedUsers?: DbUser[];
  initialInstitutionOperators?: DbUser[];
  initialRole?: Role;
  initialView?: View;
  initialFormat?: FormatKey;
  initialFilters?: Partial<Filters>;
  initialLocationId?: string;
  initialArea?: { x: number; y: number };
  initialMapZoom?: number;
  initialInventoryId?: string;
  initialCreative?: Partial<CreativeDraft>;
  initialBookingId?: string;
  initialCreativeSubmitted?: boolean;
}) {
  const startingRole = currentUser && currentUser.role !== "admin" ? currentUser.role : initialRole;
  const [role, setRole] = useState<Role>(startingRole);
  const [view, setView] = useState<View>(initialView);
  const [selectedLocationId, setSelectedLocationId] = useState(
    initialLocationId && isKnownLocationId(initialLocationId) ? initialLocationId : "thunder-bay",
  );
  const [currentLocation, setCurrentLocation] = useState<MapPoint | null>(
    initialArea && initialLocationId && [CURRENT_LOCATION_ID, MANUAL_LOCATION_ID].includes(initialLocationId)
      ? { id: initialLocationId, label: initialLocationId === MANUAL_LOCATION_ID ? "Selected map area" : "Current location", ...initialArea }
      : null,
  );
  const [selectedInventoryId, setSelectedInventoryId] = useState(initialInventoryId && initialInventoryData.some((item) => item.id === initialInventoryId) ? initialInventoryId : initialInventoryData[0]?.id ?? "");
  const [selectedBookingId, setSelectedBookingId] = useState(initialBookingId && initialBookingsData.some((booking) => booking.id === initialBookingId) ? initialBookingId : initialBookingsData.find((booking) => booking.creativeStatus !== "approved")?.id ?? initialBookingsData[0]?.id ?? "");
  const [filters, setFilters] = useState<Filters>(() => {
    const loadedFilters = compactFilters(initialFilters);
    return {
      ...defaultFilters,
      ...loadedFilters,
      format: initialFormat ?? loadedFilters.format ?? "all",
      selectedTags: loadedFilters.selectedTags ?? [],
    };
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventoryData);
  const [mediaResources, setMediaResources] = useState<MediaResource[]>(initialMediaResources);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [approvalHistory, setApprovalHistory] = useState<ApprovalEvent[]>(initialApprovalHistory);
  const [creatives, setCreatives] = useState<Creative[]>(initialCreatives);
  const [managedUsers, setManagedUsers] = useState<DbUser[]>(initialManagedUsers);
  const [institutionOperators, setInstitutionOperators] = useState<DbUser[]>(initialInstitutionOperators);
  const [bookings, setBookings] = useState<Booking[]>(() => {
    let loadedBookings = initialBookingsData;
    if (initialCreativeSubmitted && initialBookingId) {
      loadedBookings = loadedBookings.map((booking) => (booking.id === initialBookingId ? { ...booking, creativeStatus: "pending review", status: "creative review" } : booking));
    }
    return loadedBookings;
  });
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>({
    campaign: "Launch Campaign",
    start: "2026-07-15",
    end: "2026-07-28",
    advertiser: currentUser?.name ?? "New Advertiser",
    adSlots: 1,
  });
  const [creativeDraft, setCreativeDraft] = useState<CreativeDraft>({
    template: "retail",
    format: "digital",
    width: 1920,
    height: 1080,
    fileType: "png",
    fileSize: 84,
    safeZone: 10,
    distortion: 1,
    ...initialCreative,
  });

  useEffect(() => {
    if (initialArea || initialLocationId !== CURRENT_LOCATION_ID) return;
    if (!("geolocation" in navigator)) {
      setSelectedLocationId("thunder-bay");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          id: CURRENT_LOCATION_ID,
          label: "Current location",
          ...geoToMapPoint(position.coords.latitude, position.coords.longitude),
        });
        setSelectedLocationId(CURRENT_LOCATION_ID);
      },
      () => {
        setSelectedLocationId("thunder-bay");
      },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 8000 },
    );
  }, [initialLocationId]);

  const locationOptions = useMemo(() => currentLocation ? [currentLocation, ...locations] : locations, [currentLocation]);
  const selectedLocation =
    [CURRENT_LOCATION_ID, MANUAL_LOCATION_ID].includes(selectedLocationId) && currentLocation
      ? currentLocation
      : locations.find((location) => location.id === selectedLocationId) ?? locations[0];
  const visibleInventory = useMemo(
    () =>
      inventory
        .map((item) => ({ ...item, distance: mapDistanceKm(selectedLocation, item) }))
        .filter((item) => item.distance <= filters.radius)
        .filter((item) => filters.format === "all" || item.format === filters.format)
        .filter((item) => item.impressions >= filters.minImpressions)
        .filter((item) => item.traffic >= filters.minTraffic)
        .filter((item) => item.income >= filters.minIncome)
        .filter((item) => filters.audience === "all" || item.audience === filters.audience)
        .filter((item) => filters.competitor === "all" || item.competitor === filters.competitor)
        .filter((item) => !filters.selectedTags.length || filters.selectedTags.every((tag) => item.tags?.includes(tag)))
        .filter((item) => item.price <= filters.priceMax)
        .sort((a, b) => a.distance - b.distance),
    [filters, inventory, selectedLocation],
  );
  const selectedInventory = visibleInventory.find((item) => item.id === selectedInventoryId) ?? visibleInventory[0] ?? inventory.find((item) => item.id === selectedInventoryId) ?? inventory[0];
  const canManageInventory = currentUser?.role === "operator" || currentUser?.role === "institutional" || currentUser?.role === "admin";
  const canDeleteInventory = currentUser?.role === "admin";
  const canBuyAds = currentUser?.role === "advertiser" || currentUser?.role === "admin";

  function launchPortal(nextRole: Role, nextView: View) {
    if (!currentUser) return;
    if (currentUser.role !== "admin" && nextRole !== currentUser.role) return;
    setRole(currentUser && currentUser.role !== "admin" ? currentUser.role : nextRole);
    setView(nextView);
  }

  function selectFormat(format: FormatKey) {
    if (!currentUser || (currentUser.role !== "advertiser" && currentUser.role !== "admin")) return;
    setRole("advertiser");
    setView("discover");
    setFilters((current) => ({ ...current, format }));
  }

  function hasCapacityConflict(inventoryId: string, start: string, end: string, adSlots = 1, excludeId = "") {
    const item = inventory.find((unit) => unit.id === inventoryId);
    if (!item) return true;
    return exceedsLoopCapacity(item, bookings, start, end, adSlots, excludeId);
  }

  async function submitBooking() {
    if (!canBuyAds || !selectedInventory) return false;
    if (hasCapacityConflict(selectedInventory.id, bookingDraft.start, bookingDraft.end, bookingDraft.adSlots)) return false;
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventoryId: selectedInventory.id,
        advertiser: bookingDraft.advertiser,
        campaign: bookingDraft.campaign,
        start: bookingDraft.start,
        end: bookingDraft.end,
        adSlots: bookingDraft.adSlots,
      }),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { booking: Booking };
    setBookings((current) => [payload.booking, ...current]);
    setSelectedBookingId(payload.booking.id);
    setView("campaigns");
    return true;
  }

  async function addInventory(draft: InventoryItem) {
    if (!canManageInventory) return false;
    const item: InventoryItem = {
      ...draft,
      id: `INV-${Math.floor(600 + Math.random() * 3000)}`,
    };
    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { item: InventoryItem };
    setInventory((current) => [...current, payload.item]);
    setSelectedInventoryId(payload.item.id);
    return true;
  }

  async function saveInventory(item: InventoryItem) {
    if (!canManageInventory || !selectedInventory || item.id !== selectedInventory.id) return false;
    const { approvalStatus: _approvalStatus, ...operatorEditableFields } = item;
    const requestBody = currentUser?.role === "admin" ? item : operatorEditableFields;
    const response = await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { item: InventoryItem };
    setInventory((current) => current.map((existing) => existing.id === item.id ? payload.item : existing));
    return true;
  }

  async function updateInventoryApproval(id: string, approvalStatus: NonNullable<InventoryItem["approvalStatus"]>) {
    if (currentUser?.role !== "admin") return false;
    const response = await fetch(`/api/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus }),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { item: InventoryItem };
    setInventory((current) => current.map((item) => (item.id === id ? payload.item : item)));
    return true;
  }

  async function deleteInventory() {
    if (!canDeleteInventory || !selectedInventory) return;
    const response = await fetch(`/api/inventory/${selectedInventory.id}`, { method: "DELETE" });
    if (!response.ok) return;
    setInventory((current) => {
      const next = current.filter((item) => item.id !== selectedInventory.id);
      setSelectedInventoryId(next[0]?.id ?? "");
      return next;
    });
    setMediaResources((current) => current.filter((resource) => resource.inventoryId !== selectedInventory.id));
  }

  async function updateBooking(id: string, updates: Partial<Booking>) {
    const response = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { booking: Booking; approval: ApprovalEvent | null };
    setBookings((current) => current.map((booking) => (booking.id === id ? payload.booking : booking)));
    const approval = payload.approval;
    if (approval) setApprovalHistory((current) => [approval, ...current]);
    return true;
  }

  async function submitCreative(bookingId: string, source: Creative["source"], file?: File | null) {
    if (!canBuyAds) return false;
    const body = source === "upload" && file ? creativeUploadForm(creativeDraft, file) : JSON.stringify(creativeDraft);
    const response = await fetch(`/api/bookings/${bookingId}/creative`, {
      method: "POST",
      headers: source === "upload" && file ? undefined : { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) return false;
    const payload = await response.json() as { booking: Booking; creative: Creative };
    setBookings((current) => current.map((booking) => (booking.id === bookingId ? payload.booking : booking)));
    setCreatives((current) => [payload.creative, ...current]);
    return true;
  }

  async function settleInvoice(bookingId: string, action: "pay" | "refund") {
    const response = await fetch(`/api/bookings/${bookingId}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { booking: Booking; transaction: Transaction };
    setBookings((current) => current.map((booking) => (booking.id === bookingId ? payload.booking : booking)));
    setTransactions((current) => {
      const others = current.filter((transaction) => transaction.bookingId !== bookingId);
      return payload.transaction ? [payload.transaction, ...others] : others;
    });
    return true;
  }

  async function runDeliveryTick() {
    const response = await fetch("/api/pop/run", { method: "POST" });
    if (!response.ok) return false;
    const payload = await response.json() as { bookings: Booking[] };
    setBookings(payload.bookings);
    return true;
  }

  async function uploadInventoryMedia(file: File, title: string) {
    if (!canManageInventory || !selectedInventory) return false;
    const form = new FormData();
    form.set("file", file);
    form.set("title", title);
    const response = await fetch(`/api/inventory/${selectedInventory.id}/media`, { method: "POST", body: form });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? "Upload failed. Please try again.");
    }
    const payload = await response.json() as { resource: MediaResource };
    setMediaResources((current) => [payload.resource, ...current]);
    return true;
  }

  async function deleteMediaResource(id: string) {
    if (currentUser?.role !== "admin") return;
    const response = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setMediaResources((current) => current.filter((resource) => resource.id !== id));
  }

  async function createManagedUser(account: { name: string; email: string; password: string; role: Exclude<Role, "admin">; institutionId: string | null; operatorLimit: number }) {
    if (currentUser?.role !== "admin") return { error: "Only super admins can create accounts" };
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    });
    const payload = await response.json().catch(() => ({})) as { user?: DbUser; error?: string };
    if (!response.ok || !payload.user) return { error: payload.error ?? "Unable to create account" };
    setManagedUsers((current) => [payload.user!, ...current]);
    return { user: payload.user };
  }

  async function updateManagedUser(id: string, updates: { role: Exclude<Role, "admin">; status: DbUser["status"]; institutionId: string | null; operatorLimit: number }) {
    if (currentUser?.role !== "admin") return false;
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { user: DbUser };
    setManagedUsers((current) => current.map((user) => user.id === id ? payload.user : user));
    return true;
  }

  async function deleteManagedUser(id: string) {
    if (currentUser?.role !== "admin") return false;
    const response = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!response.ok) return false;
    setManagedUsers((current) => current.filter((user) => user.id !== id && user.institutionId !== id));
    return true;
  }

  async function createInstitutionOperator(operator: { name: string; email: string; password: string }) {
    if (currentUser?.role !== "institutional") return { error: "Only institutional accounts can create operators" };
    const response = await fetch("/api/institution/operators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operator),
    });
    const payload = await response.json().catch(() => ({})) as { user?: DbUser; error?: string };
    if (!response.ok || !payload.user) return { error: payload.error ?? "Unable to create operator" };
    setInstitutionOperators((current) => [payload.user!, ...current]);
    return { user: payload.user };
  }

  async function deleteInstitutionOperator(id: string) {
    if (currentUser?.role !== "institutional") return false;
    const response = await fetch(`/api/institution/operators/${id}`, { method: "DELETE" });
    if (!response.ok) return false;
    setInstitutionOperators((current) => current.filter((operator) => operator.id !== id));
    return true;
  }

  function selectMapArea(point: { x: number; y: number }) {
    setCurrentLocation({ id: MANUAL_LOCATION_ID, label: "Selected map area", x: point.x, y: point.y });
    setSelectedLocationId(MANUAL_LOCATION_ID);
  }

  function renderDashboardView() {
    switch (view) {
      case "discover":
        if (!selectedInventory) return <EmptyInventoryPanel canManage={canManageInventory} />;
        return (
          <DiscoverView
            filters={filters}
            setFilters={setFilters}
            selectedLocationId={selectedLocationId}
            setSelectedLocationId={setSelectedLocationId}
            selectedLocation={selectedLocation}
            onAreaChange={selectMapArea}
            mapZoom={initialMapZoom}
            locationOptions={locationOptions}
            selectedInventory={selectedInventory}
            selectedInventoryId={selectedInventory.id}
            setSelectedInventoryId={setSelectedInventoryId}
            visibleInventory={visibleInventory}
            inventory={inventory}
            bookings={bookings}
            onBook={() => {
              setRole("advertiser");
              setView("booking");
            }}
            canComment={Boolean(currentUser)}
          />
        );
      case "booking":
        if (!selectedInventory) return <EmptyInventoryPanel canManage={canManageInventory} />;
        return (
          <BookingView
            item={selectedInventory}
            inventory={inventory}
            draft={bookingDraft}
            bookings={bookings}
            setDraft={setBookingDraft}
            hasCapacityConflict={hasCapacityConflict}
            onSubmit={submitBooking}
            canBuy={canBuyAds}
          />
        );
      case "campaigns":
        return (
          <CampaignSpacesView
            bookings={bookings}
            inventory={inventory}
            currentUser={currentUser}
            onOpenCreative={(booking) => {
              setSelectedBookingId(booking.id);
              setSelectedInventoryId(booking.inventoryId);
              setRole("advertiser");
              setView("creative");
            }}
          />
        );
      case "creative":
        return <CreativeView draft={creativeDraft} setDraft={setCreativeDraft} bookings={bookings} inventory={inventory} creatives={creatives} onSubmit={submitCreative} canSubmit={canBuyAds} selectedBookingId={selectedBookingId} setSelectedBookingId={setSelectedBookingId} />;
      case "inventory":
        if (!selectedInventory) return <InventoryView inventory={inventory} selectedId={selectedInventoryId} select={setSelectedInventoryId} item={newInventoryTemplate()} newItem={newInventoryTemplate()} mediaResources={[]} addInventory={addInventory} deleteInventory={deleteInventory} saveInventory={saveInventory} updateInventoryApproval={updateInventoryApproval} uploadMedia={uploadInventoryMedia} deleteMediaResource={deleteMediaResource} canManage={canManageInventory} canDelete={canDeleteInventory} />;
        return (
          <InventoryView
            inventory={inventory}
            selectedId={selectedInventoryId}
            select={setSelectedInventoryId}
            item={selectedInventory}
            newItem={newInventoryTemplate()}
            mediaResources={mediaResources.filter((resource) => resource.inventoryId === selectedInventory?.id)}
            addInventory={addInventory}
            deleteInventory={deleteInventory}
            saveInventory={saveInventory}
            updateInventoryApproval={updateInventoryApproval}
            uploadMedia={uploadInventoryMedia}
            deleteMediaResource={deleteMediaResource}
            canManage={canManageInventory}
            canDelete={canDeleteInventory}
          />
        );
      case "calendar":
        return <CalendarView inventory={inventory} bookings={bookings} />;
      case "approvals":
        return <ApprovalsView bookings={bookings} inventory={inventory} creatives={creatives} approvalHistory={approvalHistory} hasConflict={(inventoryId, start, end, excludeId) => hasCapacityConflict(inventoryId, start, end, bookings.find((booking) => booking.id === excludeId)?.adSlots ?? 1, excludeId)} updateBooking={updateBooking} />;
      case "accounts":
        if (currentUser?.role === "institutional") return <InstitutionTeamView institution={currentUser} operators={institutionOperators} onCreateOperator={createInstitutionOperator} onDeleteOperator={deleteInstitutionOperator} />;
        if (currentUser?.role === "admin") return <AccountManagementView users={managedUsers} bookings={bookings} inventory={inventory} creatives={creatives} mediaResources={mediaResources} onCreateAccount={createManagedUser} onUpdateAccount={updateManagedUser} onDeleteAccount={deleteManagedUser} />;
        return null;
      case "reports":
        return <ReportsView bookings={bookings} inventory={inventory} transactions={transactions} onRunDelivery={runDeliveryTick} canRunDelivery={canManageInventory} />;
      case "billing":
        return <BillingView bookings={bookings} transactions={transactions} onSettle={settleInvoice} canManage={canManageInventory} />;
      default:
        return null;
    }
  }

  if (view === "portal") {
    return (
      <Portal
        inventory={inventory}
        bookings={bookings}
        visibleInventory={visibleInventory}
        selectedInventoryId={selectedInventoryId}
        selectedLocation={selectedLocation}
        filters={filters}
        launch={launchPortal}
        selectFormat={selectFormat}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className="shell">
      <Sidebar role={role} view={view} setRole={setRole} setView={setView} currentUser={currentUser} />
      <main className="workspace">
        <Topbar view={view} visibleCount={visibleInventory.length} inventory={inventory} bookings={bookings} />
        {renderDashboardView()}
      </main>
    </div>
  );
}

function newInventoryTemplate(): InventoryItem {
  return {
    id: "",
    name: "New Inventory Unit",
    operator: "New Operator",
    format: "digital",
    x: 50,
    y: 50,
    address: "New market location",
    price: 500,
    impressions: 80000,
    traffic: 50000,
    income: 90000,
    audience: "Commuters",
    competitor: "Medium",
    occupancy: 0,
    imageInterval: 6,
    maxLoopSeconds: 120,
    availableFrom: "2026-07-01",
    availableTo: "2026-09-01",
    approvalStatus: "pending approval",
    tags: ["large", "digital", "private", "urban", "commercial", "medium-income", "25-34", "near-major-highway"],
    displayTemplate: "fullscreen",
  };
}

function creativeUploadForm(draft: CreativeDraft, file: File) {
  const form = new FormData();
  form.set("file", file);
  form.set("template", draft.template);
  form.set("format", draft.format);
  form.set("width", String(draft.width));
  form.set("height", String(draft.height));
  form.set("safeZone", String(draft.safeZone));
  form.set("distortion", String(draft.distortion));
  return form;
}

function compactFilters(filters: Partial<Filters> | undefined) {
  if (!filters) return {};
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)) as Partial<Filters>;
}

function EmptyInventoryPanel({ canManage }: { canManage: boolean }) {
  return (
    <section className="panel">
      <div className="empty-state">
        <strong>No inventory records found</strong>
        <span>{canManage ? "Add a device in Inventory to start selling media." : "An operator or super admin needs to add inventory before campaigns can be launched."}</span>
      </div>
    </section>
  );
}
