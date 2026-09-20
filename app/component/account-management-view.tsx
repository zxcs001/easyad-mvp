"use client";

import "./account-management-view.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Booking, Creative, InventoryItem, MediaResource, Role } from "../data";
import type { DbUser } from "../lib/db";
import { managedRoleOptions, roleLabel } from "../roles";
import { money } from "../utils";
import { PanelHeading } from "./shared-ui";
import SecretInput from "./secret-input";
import { useI18n } from "../i18n/client";
import LocalDateTime from "./local-date-time";
import AsyncButton from "./async-button";
import AppDialog from "./app-dialog";
import { toast } from "./toast";

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
  const { formatDate, locale, t } = useI18n();
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const [role, setRole] = useState<ManagedRole>("advertiser");
  const [status, setStatus] = useState<DbUser["status"]>("active");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [operatorLimit, setOperatorLimit] = useState(5);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const [roleFilter, setRoleFilter] = useState<ManagedRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DbUser["status"] | "all">("all");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
    if (!selectedUser) return false;
    setMessage("");
    const saved = await onUpdateAccount(selectedUser.id, { role, status, institutionId, operatorLimit });
    if (!saved) setMessage("Unable to save this account.");
    return saved;
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const result = await onCreateAccount(newAccount);
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      toast.error(result.error);
      return;
    }
    if (result.user) {
      setNewAccount({ name: "", email: "", password: "", role: "advertiser", institutionId: null, operatorLimit: 5 });
      setSelectedId(result.user.id);
      toast.success("Account created.");
    }
  }

  async function deleteAccount() {
    if (!selectedUser) return false;
    setSaving(true);
    try {
      const deleted = await onDeleteAccount(selectedUser.id);
      if (deleted) {
        setSelectedId("");
        setDeleteDialogOpen(false);
      } else {
        setMessage("Unable to delete this account.");
      }
      return deleted;
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid account-management-grid">
      <div className="panel account-list-panel">
        <PanelHeading eyebrow="Super admin controls" title="Accounts" />
        <div className="account-filters">
          <div className="account-search-field">
            <label htmlFor="account-search">{t("Search accounts")}</label>
            <div className="account-search-control">
              <input aria-label={t("Search accounts")} id="account-search" ref={searchRef} value={searchQuery} placeholder={t("Name, email, or account ID")} onChange={(event) => setSearchQuery(event.target.value)} />
              {searchQuery ? <button aria-label={t("Clear account search")} onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }} type="button"><X aria-hidden="true" /></button> : null}
            </div>
          </div>
          <label>{t("Role")}<select className="select" aria-label={t("Filter by role")} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as ManagedRole | "all")}><option value="all">{t("All roles")}</option>{managedRoleOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></label>
          <label>{t("Access")}<select className="select" aria-label={t("Filter by access status")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DbUser["status"] | "all")}><option value="all">{t("All access")}</option><option value="active">{t("Active")}</option><option value="banned">{t("Banned")}</option></select></label>
          <small>{t("{visible} of {total} accounts", { visible: filteredUsers.length, total: users.length })}</small>
        </div>
        <div className="account-list" role="list">
          {filteredUsers.length ? filteredUsers.map((user) => (
            <button className={`account-list-item ${user.id === selectedUser?.id ? "selected" : ""}`} type="button" key={user.id} onClick={() => { setSelectedId(user.id); setMessage(""); }}>
              <span><strong>{user.name}</strong><small>{user.email}</small></span>
              <span className={`status ${user.status === "banned" ? "bad" : "good"}`}>{t(user.status)}</span>
              <small>{t(user.role === "operator" && user.institutionId ? "Operator - institution" : roleLabel(user.role))}</small>
            </button>
          )) : <div className="empty-state"><strong>{t("No matching accounts")}</strong><span>{t("Adjust the account filters or create a new non-admin account.")}</span></div>}
        </div>
        <form className="account-create-form" noValidate onSubmit={createAccount}>
          <span className="eyebrow">{t("Create account")}</span>
          <label>{t("Name")}<input required value={newAccount.name} onChange={(event) => setNewAccount((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>{t("Email")}<input required type="email" value={newAccount.email} onChange={(event) => setNewAccount((current) => ({ ...current, email: event.target.value }))} /></label>
          <SecretInput autoComplete="new-password" label="Temporary password" minLength={10} required secretName="temporary password" value={newAccount.password} onChange={(event) => setNewAccount((current) => ({ ...current, password: event.target.value }))} />
          <label>{t("Account role")}<select aria-label={t("New account role")} className="select" value={newAccount.role} onChange={(event) => setNewAccount((current) => ({ ...current, role: event.target.value as ManagedRole }))}>{managedRoleOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></label>
          {newAccount.role === "institutional" ? <p className="account-role-help">{t("Institution accounts open the dedicated Civic Screen Operations dashboard at /government. Super Admin retains access to every institution network.")}</p> : null}
          {newAccount.role === "institutional" ? <label>{t("Operator seats")}<input type="number" min="1" max="100" value={newAccount.operatorLimit} onChange={(event) => setNewAccount((current) => ({ ...current, operatorLimit: Number(event.target.value) }))} /></label> : null}
          {newAccount.role === "operator" ? <label>{t("Institution")}<select className="select" required value={newAccount.institutionId ?? ""} onChange={(event) => setNewAccount((current) => ({ ...current, institutionId: event.target.value || null }))}><option value="">{t("Choose institution")}</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label> : null}
          <button aria-busy={saving} className="primary-button" type="submit" disabled={saving}><span className="inline-pending">{saving ? <span aria-hidden="true" className="async-spinner" /> : null}{t(saving ? "Creating..." : "Create account")}</span></button>
        </form>
      </div>

      <div className="panel account-detail-panel">
        {selectedUser ? <>
          <PanelHeading eyebrow="Selected account" title={selectedUser.name} action={<span className={`status ${selectedUser.status === "banned" ? "bad" : "good"}`}>{t(selectedUser.status)}</span>} />
          <div className="account-identity"><span>{selectedUser.email}</span><small><LocalDateTime value={selectedUser.createdAt} template="Created {date}" /></small></div>
          <div className="account-controls">
            <label>{t("Workspace role")}<select className="select" value={role} disabled={saving} onChange={(event) => setRole(event.target.value as ManagedRole)}>{managedRoleOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></label>
            <label>{t("Account access")}<select className="select" value={status} disabled={saving} onChange={(event) => setStatus(event.target.value as DbUser["status"])}><option value="active">{t("Active")}</option><option value="banned">{t("Banned")}</option></select></label>
            {role === "institutional" ? <label>{t("Operator seats")}<input type="number" min="1" max="100" disabled={saving} value={operatorLimit} onChange={(event) => setOperatorLimit(Number(event.target.value))} /></label> : null}
            {role === "operator" ? <label>{t("Institution")}<select className="select" required disabled={saving} value={institutionId ?? ""} onChange={(event) => setInstitutionId(event.target.value || null)}><option value="">{t("Choose institution")}</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label> : null}
            <AsyncButton className="primary-button" disabled={saving} onClick={saveAccount} successMessage="Account saved." errorMessage="Unable to save this account.">Save account</AsyncButton>
            <button className="danger-button" type="button" disabled={saving} onClick={() => { setMessage(""); setDeleteDialogOpen(true); }}>{t("Delete account")}</button>
          </div>
          {message ? <p className="account-message">{t(message)}</p> : null}

          <section className="account-history-section">
            <div className="account-history-heading"><span className="eyebrow">{t("Campaign history")}</span><strong>{t(campaigns.length === 1 ? "{count} campaign" : "{count} campaigns", { count: campaigns.length })}</strong></div>
            <div className="account-campaign-list">
              {campaigns.length ? campaigns.map((campaign) => {
                const unit = inventory.find((item) => item.id === campaign.inventoryId);
                return <div className="account-campaign-row" key={campaign.id}><span><strong>{campaign.campaign}</strong><small>{unit?.name ?? campaign.inventoryId} - {campaign.start} {t("to")} {campaign.end}</small></span><span className="status">{t(campaign.status)}</span><span>{money(campaign.spend, locale)}</span></div>;
              }) : <div className="empty-state"><strong>{t("No campaign history")}</strong><span>{t("This account has not reserved inventory yet.")}</span></div>}
            </div>
          </section>

          <section className="account-history-section">
            <div className="account-history-heading"><span className="eyebrow">{t("Uploaded files")}</span><strong>{t(deviceUploads.length + creativeUploads.length === 1 ? "{count} file" : "{count} files", { count: deviceUploads.length + creativeUploads.length })}</strong></div>
            <div className="account-upload-list">
              {[...deviceUploads, ...creativeUploads].map((resource) => {
                const content = <>
                  {"mediaType" in resource && resource.mediaType === "video" || "mimeType" in resource && resource.mimeType?.startsWith("video/") ? <video muted playsInline preload="metadata" src={resource.publicUrl ?? undefined} /> : <img src={resource.publicUrl ?? ""} alt={resource.originalName ?? t("Uploaded creative")} />}
                  <span><strong>{"title" in resource ? resource.title : resource.originalName ?? t("Uploaded creative")}</strong><small>{t("mediaType" in resource ? resource.mediaType : resource.fileType.toUpperCase())}</small></span>
                </>;
                return resource.publicUrl ? <a className="account-upload-row" key={resource.id} href={resource.publicUrl} target="_blank" rel="noreferrer">{content}</a> : <div aria-disabled="true" className="account-upload-row unavailable" key={resource.id}>{content}</div>;
              })}
              {!deviceUploads.length && !creativeUploads.length ? <div className="empty-state"><strong>{t("No uploaded files")}</strong><span>{t("Device media and campaign creative submitted by this account appear here.")}</span></div> : null}
            </div>
          </section>
        </> : <div className="empty-state"><strong>{t("Select an account")}</strong><span>{t("Choose an account from the list to manage its access and history.")}</span></div>}
      </div>
      <AppDialog
        dismissible={!saving}
        initialFocusRef={deleteCancelRef}
        open={deleteDialogOpen && Boolean(selectedUser)}
        title={t("Delete account")}
        description={selectedUser ? t("Delete {name} and remove its access to EasyAD. This cannot be undone.", { name: selectedUser.name }) : undefined}
        onClose={() => { if (!saving) setDeleteDialogOpen(false); }}
      >
        <div className="account-delete-confirmation">
          {message ? <p className="dialog-error" role="alert">{t(message)}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={saving} onClick={() => setDeleteDialogOpen(false)} ref={deleteCancelRef} type="button">{t("Keep account")}</button>
            <AsyncButton className="danger-button" disabled={saving} onClick={deleteAccount} successMessage="Account deleted." errorMessage="Unable to delete this account.">Delete account</AsyncButton>
          </div>
        </div>
      </AppDialog>
    </section>
  );
}
