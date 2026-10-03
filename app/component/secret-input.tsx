"use client";

import "./secret-input.css";
import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "../i18n/client";

type SecretInputProps = Omit<ComponentProps<"input">, "type"> & {
  label: string;
  secretName?: string;
};

export default function SecretInput({ label, secretName = "password", id, className = "", disabled, ...inputProps }: SecretInputProps) {
  const { t } = useI18n();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [revealed, setRevealed] = useState(false);
  const action = revealed ? "Hide" : "Show";

  return (
    <div className="secret-field">
      <label htmlFor={inputId}>{t(label)}</label>
      <div className="secret-input-control">
        <input {...inputProps} className={className} disabled={disabled} id={inputId} type={revealed ? "text" : "password"} />
        <button aria-label={t(`${action} ${secretName}`)} className="secret-input-toggle" disabled={disabled} onClick={() => setRevealed((current) => !current)} type="button">
          {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
