import * as assert from "node:assert/strict";
import { test } from "vitest";
import { INTRO_COOKIE_MAX_AGE, INTRO_COOKIE_NAME, shouldShowStarter } from "../app/lib/preferences";

test("starter appears only for the portal without an opt-out cookie", () => {
  assert.equal(shouldShowStarter("portal"), true);
  assert.equal(shouldShowStarter("portal", "0"), true);
  assert.equal(shouldShowStarter("portal", "1"), false);
  assert.equal(shouldShowStarter("discover"), false);
});

test("intro preference uses a stable one-year cookie contract", () => {
  assert.equal(INTRO_COOKIE_NAME, "ooh_intro_dismissed");
  assert.equal(INTRO_COOKIE_MAX_AGE, 31_536_000);
});
