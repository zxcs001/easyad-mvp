import * as assert from "node:assert/strict";
import { test } from "vitest";
import { getFeatureFlags, isFeatureEnabled } from "../app/lib/feature-flags";

test("all roadmap flags, including payments, default to off", () => {
  assert.deepEqual(getFeatureFlags({}), {
    campaign_model_v2: false,
    agency_workspace: false,
    static_fulfillment: false,
    payments: false,
  });
});

test("flags require an exact explicit true value", () => {
  const environment = {
    FEATURE_CAMPAIGN_MODEL_V2: "true",
    FEATURE_AGENCY_WORKSPACE: "TRUE",
    FEATURE_STATIC_FULFILLMENT: "1",
    FEATURE_PAYMENTS: "false",
  };

  assert.equal(isFeatureEnabled("campaign_model_v2", environment), true);
  assert.equal(isFeatureEnabled("agency_workspace", environment), false);
  assert.equal(isFeatureEnabled("static_fulfillment", environment), false);
  assert.equal(isFeatureEnabled("payments", environment), false);
});
