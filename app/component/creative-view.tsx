"use client";

import "./creative-view.css";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Booking, Creative, InventoryItem, formats } from "../data";
import type { CreativeDraft } from "../types";
import { creativeTemplateExamples, creativeTemplateTopics, defaultCreativeHtml, type CreativeTemplateTopic } from "../creative-templates";
import { capitalize, creativeDraftForFormat, creativeHref, isCreativeSubmissionAllowed, isPlainLeftClick, validateCreative } from "../utils";
import { BookingsTable, EmptyState, PanelHeading, Range } from "./shared-ui";
import AsyncButton from "./async-button";
import { useI18n } from "../i18n/client";
import LocalDateTime from "./local-date-time";
import { isStaticInventory } from "../lib/inventory-delivery";

export default function CreativeView({
  draft: inputDraft,
  setDraft,
  bookings,
  inventory,
  creatives,
  onSubmit,
  onCancel,
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
  onCancel?: (bookingId: string) => Promise<boolean>;
  canSubmit: boolean;
  selectedBookingId: string;
  setSelectedBookingId: (id: string) => void;
  lockBookingSelection?: boolean;
}) {
  const { t } = useI18n();
  const [preferredSource, setSourceMode] = useState<Creative["source"]>("template");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const eligibleBookings = bookings.filter((booking) => isCreativeSubmissionAllowed(booking));
  const creativeBookings = bookings.filter((booking) => !["cancelled", "rejected"].includes(booking.status) && (booking.creativeStatus !== "approved" || booking.status === "creative review"));
  const selectedBooking = selectedBookingId ? eligibleBookings.find((booking) => booking.id === selectedBookingId) : eligibleBookings[0];
  const cancellationBookingId = selectedBooking?.id ?? selectedBookingId;
  const selectedInventory = inventory.find((item) => item.id === selectedBooking?.inventoryId);
  const requiresUpload = selectedInventory ? isStaticInventory(selectedInventory) : inputDraft.format === "static";
  const sourceMode = requiresUpload ? "upload" : preferredSource;
  const draft = selectedInventory ? creativeDraftForFormat(inputDraft, selectedInventory.format) : inputDraft;
  const templateHtml = draft.htmlByTopic?.[draft.template] ?? defaultCreativeHtml[draft.template];
  const previewKey = `${draft.template}\u0000${templateHtml}`;
  const [htmlPreview, setHtmlPreview] = useState<{ key: string; document: string } | null>(null);
  const [examplePreviews, setExamplePreviews] = useState<Partial<Record<CreativeTemplateTopic, string>>>({});
  const [htmlError, setHtmlError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<{ bookingId: string; message: string } | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const actionPendingRef = useRef(false);
  const spec = formats[draft.format];
  const allowedUploadTypes = requiresUpload ? ["png", "jpg", "pdf"] : ["png", "jpg", "gif", "mp4"];
  const detectedFileType = uploadFile ? fileTypeFromUpload(uploadFile) : null;
  const uploadFileType = detectedFileType && allowedUploadTypes.includes(detectedFileType) ? detectedFileType : null;
  const validations = validateCreative(sourceMode === "template" ? { ...draft, fileType: "html", fileSize: 1 } : {
    ...draft,
    fileType: uploadFileType ?? draft.fileType,
    fileSize: uploadFile ? Math.max(1, Math.ceil(uploadFile.size / 1048576)) : draft.fileSize,
  });
  const ready = validations.every((check) => check.ok);
  const canSubmitCurrentMode = ready && (sourceMode === "template" ? htmlPreview?.key === previewKey : Boolean(uploadFile && uploadFileType));
  const submittedCreative = selectedBooking ? creatives.find((creative) => creative.bookingId === selectedBooking.id) : undefined;

  useEffect(() => {
    if (selectedInventory) setDraft((current) => creativeDraftForFormat(current, selectedInventory.format));
  }, [selectedInventory?.format, setDraft]);

  async function submitCurrentCreative() {
    if (!selectedBooking || actionPendingRef.current) return false;
    actionPendingRef.current = true;
    setActionPending(true);
    setSubmissionError(null);
    try {
      const result = await onSubmit(selectedBooking.id, sourceMode, uploadFile);
      if (!result) throw new Error("The creative submission was not confirmed. Please retry.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The creative submission was not confirmed. Please retry.";
      setSubmissionError({ bookingId: selectedBooking.id, message });
      throw new Error(message);
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  }

  async function cancelCurrentCreative() {
    if (!onCancel || actionPendingRef.current) return false;
    actionPendingRef.current = true;
    setActionPending(true);
    setSubmissionError(null);
    try {
      const result = await onCancel(cancellationBookingId);
      if (!result) throw new Error("Could not cancel this campaign. Your campaign is still here; please retry.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not cancel this campaign. Your campaign is still here; please retry.";
      setSubmissionError({ bookingId: cancellationBookingId, message });
      throw new Error(message);
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  }

  useEffect(() => {
    if (!uploadFile) {
      setUploadPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(uploadFile);
    setUploadPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [uploadFile]);

  useEffect(() => {
    if (sourceMode !== "template") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/creative/template-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: draft.template, html: templateHtml }),
          signal: controller.signal,
        });
        const result = await response.json() as { document?: string; error?: string };
        if (!response.ok || !result.document) throw new Error(result.error ?? "Preview could not be generated.");
        setHtmlPreview({ key: previewKey, document: result.document });
        setHtmlError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setHtmlPreview(null);
        setHtmlError(error instanceof Error ? error.message : "Preview could not be generated.");
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [draft.template, previewKey, sourceMode, templateHtml]);

  useEffect(() => {
    if (sourceMode !== "template") return;
    const controller = new AbortController();
    fetch("/api/creative/template-preview", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { examples?: Partial<Record<CreativeTemplateTopic, string>> };
        if (!controller.signal.aborted && result.examples) setExamplePreviews(result.examples);
      })
      .catch(() => { /* The selected template's preview reports its own error. */ });
    return () => controller.abort();
  }, [sourceMode]);

  if (!selectedBooking) {
    const unavailableCampaign = bookings.some((booking) => booking.id === selectedBookingId);
    return (
      <section className="panel">
        <PanelHeading eyebrow="Your ad" title={unavailableCampaign ? "Creative submission unavailable" : "Book a screen first"} />
        <EmptyState
          title={unavailableCampaign ? "This campaign is not accepting artwork" : "You need a booking before you can add an ad"}
          copy={unavailableCampaign ? "This campaign has ended or is no longer awaiting artwork. Check its status in Your campaigns." : "Pick a screen and your dates first. Your ad picture is attached to that booking, and the screen owner checks it before it goes live."}
          action={<a className="primary-button" href={unavailableCampaign ? "/?role=advertiser&view=campaigns" : "/?role=advertiser&view=discover"}>{t(unavailableCampaign ? "Your campaigns" : "Find screens near you")}</a>}
        />
        {onCancel ? <AsyncButton className="secondary-button" disabled={actionPending} onClick={cancelCurrentCreative} successMessage={lockBookingSelection ? "Campaign cancelled." : undefined}>{lockBookingSelection ? "Cancel campaign" : "Cancel editing"}</AsyncButton> : null}
        {submissionError ? <p className="form-error" role="alert">{t(submissionError.message)}</p> : null}
      </section>
    );
  }

  return (
    <section className="grid creative-grid">
      <div className="panel">
        <PanelHeading eyebrow="Creative source" title={sourceMode === "template" ? "Fixed template" : "Upload media"} />
        {requiresUpload ? <p className="helper-text">{t("Static billboards require uploaded artwork. Choose a PNG, JPG, or PDF file.")}</p> : <div className="creative-source-tabs" role="tablist" aria-label={t("Creative source")}>
          <button type="button" className={sourceMode === "template" ? "active" : ""} onClick={() => setSourceMode("template")}>{t("Fixed template")}</button>
          <button type="button" className={sourceMode === "upload" ? "active" : ""} onClick={() => setSourceMode("upload")}>{t("Upload media")}</button>
        </div>}
        {sourceMode === "template" ? (
          <>
            <div className="template-gallery-heading">
              <strong>{t("Choose a ready-made design")}</strong>
              <span>{t("Each design includes example copy. Select one and replace the details for your campaign.")}</span>
            </div>
            <div className="template-tabs">
              {creativeTemplateTopics.map((template) => (
                <a key={template} href={creativeHref(draft, { template }, selectedBooking.id)} aria-label={t("{topic} design: {name}", { topic: t(capitalize(template)), name: t(creativeTemplateExamples[template].name) })} aria-current={draft.template === template ? "true" : undefined} className={`template-choice ${draft.template === template ? "active" : ""}`} onClick={(event) => {
                  if (!isPlainLeftClick(event)) return;
                  // Switch in place and keep the address on this template; the
                  // href alone reloaded the whole page after the switch.
                  event.preventDefault();
                  window.history.replaceState(window.history.state, "", event.currentTarget.href);
                  setDraft((current) => ({ ...current, template }));
                }}>
                  <span className={`template-choice-art ${template}`}>
                    {examplePreviews[template] ? <iframe title={t("{topic} design example", { topic: t(capitalize(template)) })} sandbox="" referrerPolicy="no-referrer" srcDoc={examplePreviews[template]} tabIndex={-1} /> : null}
                  </span>
                  <span className="template-choice-copy">
                    <span className="template-choice-topic">{t(capitalize(template))}</span>
                    <strong>{t(creativeTemplateExamples[template].name)}</strong>
                    <small>{t(creativeTemplateExamples[template].description)}</small>
                  </span>
                </a>
              ))}
            </div>
            <div className="creative-html-preview" style={{ aspectRatio: spec.ratio }}>
              {htmlPreview?.key === previewKey ? <iframe title={t("Template preview")} sandbox="" referrerPolicy="no-referrer" srcDoc={htmlPreview.document} /> : <span>{t("Preparing safe preview…")}</span>}
            </div>
            <label className="creative-html-editor">{t("Template HTML")}
              <textarea value={templateHtml} maxLength={16384} rows={20} spellCheck={false} onChange={(event) => {
                const html = event.target.value;
                setDraft((current) => ({ ...current, htmlByTopic: { ...current.htmlByTopic, [current.template]: html } }));
              }} />
            </label>
            <div className="creative-html-editor-foot">
              <small>{t("Edit the words and layout tags. Scripts, links, images, and inline styles are removed for safety.")}</small>
              <button type="button" onClick={() => setDraft((current) => ({ ...current, htmlByTopic: { ...current.htmlByTopic, [current.template]: defaultCreativeHtml[current.template] } }))}>{t("Reset this topic")}</button>
            </div>
            {htmlError ? <p className="form-error" role="alert">{t(htmlError)}</p> : null}
          </>
        ) : (
          <div className="upload-creative-panel">
            <label className="upload-dropzone">
              <span>{t(requiresUpload ? "Billboard artwork" : "Image or video creative")}</span>
              <input type="file" accept={requiresUpload ? "image/png,image/jpeg,application/pdf" : "image/png,image/jpeg,image/gif,video/mp4"} onChange={(event) => {
                setSubmissionError(null);
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
              {uploadPreviewUrl && uploadFileType === "pdf" ? <span>{t("PDF artwork selected. Open the file to check the print layout.")}</span> : null}
              {!uploadPreviewUrl ? <span>{t(requiresUpload ? "Select a PNG, JPG, or PDF file" : "Select a PNG, JPG, GIF, or MP4 file")}</span> : null}
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
            <select className="select" value={selectedBooking.id} disabled={lockBookingSelection || actionPending} aria-label={t("Campaign")} aria-describedby={lockBookingSelection ? "creation-campaign-help" : undefined} onChange={(event) => setSelectedBookingId(event.target.value)}>
              {eligibleBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.campaign} - {booking.advertiser}</option>)}
            </select>
            {lockBookingSelection ? <small id="creation-campaign-help">{t("This campaign was created in the previous step.")}</small> : null}
          </label>
          <div className="form-grid compact">
            <label>{t("Format")}<input value={t(spec.label)} readOnly /></label>
            <label>{t("Width")}<input type="number" value={draft.width} readOnly /></label>
            <label>{t("Height")}<input type="number" value={draft.height} readOnly /></label>
            <label>{t("File type")}<input value={sourceMode === "template" ? "HTML" : uploadFileType?.toUpperCase() ?? t(uploadFile ? "Unsupported file type" : "No file selected")} readOnly /></label>
            {sourceMode === "upload" ? <label>{t("File size")}<input value={uploadFile ? `${Math.max(1, Math.ceil(uploadFile.size / 1048576))} MB` : t("No file selected")} readOnly /></label> : null}
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
          {sourceMode === "upload" && !uploadFile ? <p className="helper-text">{t("Choose a media file before submitting your creative.")}</p> : null}
          {submissionError?.bookingId === selectedBooking.id ? <p className="form-error" role="alert" style={{ whiteSpace: "pre-line" }}>{t(submissionError.message)}</p> : null}
          <div className="button-row">
            {onCancel ? <AsyncButton className="secondary-button" disabled={actionPending} onClick={cancelCurrentCreative} successMessage={lockBookingSelection ? "Campaign cancelled." : undefined}>
              {lockBookingSelection ? "Cancel campaign" : "Cancel editing"}
            </AsyncButton> : null}
            <AsyncButton className="primary-button" disabled={actionPending || !canSubmitCurrentMode || !canSubmit} onClick={submitCurrentCreative} successMessage="Creative submitted for review.">
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

function fileTypeFromUpload(file: File): Creative["fileType"] | null {
  const name = file.name.toLowerCase();
  if (file.type === "image/png" || name.endsWith(".png")) return "png";
  if (file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === "video/mp4" || name.endsWith(".mp4")) return "mp4";
  return null;
}

function creativeSummary(creative: Creative) {
  const source = creative.source === "upload" ? creative.originalName ?? "Uploaded media" : capitalize(creative.template);
  return `${source} - ${creative.width}x${creative.height}, ${creative.fileType.toUpperCase()}`;
}
