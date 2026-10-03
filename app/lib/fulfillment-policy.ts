// Shared UI/server transition vocabulary. The database remains authoritative.
export const productionTransitions: Record<string, string[]> = {
  not_ready: ["ready"], ready: ["in_production"], in_production: ["printed", "reprint_required"],
  printed: ["shipped", "reprint_required"], shipped: ["delivered", "reprint_required"],
  delivered: ["reprint_required"], reprint_required: ["in_production"],
};
export function workOrderTransition(status: string, workType: string, action: string): string | null {
  if (["installed", "removed", "cancelled"].includes(status)) return null;
  if (action === "remove") return workType === "removal" && ["scheduled", "in_progress"].includes(status) ? "removed" : null;
  if (["schedule", "reschedule"].includes(action)) return ["ready", "scheduled", "blocked", "in_progress"].includes(status) ? "scheduled" : null;
  if (action === "start") return ["ready", "scheduled"].includes(status) ? "in_progress" : null;
  return ["weather_delay", "access_blocked", "damaged_material", "partial_completion", "reprint_required"].includes(action) && status !== "not_ready" ? "blocked" : null;
}
