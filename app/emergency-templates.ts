import type { DeviceAlertType } from "./data";

export type EmergencyTemplate = {
  id: string; name: string; description: string; alertType: DeviceAlertType;
  headline: string; instructions: string;
};

// Draft outlines, not issued alerts. Prompts must be replaced with verified
// details and agency-approved instructions before publication.
export const emergencyTemplates: EmergencyTemplate[] = [
  { id: "missing-person", name: "Missing person", description: "Photo, description, last seen, and contact.", alertType: "public-safety", headline: "Missing person: {{Name}}", instructions: "{{Name}}, age {{Age}}, was last seen at {{Last seen location and time}}. Description: {{Appearance and clothing}}. If you have information: {{Authorized contact instructions}}." },
  { id: "amber", name: "AMBER Alert", description: "An officially issued child-abduction alert.", alertType: "amber", headline: "AMBER Alert: {{Child's name}}", instructions: "{{Issuing agency}} has issued an AMBER Alert for {{Child's name and age}}. Last seen: {{Location and time}}. Description: {{Child, suspect, or vehicle details}}. {{Authorized reporting instructions}}" },
  { id: "weather", name: "Severe weather", description: "Hazard, affected time, and immediate action.", alertType: "weather", headline: "{{Weather hazard}} warning", instructions: "{{Weather hazard}} is expected in {{Affected area}} during {{Time window}}. {{Approved protective instructions}}. Updates: {{Official information source}}." },
  { id: "evacuation", name: "Evacuation", description: "Affected zone, route, and assembly point.", alertType: "evacuation", headline: "Evacuate {{Affected zone}}", instructions: "Evacuation notice for {{Affected zone}} due to {{Confirmed hazard}}. {{Approved evacuation instructions}}. Route or assembly point: {{Approved route or destination}}. Assistance: {{Official assistance contact}}." },
  { id: "shelter", name: "Shelter in place", description: "Who must shelter and where to get updates.", alertType: "public-safety", headline: "Shelter in place: {{Affected area}}", instructions: "A shelter-in-place notice is in effect for {{Affected area}} due to {{Confirmed hazard}}. {{Approved shelter instructions}}. Further updates: {{Official information source}}." },
  { id: "closure", name: "Emergency closure", description: "Road, campus, or building access changes.", alertType: "public-safety", headline: "{{Road, building, or facility}} closed", instructions: "{{Road, building, or facility}} is closed due to {{Confirmed reason}} from {{Start time}}. {{Approved access or alternate-route instructions}}. Next update: {{Update time or official source}}." },
  { id: "water", name: "Water advisory", description: "Affected service area and approved guidance.", alertType: "public-safety", headline: "Water advisory: {{Service area}}", instructions: "{{Issuing authority}} has issued a {{Advisory type}} for {{Service area}}. {{Approved water-use instructions}}. Effective from {{Start time}}. Updates: {{Official information source}}." },
  { id: "all-clear", name: "All clear", description: "An ended incident and return instructions.", alertType: "public-safety", headline: "All clear: {{Incident or area}}", instructions: "{{Issuing authority}} has ended the {{Previous notice}} for {{Affected area}} as of {{Time}}. {{Approved return or reopening instructions}}. Further information: {{Official information source}}." },
];

export function emergencyPlaceholders(...values: string[]) {
  return Array.from(new Set(values.flatMap(value => {
    const prompts = Array.from(value.matchAll(/\{\{([^{}]+)\}\}/g), match => match[1].trim());
    if (/\{\{|\}\}/.test(value.replace(/\{\{[^{}]*\}\}/g, "")) || value.includes("{{}}")) prompts.push("Unfinished template prompt");
    return prompts;
  })));
}
