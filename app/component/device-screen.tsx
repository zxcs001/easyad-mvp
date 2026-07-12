"use client";

import "./device-screen.css";
import DeviceMediaCarousel, { DeviceMediaSlide } from "./device-media-carousel";
import { DeviceTemplate } from "./device-templates";
import { DeviceClock, PublicInfoPanel, TransitPanel, WeatherPanel } from "./device-widgets";

export default function DeviceScreen({
  inventoryName,
  city,
  imageInterval,
  slides,
  template,
  preview = false,
  deviceId,
}: {
  inventoryName: string;
  city: string;
  imageInterval: number;
  slides: DeviceMediaSlide[];
  template: DeviceTemplate;
  preview?: boolean;
  deviceId?: string;
}) {
  const stopName = `${city} - ${inventoryName}`;
  const media = (
    <div className="device-region media">
      <DeviceMediaCarousel inventoryName={inventoryName} imageInterval={imageInterval} slides={slides} />
    </div>
  );

  const Root = preview ? "div" : "main";

  return (
    <Root className={`device-player${preview ? " device-player-preview" : ""} tpl-${template}`} aria-label={`${inventoryName} ${preview ? "display preview" : "media player"}`}>
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
      {!preview && deviceId ? <DeviceApiGuide deviceId={deviceId} deviceName={inventoryName} mediaCount={slides.length} /> : null}
    </Root>
  );
}

function DeviceApiGuide({ deviceId, deviceName, mediaCount }: { deviceId: string; deviceName: string; mediaCount: number }) {
  const apiPath = `/api/public/devices/${encodeURIComponent(deviceId)}/media`;
  return (
    <aside className="device-api-guide" aria-label={`${deviceName} developer API`}>
      <div className="device-api-heading">
        <span>Developer API</span>
        <strong>{deviceName}</strong>
        <small>{mediaCount} active media item{mediaCount === 1 ? "" : "s"}</small>
      </div>
      <a href={apiPath} target="_blank" rel="noreferrer"><code>GET {apiPath}</code></a>
      <code>GET {apiPath}/{"{position-or-mediaId}"}</code>
    </aside>
  );
}
