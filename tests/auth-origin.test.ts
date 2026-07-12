import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { test } from "vitest";
import { requestUrl } from "../app/lib/auth";

test("auth redirects preserve the browser-facing request host", () => {
  const request = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { host: "127.0.0.1:3000" },
  });

  assert.equal(requestUrl(request, "/login?error=invalid").href, "http://127.0.0.1:3000/login?error=invalid");
});
