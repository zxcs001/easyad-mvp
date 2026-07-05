import { expect, test } from "@playwright/test";
import { countUsers, getDb } from "../app/lib/db";
import { hashPassword } from "../app/lib/password";
import type { Role } from "../app/data";

if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const accounts: { id: string; name: string; email: string; password: string; role: Role; expectedText: string }[] = [
  {
    id: "USR-E2E-ADMIN",
    name: "E2E Super Admin",
    email: "e2e.admin@ooh.local",
    password: "E2EAdmin!2026",
    role: "admin",
    expectedText: "E2E Super Admin - Super Admin",
  },
  {
    id: "USR-E2E-OPERATOR",
    name: "E2E Operator",
    email: "e2e.operator@ooh.local",
    password: "E2EOperator!2026",
    role: "operator",
    expectedText: "E2E Operator - operator",
  },
  {
    id: "USR-E2E-ADVERTISER",
    name: "E2E Advertiser",
    email: "e2e.advertiser@ooh.local",
    password: "E2EAdvertiser!2026",
    role: "advertiser",
    expectedText: "E2E Advertiser - advertiser",
  },
];

test.beforeAll(async () => {
  const now = new Date().toISOString();
  await countUsers();
  const db = getDb();

  for (const account of accounts) {
    await db.query(`
      INSERT INTO users (id, name, email, password_hash, role, status, institution_id, operator_limit, created_at)
      VALUES ($1, $2, $3, $4, $5, 'active', NULL, 0, $6)
      ON CONFLICT(email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        status = 'active'
    `, [account.id, account.name, account.email, hashPassword(account.password), account.role, now]);
  }
});

test("public portal is available without login", async ({ page }) => {
  await page.goto("/?view=portal");

  await expect(page.getByRole("heading", { name: "Outdoor Campaign Buying Portal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Launch Campaign" })).toHaveAttribute("href", /\/login\?returnTo=/);
});

test("protected campaign page redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/?role=advertiser&view=discover");

  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

for (const account of accounts) {
  test(`login works for ${account.role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(account.expectedText)).toBeVisible();
  });
}
