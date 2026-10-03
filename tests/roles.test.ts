import * as assert from "node:assert/strict";
import { test } from "vitest";
import { canAccessInstitutionWorkspace, roleLabel, roleWorkspaceView } from "../app/roles";

test("Institution accounts and Super Admin can access Screen control", () => {
  assert.equal(canAccessInstitutionWorkspace("institutional"), true);
  assert.equal(canAccessInstitutionWorkspace("admin"), true);
  assert.equal(canAccessInstitutionWorkspace("operator"), false);
  assert.equal(canAccessInstitutionWorkspace("advertiser"), false);
});

test("the persisted institutional role has the Institution account label and workspace", () => {
  assert.equal(roleLabel("institutional"), "Institution account");
  assert.equal(roleWorkspaceView.institutional, "network");
});
