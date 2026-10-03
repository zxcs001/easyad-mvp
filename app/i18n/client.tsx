"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Languages } from "lucide-react";
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME, localeNames, locales, type Locale } from "./config";
import { translate } from "./messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (message: string, variables?: Record<string, string | number>) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const englishFallback: I18nContextValue = {
  locale: "en",
  setLocale: () => undefined,
  t: (message, variables) => translate("en", message, variables),
  formatDate: (input, options) => new Intl.DateTimeFormat("en-CA", options).format(new Date(input)),
  formatNumber: (input, options) => new Intl.NumberFormat("en-CA", options).format(input),
};

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    router.refresh();
  }, [router]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (message, variables) => translate(locale, message, variables),
    formatDate: (input, options) => new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", options).format(new Date(input)),
    formatNumber: (input, options) => new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", options).format(input),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function FixedLocaleProvider({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: () => undefined,
    t: (message, variables) => translate(locale, message, variables),
    formatDate: (input, options) => new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", options).format(new Date(input)),
    formatNumber: (input, options) => new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", options).format(input),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext) ?? englishFallback;
}

export function isDeviceDisplayPath(pathname: string | null) {
  return pathname === "/devices" || pathname?.startsWith("/devices/") === true || pathname === "/player";
}

export function WebsiteLanguageSelector({ placement = "floating" }: { placement?: "floating" | "embedded" }) {
  const pathname = usePathname();
  if (isDeviceDisplayPath(pathname)) return null;
  return <LanguageSelector placement={placement} />;
}

export function LanguageSelector({ placement = "floating" }: { placement?: "floating" | "embedded" }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  // Hover opens the menu for a mouse, so a mouse click only opens it. On touch
  // there is no hover, and a click that only opened left no way to close it
  // with a second tap.
  const lastPointerType = useRef("mouse");

  // Anchored to the trigger's right edge, the menu ran off the left edge of the
  // screen when the trigger wrapped to the start of a row (about 700px wide).
  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.classList.remove("language-menu--start");
    if (menu.getBoundingClientRect().left < 8) menu.classList.add("language-menu--start");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openFromKeyboard(index: number) {
    if (open && optionRefs.current[index]) {
      optionRefs.current[index]?.focus();
      return;
    }
    setOpen(true);
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") { optionRefs.current[0]?.focus(); return; }
    if (event.key === "End") { optionRefs.current[locales.length - 1]?.focus(); return; }
    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : locales.length - 1)
      : (currentIndex + direction + locales.length) % locales.length;
    optionRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      className={`language-selector language-selector--${placement}${open ? " is-open" : ""}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={handleMenuKeyDown}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("Select language")}
        className="language-trigger"
        onClick={() => setOpen((current) => lastPointerType.current === "mouse" ? true : !current)}
        onPointerDown={(event) => { lastPointerType.current = event.pointerType; }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); openFromKeyboard(0); }
          if (event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); openFromKeyboard(locales.length - 1); }
        }}
        ref={triggerRef}
        type="button"
      >
        <Languages aria-hidden="true" />
        <span>{localeNames[locale]}</span>
        <ChevronDown aria-hidden="true" className="language-chevron" />
      </button>
      {open ? (
        <div aria-label={t("Language")} className="language-menu" ref={menuRef} role="menu">
          {locales.map((option, index) => (
            <button
              aria-checked={option === locale}
              className="language-option"
              key={option}
              onClick={() => { setLocale(option); setOpen(false); }}
              ref={(element) => { optionRefs.current[index] = element; }}
              role="menuitemradio"
              type="button"
            >
              <span>{localeNames[option]}</span>
              {option === locale ? <Check aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
