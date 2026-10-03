"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/client";
import { emergencyImageError, emergencyImageMaxBytes } from "../lib/emergency-image-limits";
import "./emergency-photo-input.css";

export function useEmergencyPhoto() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(true);
  useEffect(() => {
    setUrl(""); setError(""); setReady(!file);
    if (!file) return;
    if (!file.size || file.size > emergencyImageMaxBytes || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError(emergencyImageError); return;
    }
    const next = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { setUrl(next); setReady(true); };
    image.onerror = () => setError(emergencyImageError);
    image.src = next;
    return () => { image.onload = null; image.onerror = null; URL.revokeObjectURL(next); };
  }, [file]);
  return { file, url, error, ready, setFile };
}

export default function EmergencyPhotoInput({ photo, disabled, onChange }: {
  photo: ReturnType<typeof useEmergencyPhoto>; disabled: boolean; onChange: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!photo.file && input.current) input.current.value = ""; }, [photo.file]);
  return <div className="emergency-photo-input">
    <label>{t("Photo (optional)")}<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => { photo.setFile(event.target.files?.[0] ?? null); onChange(); }} /></label>
    <small>{t("PNG, JPEG, or WebP · Maximum 5 MB. The entire photo appears beside your instructions.")}</small>
    {photo.url ? <img src={photo.url} alt={t("Selected emergency photo")} /> : null}
    {photo.file ? <button className="secondary-button" disabled={disabled} type="button" onClick={() => { photo.setFile(null); if (input.current) input.current.value = ""; onChange(); }}>{t("Remove photo")}</button> : null}
    {photo.error ? <p className="form-error" role="alert">{t(photo.error)}</p> : null}
  </div>;
}
