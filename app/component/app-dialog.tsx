"use client";

import "./app-dialog.css";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "../i18n/client";

export default function AppDialog({
  open,
  title,
  description,
  children,
  onClose,
  dismissible = true,
  initialFocusRef,
  className = "",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { dismissibleRef.current = dismissible; }, [dismissible]);

  useEffect(() => {
    const root = document.createElement("div");
    root.dataset.appDialogRoot = "";
    document.body.appendChild(root);
    setPortalRoot(root);
    return () => root.remove();
  }, []);

  useEffect(() => {
    if (!open || !portalRoot) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const inerted = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== portalRoot)
      .map((element) => ({ element, inert: element.inert }));
    inerted.forEach(({ element }) => { element.inert = true; });

    const focusTimer = window.setTimeout(() => {
      const preferred = initialFocusRef?.current;
      if (preferred) preferred.focus();
      else {
        const first = firstFocusable(dialogRef.current);
        if (first) first.focus();
        else dialogRef.current?.focus();
      }
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissibleRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = focusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      inerted.forEach(({ element, inert }) => { element.inert = inert; });
      restoreFocusRef.current?.focus();
    };
  }, [initialFocusRef, open, portalRoot]);

  if (!open || !portalRoot) return null;

  return createPortal(
    <div className="app-dialog-layer">
      <div className="app-dialog-backdrop" aria-hidden="true" />
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`app-dialog ${className}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="app-dialog-header">
          <div><h2 id={titleId}>{t(title)}</h2>{description ? <p id={descriptionId}>{t(description)}</p> : null}</div>
          <button aria-label={t("Close dialog")} className="app-dialog-close" disabled={!dismissible} onClick={onClose} type="button"><X aria-hidden="true" /></button>
        </header>
        <div className="app-dialog-body">{children}</div>
      </div>
    </div>,
    portalRoot,
  );
}

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function firstFocusable(root: HTMLElement | null) {
  return root ? focusableElements(root)[0] : undefined;
}
