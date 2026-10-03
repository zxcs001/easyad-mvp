"use client";

import "./device-screen.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DeviceAlert } from "../data";
import DeviceMediaCarousel, { DeviceMediaSlide } from "./device-media-carousel";
import { DeviceTemplate } from "./device-templates";
import { DeviceClock, PublicInfoPanel, TransitPanel, WeatherPanel, useMounted } from "./device-widgets";
import { useExpiringClock } from "./use-expiring-clock";
import { FixedLocaleProvider, useI18n } from "../i18n/client";
import type { Locale } from "../i18n/config";

type DeviceScreenProps = {
  mediaContent?: React.ReactNode;
  inventoryName: string;
  city: string;
  imageInterval: number;
  slides: DeviceMediaSlide[];
  template: DeviceTemplate;
  preview?: boolean;
  displayLanguage?: Locale;
  activeAlert?: DeviceAlert | null;
};

// Every preview of the player goes through this frame: Discover's detail card,
// the Command centre and the public inventory page. The player is built for a
// full screen, so it is drawn on a 1280x720 stage and the stage is scaled to the
// frame. The stage is a size container, so the player's cq units follow it.
// The frame element carries the page's own border and radius; the inner
// viewport holds the 16:9 shape, so a bordered frame still scales correctly.
// The initial scale is a constant so server and client markup match; the real
// width is measured after mount.
const PREVIEW_STAGE_WIDTH = 1280;

export function ScaledDevicePreview({ children, className }: { children: ReactNode; className?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      if (viewport.clientWidth) setScale(viewport.clientWidth / PREVIEW_STAGE_WIDTH);
    };
    update();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={className}>
      <div className="device-preview-viewport" ref={viewportRef}>
        <div className="device-preview-stage" style={{ transform: `scale(${scale})` }}>{children}</div>
      </div>
    </div>
  );
}

export default function DeviceScreen(props: DeviceScreenProps) {
  const content = <DeviceScreenContent {...props} />;
  return props.displayLanguage ? <FixedLocaleProvider locale={props.displayLanguage}>{content}</FixedLocaleProvider> : content;
}

function DeviceScreenContent({
  inventoryName,
  city,
  imageInterval,
  slides,
  template,
  preview = false,
  displayLanguage,
  activeAlert,
  mediaContent,
}: DeviceScreenProps) {
  const { t } = useI18n();
  const stopName = `${city} - ${inventoryName}`;
  const media = (
    <div className="device-region media">
      {mediaContent ?? <DeviceMediaCarousel inventoryName={inventoryName} imageInterval={imageInterval} slides={slides} interactive={preview} />}
    </div>
  );

  const Root = preview ? "div" : "main";
  const alertClock = useExpiringClock(activeAlert?.status === "active" ? [activeAlert.expiresAt] : []);
  const showAlert = Boolean(activeAlert && activeAlert.status === "active" && Date.parse(activeAlert.expiresAt) > alertClock);

  return (
    <Root className={`device-player${preview ? " device-player-preview" : ""} tpl-${template}${showAlert ? " has-emergency-override" : ""}`} aria-label={`${inventoryName} ${t(preview ? "display preview" : "media player")}`} lang={displayLanguage}>
      {showAlert && activeAlert ? <EmergencyAlertScreen alert={activeAlert} /> : null}
      {!showAlert ? <>
      {template === "weather" ? (
        <>
          <aside className="device-region aside">
            <DeviceClock city={city} />
            <WeatherPanel city={city} seed={inventoryName} />
          </aside>
          {media}
        </>
      ) : null}

      {template === "public-info" ? (
        <>
          {media}
          <aside className="device-region aside">
            <DeviceClock city={city} />
            <PublicInfoPanel city={city} />
          </aside>
        </>
      ) : null}

      {template === "transit" ? (
        <>
          {media}
          <aside className="device-region aside">
            <DeviceClock city={city} />
            <TransitPanel stopName={stopName} seed={inventoryName} />
          </aside>
        </>
      ) : null}

      {template === "community" ? (
        <>
          <header className="device-region top">
            <DeviceClock city={city} />
            <WeatherPanel city={city} seed={inventoryName} compact />
          </header>
          {media}
          <footer className="device-region ticker">
            <TransitPanel stopName={stopName} seed={inventoryName} ticker />
          </footer>
        </>
      ) : null}

      {template === "fullscreen" ? media : null}
      </> : null}
    </Root>
  );
}

function EmergencyAlertScreen({ alert }: { alert: DeviceAlert }) {
  const { formatDate, t } = useI18n();
  const typeLabel = alert.alertType === "amber" ? "AMBER Alert" : alert.alertType === "weather" ? "Severe weather alert" : alert.alertType === "evacuation" ? "Evacuation notice" : "Public safety alert";
  // After mount: during the server render the expiry time came out in the
  // server's zone, so the kiosk flashed a different time and a hydration error.
  const mounted = useMounted();
  const expires = mounted ? formatDate(alert.expiresAt, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "";
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [alert.image?.url]);
  return (
    <section className={`emergency-screen emergency-${alert.alertType}`} role="alert" aria-label={`${typeLabel}: ${alert.title}`}>
      <header><span className="emergency-beacon" aria-hidden="true" /><strong>{t(typeLabel)}</strong><span>{t("Screen emergency override")}</span></header>
      <div className={`emergency-body${alert.image ? " with-photo" : ""}`}>
      {alert.image ? <div className="emergency-photo">{photoFailed ? <p>{t("Photo unavailable. Emergency instructions remain active.")}</p> : <img data-emergency-photo src={alert.image.url} alt={t("Emergency photo: {title}", { title: alert.title })} onLoad={() => setPhotoFailed(false)} onError={() => setPhotoFailed(true)} />}</div> : null}
      <div className={`emergency-message${alert.title.length + alert.message.length > 400 ? " emergency-copy-dense" : ""}`}>
        <span className="emergency-area">{alert.area}</span>
        <h1>{alert.title}</h1>
        <p>{alert.message}</p>
      </div>
      </div>
      <footer><span>{t("Issued by {name}", { name: alert.issuedBy })}</span><span>{t("Display until {time}", { time: expires })}</span></footer>
    </section>
  );
}
