import type { MembershipRole, Role } from "../data";

export const capabilityNames = [
  "organization.members.manage",
  "clients.manage",
  "media_plans.create",
  "creative.write",
  "creative.client_approve",
  "creative.operator_approve",
  "fulfillment.manage",
  "commercial.view",
  "inventory.manage",
] as const;

export type Capability = (typeof capabilityNames)[number];

const membershipCapabilities: Record<MembershipRole, readonly Capability[]> = {
  owner: capabilityNames,
  admin: capabilityNames,
  planner: ["media_plans.create", "creative.write", "commercial.view"],
  account_manager: ["clients.manage", "media_plans.create", "creative.write", "commercial.view"],
  designer: ["creative.write"],
  reviewer: ["creative.client_approve"],
  operations: ["creative.operator_approve", "fulfillment.manage", "inventory.manage", "commercial.view"],
  finance: ["commercial.view"],
  viewer: [],
};

const legacyCapabilities: Record<Role, readonly Capability[]> = {
  admin: capabilityNames,
  advertiser: ["media_plans.create", "creative.write", "creative.client_approve", "commercial.view"],
  institutional: ["organization.members.manage", "creative.operator_approve", "fulfillment.manage", "inventory.manage", "commercial.view"],
  operator: ["creative.operator_approve", "fulfillment.manage", "inventory.manage", "commercial.view"],
};

export function hasCapability(capability: Capability, input: { membershipRole?: MembershipRole | null; legacyRole?: Role | null }) {
  if (input.membershipRole && membershipCapabilities[input.membershipRole].includes(capability)) return true;
  return Boolean(input.legacyRole && legacyCapabilities[input.legacyRole].includes(capability));
}

export function capabilitiesFor(input: { membershipRole?: MembershipRole | null; legacyRole?: Role | null }) {
  return capabilityNames.filter((capability) => hasCapability(capability, input));
}
