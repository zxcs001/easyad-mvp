"use client";

import "./institution-team-view.css";
import { useEffect, useState } from "react";
import type { DbUser } from "../lib/db";
import { PanelHeading } from "./shared-ui";

type NewOperator = { name: string; email: string; password: string };

export default function InstitutionTeamView({
  institution,
  operators,
  onCreateOperator,
  onDeleteOperator,
}: {
  institution: DbUser;
  operators: DbUser[];
  onCreateOperator: (operator: NewOperator) => Promise<{ user?: DbUser; error?: string }>;
  onDeleteOperator: (id: string) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState(operators[0]?.id ?? "");
  const [draft, setDraft] = useState<NewOperator>({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedOperator = operators.find((operator) => operator.id === selectedId) ?? operators[0] ?? null;
  const seatsRemaining = Math.max(0, institution.operatorLimit - operators.length);

  useEffect(() => {
    if (!selectedOperator && operators[0]) setSelectedId(operators[0].id);
  }, [operators, selectedOperator]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = await onCreateOperator(draft);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    if (result.user) {
      setDraft({ name: "", email: "", password: "" });
      setSelectedId(result.user.id);
      setMessage("Operator account created.");
    }
  }

  async function removeSelected() {
    if (!selectedOperator) return;
    setBusy(true);
    const deleted = await onDeleteOperator(selectedOperator.id);
    setBusy(false);
    setMessage(deleted ? "Operator account deleted. The seat is available again." : "Unable to delete this operator.");
    if (deleted) setSelectedId("");
  }

  return (
    <section className="grid account-management-grid">
      <div className="panel account-list-panel">
        <PanelHeading eyebrow="Institution account management" title="Operator seats" />
        <div className="institution-seat-summary"><strong>{operators.length} of {institution.operatorLimit}</strong><span>operator seats in use</span></div>
        <div className="account-list" role="list">
          {operators.length ? operators.map((operator) => <button className={`account-list-item ${operator.id === selectedOperator?.id ? "selected" : ""}`} type="button" key={operator.id} onClick={() => { setSelectedId(operator.id); setMessage(""); }}><span><strong>{operator.name}</strong><small>{operator.email}</small></span><span className={`status ${operator.status === "banned" ? "bad" : "good"}`}>{operator.status}</span><small>operator</small></button>) : <div className="empty-state"><strong>No operators yet</strong><span>Create an operator to manage devices under your institution.</span></div>}
        </div>
        <form className="account-create-form" onSubmit={submit}>
          <span className="eyebrow">Create operator</span>
          <label>Name<input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Email<input required type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
          <label>Temporary password<input required minLength={10} type="password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} /></label>
          <button className="primary-button" type="submit" disabled={busy || seatsRemaining === 0}>{busy ? "Creating..." : seatsRemaining ? "Create operator" : "Seat limit reached"}</button>
        </form>
      </div>

      <div className="panel account-detail-panel">
        {selectedOperator ? <>
          <PanelHeading eyebrow="Selected operator" title={selectedOperator.name} action={<span className={`status ${selectedOperator.status === "banned" ? "bad" : "good"}`}>{selectedOperator.status}</span>} />
          <div className="account-identity"><span>{selectedOperator.email}</span><small>Belongs to {institution.name}</small></div>
          <section className="account-history-section"><div className="automation-list"><div><strong>Institution boundary</strong><span>This operator can only create, update, and upload media for devices under {institution.name}.</span></div><div><strong>Seat usage</strong><span>{seatsRemaining} of {institution.operatorLimit} operator seats remain available.</span></div></div></section>
          <button className="danger-button" type="button" disabled={busy} onClick={() => void removeSelected()}>Delete operator</button>
          {message ? <p className="account-message">{message}</p> : null}
        </> : <div className="empty-state"><strong>Select an operator</strong><span>Create or choose an operator account to view its institution access.</span>{message ? <p className="account-message">{message}</p> : null}</div>}
      </div>
    </section>
  );
}
