"use client";

import { useEffect, useMemo, useState } from "react";
import { Booking, Creative, InventoryItem, MediaResource, Role } from "../data";
import type { DbUser } from "../lib/db";
import { money } from "../utils";
import { PanelHeading } from "./shared-ui";

type ManagedRole = Exclude<Role, "admin">;

type CreateAccount = {
  name: string;
  email: string;
  password: string;
  role: ManagedRole;
  institutionId: string | null;
  operatorLimit: number;
};

export default function AccountManagementView({
  users,
  bookings,
  inventory,
  creatives,
  mediaResources,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
}: {
  users: DbUser[];
  bookings: Booking[];
  inventory: InventoryItem[];
  creatives: Creative[];
  mediaResources: MediaResource[];
  onCreateAccount: (account: CreateAccount) => Promise<{ user?: DbUser; error?: string }>;
  onUpdateAccount: (id: string, updates: { role: ManagedRole; status: DbUser["status"]; institutionId: string | null; operatorLimit: number }) => Promise<boolean>;
  onDeleteAccount: (id: string) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const [role, setRole] = useState<ManagedRole>("advertiser");
  const [status, setStatus] = useState<DbUser["status"]>("active");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [operatorLimit, setOperatorLimit] = useState(5);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<ManagedRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DbUser["status"] | "all">("all");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newAccount, setNewAccount] = useState<CreateAccount>({ name: "", email: "", password: "", role: "advertiser", institutionId: null, operatorLimit: 5 });

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !query || [user.name, user.email, user.id].some((value) => value.toLowerCase().includes(query));
      return matchesQuery && (roleFilter === "all" || user.role === roleFilter) && (statusFilter === "all" || user.status === statusFilter);
    });
  }, [roleFilter, searchQuery, statusFilter, users]);
  const selectedUser = filteredUsers.find((user) => user.id === selectedId) ?? filteredUsers[0] ?? null;
  const institutions = users.filter((user) => user.role === "institutional");
  const campaigns = useMemo(() => selectedUser ? bookings.filter((booking) => booking.createdBy === selectedUser.id || (!booking.createdBy && booking.advertiser === selectedUser.name)) : [], [bookings, selectedUser]);
  const campaignIds = useMemo(() => new Set(campaigns.map((campaign) => campaign.id)), [campaigns]);
  const deviceUploads = selectedUser ? mediaResources.filter((resource) => resource.ownerId === selectedUser.id) : [];
  const creativeUploads = creatives.filter((creative) => campaignIds.has(creative.bookingId) && creative.publicUrl);

  useEffect(() => {
    if (selectedUser) {
      setRole(selectedUser.role as ManagedRole);
      setStatus(selectedUser.status);
      setInstitutionId(selectedUser.institutionId);
      setOperatorLimit(selectedUser.operatorLimit || 5);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (selectedUser && selectedId !== selectedUser.id) setSelectedId(selectedUser.id);
  }, [selectedId, selectedUser]);

  async function saveAccount() {
    if (!selectedUser) return;
    setSaving(true);
    setMessage("");
    const saved = await onUpdateAccount(selectedUser.id, { role, status, institutionId, operatorLimit });
    setSaving(false);
    setMessage(saved ? "Account saved." : "Unable to save this account.");
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const result = await onCreateAccount(newAccount);
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    if (result.user) {
      setNewAccount({ name: "", email: "", password: "", role: "advertiser", institutionId: null, operatorLimit: 5 });
      setSelectedId(result.user.id);
      setMessage("Account created.");
    }
  }

  async function deleteAccount() {
    if (!selectedUser) return;
    setSaving(true);
    const deleted = await onDeleteAccount(selectedUser.id);
    setSaving(false);
    setMessage(deleted ? "Account deleted." : "Unable to delete this account.");
    if (deleted) setSelectedId("");
  }

  return (
    <section className="grid account-management-grid">
      <div className="panel account-list-panel">
        <PanelHeading eyebrow="Super admin controls" title="Accounts" />
        <div className="account-filters">
          <label>Search accounts<input aria-label="Search accounts" value={searchQuery} placeholder="Name, email, or account ID" onChange={(event) => setSearchQuery(event.target.value)} /></label>
          <label>Role<select className="select" aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as ManagedRole | "all")}><option value="all">All roles</option><option value="advertiser">Advertiser</option><option value="institutional">Institutional</option><option value="operator">Operator</option></select></label>
          <label>Access<select className="select" aria-label="Filter by access status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DbUser["status"] | "all")}><option value="all">All access</option><option value="active">Active</option><option value="banned">Banned</option></select></label>
          <small>{filteredUsers.length} of {users.length} accounts</small>
        </div>
        <div className="account-list" role="list">
          {filteredUsers.length ? filteredUsers.map((user) => (
            <button className={`account-list-item ${user.id === selectedUser?.id ? "selected" : ""}`} type="button" key={user.id} onClick={() => { setSelectedId(user.id); setMessage(""); }}>
              <span><strong>{user.name}</strong><small>{user.email}</small></span>
              <span className={`status ${user.status === "banned" ? "bad" : "good"}`}>{user.status}</span>
              <small>{user.role === "operator" && user.institutionId ? "operator - institution" : user.role}</small>
            </button>
          )) : <div className="empty-state"><strong>No matching accounts</strong><span>Adjust the account filters or create a new non-admin account.</span></div>}
        </div>
        <form className="account-create-form" onSubmit={createAccount}>
          <span className="eyebrow">Create account</span>
          <label>Name<input required value={newAccount.name} onChange={(event) => setNewAccount((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Email<input required type="email" value={newAccount.email} onChange={(event) => setNewAccount((current) => ({ ...current, email: event.target.value }))} /></label>
          <label>Temporary password<input required minLength={10} type="password" value={newAccount.password} onChange={(event) => setNewAccount((current) => ({ ...current, password: event.target.value }))} /></label>
          <label>Role<select className="select" value={newAccount.role} onChange={(event) => setNewAccount((current) => ({ ...current, role: event.target.value as ManagedRole }))}><option value="advertiser">Advertiser</option><option value="institutional">Institutional user</option><option value="operator">Operator</option></select></label>
          {newAccount.role === "institutional" ? <label>Operator seats<input type="number" min="1" max="100" value={newAccount.operatorLimit} onChange={(event) => setNewAccount((current) => ({ ...current, operatorLimit: Number(event.target.value) }))} /></label> : null}
          {newAccount.role === "operator" ? <label>Institution<select className="select" required value={newAccount.institutionId ?? ""} onChange={(event) => setNewAccount((current) => ({ ...current, institutionId: event.target.value || null }))}><option value="">Choose institution</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label> : null}
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Creating..." : "Create account"}</button>
        </form>
      </div>

      <div className="panel account-detail-panel">
        {selectedUser ? <>
          <PanelHeading eyebrow="Selected account" title={selectedUser.name} action={<span className={`status ${selectedUser.status === "banned" ? "bad" : "good"}`}>{selectedUser.status}</span>} />
          <div className="account-identity"><span>{selectedUser.email}</span><small>Created {new Date(selectedUser.createdAt).toLocaleDateString()}</small></div>
          <div className="account-controls">
            <label>Workspace role<select className="select" value={role} disabled={saving} onChange={(event) => setRole(event.target.value as ManagedRole)}><option value="advertiser">Advertiser</option><option value="institutional">Institutional user</option><option value="operator">Operator</option></select></label>
            <label>Account access<select className="select" value={status} disabled={saving} onChange={(event) => setStatus(event.target.value as DbUser["status"])}><option value="active">Active</option><option value="banned">Banned</option></select></label>
            {role === "institutional" ? <label>Operator seats<input type="number" min="1" max="100" disabled={saving} value={operatorLimit} onChange={(event) => setOperatorLimit(Number(event.target.value))} /></label> : null}
            {role === "operator" ? <label>Institution<select className="select" required disabled={saving} value={institutionId ?? ""} onChange={(event) => setInstitutionId(event.target.value || null)}><option value="">Choose institution</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label> : null}
            <button className="primary-button" type="button" disabled={saving} onClick={() => void saveAccount()}>{saving ? "Saving..." : "Save account"}</button>
            <button className="danger-button" type="button" disabled={saving} onClick={() => void deleteAccount()}>Delete account</button>
          </div>
          {message ? <p className="account-message">{message}</p> : null}

          <section className="account-history-section">
            <div className="account-history-heading"><span className="eyebrow">Campaign history</span><strong>{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</strong></div>
            <div className="account-campaign-list">
              {campaigns.length ? campaigns.map((campaign) => {
                const unit = inventory.find((item) => item.id === campaign.inventoryId);
                return <div className="account-campaign-row" key={campaign.id}><span><strong>{campaign.campaign}</strong><small>{unit?.name ?? campaign.inventoryId} - {campaign.start} to {campaign.end}</small></span><span className="status">{campaign.status}</span><span>{money(campaign.spend)}</span></div>;
              }) : <div className="empty-state"><strong>No campaign history</strong><span>This account has not reserved inventory yet.</span></div>}
            </div>
          </section>

          <section className="account-history-section">
            <div className="account-history-heading"><span className="eyebrow">Uploaded files</span><strong>{deviceUploads.length + creativeUploads.length} file{deviceUploads.length + creativeUploads.length === 1 ? "" : "s"}</strong></div>
            <div className="account-upload-list">
              {[...deviceUploads, ...creativeUploads].map((resource) => (
                <a className="account-upload-row" key={resource.id} href={resource.publicUrl ?? "#"} target="_blank" rel="noreferrer">
                  {"mediaType" in resource && resource.mediaType === "video" || "mimeType" in resource && resource.mimeType?.startsWith("video/") ? <video muted playsInline preload="metadata" src={resource.publicUrl ?? undefined} /> : <img src={resource.publicUrl ?? ""} alt={resource.originalName ?? "Uploaded creative"} />}
                  <span><strong>{"title" in resource ? resource.title : resource.originalName ?? "Uploaded creative"}</strong><small>{"mediaType" in resource ? resource.mediaType : resource.fileType.toUpperCase()}</small></span>
                </a>
              ))}
              {!deviceUploads.length && !creativeUploads.length ? <div className="empty-state"><strong>No uploaded files</strong><span>Device media and campaign creative submitted by this account appear here.</span></div> : null}
            </div>
          </section>
        </> : <div className="empty-state"><strong>Select an account</strong><span>Choose an account from the list to manage its access and history.</span></div>}
      </div>
    </section>
  );
}
