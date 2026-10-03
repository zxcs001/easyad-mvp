import * as assert from "node:assert/strict";
import { test } from "vitest";
import { detectLocaleFromGeo, normalizeLocale } from "../app/i18n/config";
import { translate } from "../app/i18n/messages";

test("normalizes supported regional locale tags", () => {
  assert.equal(normalizeLocale("fr-CA"), "fr");
  assert.equal(normalizeLocale("en_US"), "en");
  assert.equal(normalizeLocale("es"), "en");
});

test("uses French only for a Quebec region signal", () => {
  assert.equal(detectLocaleFromGeo(new Headers({
    "x-vercel-ip-country": "CA",
    "x-vercel-ip-country-region": "QC",
  })), "fr");
  assert.equal(detectLocaleFromGeo(new Headers({
    "x-vercel-ip-country": "CA",
    "x-vercel-ip-country-region": "ON",
  })), "en");
  assert.equal(detectLocaleFromGeo(new Headers({
    "x-vercel-ip-country": "US",
    "x-vercel-ip-country-region": "QC",
  })), "en");
});

test("translates exact and variable French messages with English fallback", () => {
  assert.equal(translate("fr", "Select language"), "Choisir la langue");
  assert.equal(translate("fr", "{count} slots", { count: 4 }), "4 emplacements");
  assert.equal(translate("fr", "Custom user content"), "Custom user content");
  assert.equal(translate("en", "Select language"), "Select language");
});
