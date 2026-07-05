"use client";

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
}: {
  inventoryName: string;
  city: string;
  imageInterval: number;
  slides: DeviceMediaSlide[];
  template: DeviceTemplate;
  preview?: boolean;
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
    </Root>
  );
}
