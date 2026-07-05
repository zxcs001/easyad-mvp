import type { DisplayTemplate } from "../data";

export type DeviceTemplate = DisplayTemplate;

export const deviceTemplates: { id: DeviceTemplate; label: string; description: string }[] = [
  { id: "fullscreen", label: "Full screen", description: "Edge-to-edge advertising media only." },
  { id: "weather", label: "Weather", description: "Local forecast panel beside the media." },
  { id: "public-info", label: "Public information", description: "Civic notices plus reserved local-government space." },
  { id: "transit", label: "Bus stops", description: "Live transit departures beside the media." },
  { id: "community", label: "Community board", description: "Weather bar, media, and a transit ticker." },
];

const templateIds = new Set<DeviceTemplate>(deviceTemplates.map((template) => template.id));

export function isDeviceTemplate(value: unknown): value is DeviceTemplate {
  return typeof value === "string" && templateIds.has(value as DeviceTemplate);
}

// Resolve which template a device screen should render. An explicit query
// parameter wins (useful for previewing); otherwise the template configured on
// the device record is used, defaulting to a plain full-screen media player.
export function resolveDeviceTemplate(param: string | undefined, configured?: DisplayTemplate): DeviceTemplate {
  if (isDeviceTemplate(param)) return param;
  if (isDeviceTemplate(configured)) return configured;
  return "fullscreen";
}
