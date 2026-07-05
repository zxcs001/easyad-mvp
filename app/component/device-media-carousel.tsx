"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Fade from "embla-carousel-fade";

export type DeviceMediaSlide = {
  id: string;
  title: string;
  subtitle: string;
  mediaType: "image" | "video";
  publicUrl: string;
  createdAt: string;
};

const defaultImageInterval = 6;
const minImageInterval = 2;
const maxImageInterval = 60;

export default function DeviceMediaCarousel({ inventoryName, imageInterval, slides }: { inventoryName: string; imageInterval: number; slides: DeviceMediaSlide[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: slides.length > 1, align: "start" }, [Fade()]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const effectiveImageInterval = clampInterval(imageInterval);

  const selectCurrent = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    selectCurrent();
    emblaApi.on("select", selectCurrent);
    emblaApi.on("reInit", selectCurrent);
    return () => {
      emblaApi.off("select", selectCurrent);
      emblaApi.off("reInit", selectCurrent);
    };
  }, [emblaApi, selectCurrent]);

  useEffect(() => {
    if (!emblaApi || slides.length <= 1) return;
    const current = slides[selectedIndex];
    if (!current || current.mediaType === "video") return;
    const timer = window.setTimeout(() => emblaApi.scrollNext(), effectiveImageInterval * 1000);
    return () => window.clearTimeout(timer);
  }, [emblaApi, effectiveImageInterval, selectedIndex, slides]);

  if (!slides.length) {
    return (
      <div className="media-stage empty" aria-label={`${inventoryName} advertising media`}>
        <p>No images or videos have been uploaded for this device yet.</p>
      </div>
    );
  }

  return (
    <div className="media-stage" aria-label={`${inventoryName} advertising media`}>
      <div className="device-carousel" ref={emblaRef}>
        <div className="device-carousel-track">
          {slides.map((slide) => (
            <section className="device-carousel-slide" key={slide.id}>
              {slide.mediaType === "video" ? (
                <video src={slide.publicUrl} autoPlay muted playsInline onEnded={scrollNext} />
              ) : (
                <img src={slide.publicUrl} alt="" />
              )}
            </section>
          ))}
        </div>
      </div>

      <button type="button" className="device-nav prev" onClick={scrollPrev} aria-label="Previous media">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button type="button" className="device-nav next" onClick={scrollNext} aria-label="Next media">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}

function clampInterval(value: number) {
  if (!Number.isFinite(value)) return defaultImageInterval;
  return Math.min(maxImageInterval, Math.max(minImageInterval, Math.round(value)));
}
