export const featureFlagNames = [
  "campaign_model_v2",
  "agency_workspace",
  "static_fulfillment",
  "payments",
] as const;

export type FeatureFlagName = (typeof featureFlagNames)[number];
export type FeatureFlags = Record<FeatureFlagName, boolean>;

const environmentKeys: Record<FeatureFlagName, string> = {
  campaign_model_v2: "FEATURE_CAMPAIGN_MODEL_V2",
  agency_workspace: "FEATURE_AGENCY_WORKSPACE",
  static_fulfillment: "FEATURE_STATIC_FULFILLMENT",
  payments: "FEATURE_PAYMENTS",
};

/**
 * Flags are deliberately opt-in. Only the exact value "true" enables a flag;
 * missing, malformed, and differently-cased values remain off.
 */
export function getFeatureFlags(environment: Record<string, string | undefined> = process.env): FeatureFlags {
  return Object.fromEntries(
    featureFlagNames.map((name) => [name, environment[environmentKeys[name]] === "true"]),
  ) as FeatureFlags;
}

export function isFeatureEnabled(name: FeatureFlagName, environment: Record<string, string | undefined> = process.env) {
  return getFeatureFlags(environment)[name];
}
