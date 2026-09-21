"use client";

import "./creative-view.css";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Booking, Creative, FormatKey, InventoryItem, formats } from "../data";
import type { CreativeDraft } from "../types";
import { capitalize, creativeHref, isCreativeSubmissionAllowed, isPlainLeftClick, templateHeadline, templateTitle, validateCreative } from "../utils";
import { BookingsTable, EmptyState, PanelHeading, Range } from "./shared-ui";
import AsyncButton from "./async-button";
import { useI18n } from "../i18n/client";
import LocalDateTime from "./local-date-time";

export default function CreativeView({
  draft,
  setDraft,
  bookings,
  inventory,
  creatives,
  onSubmit,
  canSubmit,
  selectedBookingId,
  setSelectedBookingId,
  lockBookingSelection = false,
}: {
  draft: CreativeDraft;
  setDraft: Dispatch<SetStateAction<CreativeDraft>>;
  bookings: Booking[];
  inventory: InventoryItem[];
  creatives: Creative[];
  onSubmit: (bookingId: string, source: Creative["source"], file?: File | null) => Promise<boolean>;
  canSubmit: boolean;
  selectedBookingId: string;
  setSelectedBookingId: (id: string) => void;
  lockBookingSelection?: boolean;
}) {
  const { formatDate, t } = useI18n();
  const [sourceMode, setSourceMode] = useState<Creative["source"]>("template");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const spec = formats[draft.format];
  const validations = validateCreative(draft);
  const ready = validations.every((check) => check.ok);
  const uploadFileType = uploadFile ? fileTypeFromUpload(uploadFile) : null;
  const canSubmitCurrentMode = ready && (sourceMode === "template" || Boolean(uploadFile && uploadFileType));
  const eligibleBookings = bookings.filter((booking) => isCreativeSubmissionAllowed(booking));
  const creativeBookings = bookings.filter((booking) => booking.creativeStatus !== "approved" || booking.status === "creative review");
  const selectedBooking = eligibleBookings.find((booking) => booking.id === selectedBookingId) ?? eligibleBookings[0];
  const submittedCreative = selectedBooking ? creatives.find((creative) => creative.bookingId === selectedBooking.id) : undefined;

  useEffect(() => {
    if (!uploadFile) {
      setUploadPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(uploadFile);
    setUploadPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [uploadFile]);

  if (!selectedBooking) {
    return (
      <section className="panel">
        <PanelHeading eyebrow="Your ad" title="Book a screen first" />
        <EmptyState
          title="You need a booking before you can add an ad"
          copy="Pick a screen and your dates first. Your ad picture is attached to that booking, and the screen owner checks it before it goes live."
          action={<a className="primary-button" href="/?role=advertiser&view=discover">{t("Find screens near you")}</a>}
        />
      </section>
    );
  }

  return (
    <section className="grid creative-grid">
      <div className="panel">
        <PanelHeading eyebrow="Creative source" title={sourceMode === "template" ? "Fixed template" : "Upload media"} />
        <div className="creative-source-tabs" role="tablist" aria-label={t("Creative source")}>
          <button type="button" className={sourceMode === "template" ? "active" : ""} onClick={() => setSourceMode("template")}>{t("Fixed template")}</button>
          <button type="button" className={sourceMode === "upload" ? "active" : ""} onClick={() => setSourceMode("upload")}>{t("Upload media")}</button>
        </div>
        {sourceMode === "template" ? (
          <>
            <div className="template-tabs">
              {(["retail", "finance", "event"] as CreativeDraft["template"][]).map((template) => (
                <a key={template} href={creativeHref(draft, { template }, selectedBooking.id)} className={draft.template === template ? "active" : ""} onClick={(event) => {
                  if (!isPlainLeftClick(event)) return;
                  // Switch in place and keep the address on this template; the
                  // href alone reloaded the whole page after the switch.
                  event.preventDefault();
                  window.history.replaceState(window.history.state, "", event.currentTarget.href);
                  setDraft((current) => ({ ...current, template }));
                }}>{t(capitalize(template))}</a>
              ))}
            </div>
            <div className={`creative-canvas ${draft.template}`} style={{ aspectRatio: spec.ratio }}>
              <div className="safe-zone" style={{ inset: `${draft.safeZone}%` }}>
                <span>{t(templateHeadline(draft.template))}</span>
                <strong>{t(templateTitle(draft.template))}</strong>
                <small>{t(spec.label)}</small>
              </div>
            </div>
          </>
        ) : (
          <div className="upload-creative-panel">
            <label className="upload-dropzone">
              <span>{t("Image or video creative")}</span>
              <input type="file" accept="image/png,image/jpeg,image/gif,video/mp4" onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setUploadFile(file);
                if (!file) return;
                const nextFileType = fileTypeFromUpload(file);
                setDraft((current) => ({
                  ...current,
                  fileType: nextFileType ?? current.fileType,
                  fileSize: Math.max(1, Math.ceil(file.size / 1048576)),
                }));
              }} />
            </label>
            <div className="upload-preview" style={{ aspectRatio: spec.ratio }}>
              {uploadPreviewUrl && uploadFile?.type.startsWith("image/") ? <img src={uploadPreviewUrl} alt={t("Uploaded creative preview")} /> : null}
              {uploadPreviewUrl && uploadFile?.type.startsWith("video/") ? <video src={uploadPreviewUrl} controls muted /> : null}
              {!uploadPreviewUrl ? <span>{t("Select a PNG, JPG, GIF, or MP4 file")}</span> : null}
            </div>
            {uploadFile ? (
              <div className={`upload-summary ${uploadFileType ? "" : "bad"}`}>
                <strong>{uploadFile.name}</strong>
                <span>{uploadFileType ? `${uploadFileType.toUpperCase()} - ${Math.max(1, Math.ceil(uploadFile.size / 1048576))} MB` : t("Unsupported file type")}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="panel">
        <PanelHeading eyebrow="Automated validation" title="Output checks" action={<span className={`status ${canSubmitCurrentMode ? "good" : "bad"}`}>{t(canSubmitCurrentMode ? "Ready" : "Fix needed")}</span>} />
        <div className="creative-form">
          <label className="field-block">
            {t("Campaign")}
            <select className="select" value={selectedBooking.id} disabled={lockBookingSelection} aria-label={t("Campaign")} aria-describedby={lockBookingSelection ? "creation-campaign-help" : undefined} onChange={(event) => setSelectedBookingId(event.target.value)}>
              {eligibleBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.campaign} - {booking.advertiser}</option>)}
            </select>
            {lockBookingSelection ? <small id="creation-campaign-help">{t("This campaign was created in the previous step.")}</small> : null}
          </label>
          <div className="form-grid compact">
            <label>{t("Format")}<select className="select" value={draft.format} onChange={(event) => setCreativeFormat(event.target.value as FormatKey, setDraft)}>{(Object.keys(formats) as FormatKey[]).map((key) => <option key={key} value={key}>{t(formats[key].label)}</option>)}</select></label>
            <label>{t("Width")}<input type="number" value={draft.width} onChange={(event) => setDraft((current) => ({ ...current, width: Number(event.target.value) }))} /></label>
            <label>{t("Height")}<input type="number" value={draft.height} onChange={(event) => setDraft((current) => ({ ...current, height: Number(event.target.value) }))} /></label>
            <label>{t("File type")}<select className="select" value={draft.fileType} onChange={(event) => setDraft((current) => ({ ...current, fileType: event.target.value as CreativeDraft["fileType"] }))}>{["png", "jpg", "gif", "pdf", "mp4"].map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label>
            <Range label={t("File size: {count} MB", { count: draft.fileSize })} min={1} max={600} value={draft.fileSize} onChange={(fileSize) => setDraft((current) => ({ ...current, fileSize }))} />
            <Range label={t("Safe zone: {count}%", { count: draft.safeZone })} min={0} max={18} value={draft.safeZone} onChange={(safeZone) => setDraft((current) => ({ ...current, safeZone }))} />
            <Range label={t("Distortion: {count}%", { count: draft.distortion })} min={0} max={12} value={draft.distortion} onChange={(distortion) => setDraft((current) => ({ ...current, distortion }))} />
          </div>
          <div className="validation-list">
            {validations.map((check) => <div className={check.ok ? "pass" : "fail"} key={check.label}><strong>{t(check.label)}</strong><span>{t(check.message)}</span></div>)}
          </div>
          {submittedCreative ? (
            <div className="decision-banner good">
              <strong>{t("Creative on file - {status}", { status: t(submittedCreative.status) })}</strong>
              <span><LocalDateTime value={submittedCreative.createdAt} options={{ dateStyle: "medium", timeStyle: "short" }} template="{summary}, submitted {date}." variables={{ summary: creativeSummary(submittedCreative) }} /></span>
              {submittedCreative.publicUrl ? <a href={submittedCreative.publicUrl} target="_blank" rel="noreferrer">{t("Open uploaded media")}</a> : null}
            </div>
          ) : null}
          <div className="button-row">
            <AsyncButton className="primary-button" disabled={!canSubmitCurrentMode || !canSubmit} onClick={() => onSubmit(selectedBooking.id, sourceMode, uploadFile)} successMessage="Creative submitted for review." errorMessage="Creative submission failed. Please check the requirements and try again.">
              {canSubmit ? (sourceMode === "template" ? "Submit template for review" : "Submit upload for review") : "Sign in as advertiser to submit"}
            </AsyncButton>
          </div>
        </div>
      </div>
      <div className="panel span-2">
        <PanelHeading eyebrow="Creative queue" title="Submissions" />
        <BookingsTable bookings={creativeBookings} inventory={inventory} />
      </div>
    </section>
  );
}

function setCreativeFormat(format: FormatKey, setDraft: Dispatch<SetStateAction<CreativeDraft>>) {
  const defaults: Record<FormatKey, [number, number]> = { digital: [1920, 1080], static: [5760, 1440], transit: [3000, 1000] };
  setDraft((current) => ({ ...current, format, width: defaults[format][0], height: defaults[format][1] }));
}

function fileTypeFromUpload(file: File): Creative["fileType"] | null {
  const name = file.name.toLowerCase();
  if (file.type === "image/png" || name.endsWith(".png")) return "png";
  if (file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  if (file.type === "video/mp4" || name.endsWith(".mp4")) return "mp4";
  return null;
}

function creativeSummary(creative: Creative) {
  const source = creative.source === "upload" ? creative.originalName ?? "Uploaded media" : capitalize(creative.template);
  return `${source} - ${creative.width}x${creative.height}, ${creative.fileType.toUpperCase()}`;
}
