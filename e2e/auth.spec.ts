import { expect, test } from "@playwright/test";
import { countUsers, createInventory, getDb, getInventory } from "../app/lib/db";
import { hashPassword } from "../app/lib/password";
import type { InventoryItem, Role } from "../app/data";

if (process.env.TEST_DATABASE_URL) {
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
    id: "USR-E2E-INSTITUTION",
    name: "E2E Civic Institution",
    email: "e2e.institution@ooh.local",
    password: "E2EInstitution!2026",
    role: "institutional",
    expectedText: "e2e.institution@ooh.local - Institution account",
  },
  {
    id: "USR-E2E-OPERATOR",
    name: "E2E Operator",
    email: "e2e.operator@ooh.local",
    password: "E2EOperator!2026",
    role: "operator",
    expectedText: "e2e.operator@ooh.local - Operator",
  },
  {
    id: "USR-E2E-ADVERTISER",
    name: "E2E Advertiser",
    email: "e2e.advertiser@ooh.local",
    password: "E2EAdvertiser!2026",
    role: "advertiser",
    expectedText: "E2E Advertiser - Advertiser",
  },
];

test.beforeEach(async ({ page }) => {
  // Keep map interaction checks independent of external tile-service availability.
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }));
});

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

  const institution = accounts.find((account) => account.role === "institutional")!;
  if (!await getInventory("INV-E2E-CIVIC")) {
    const screen: InventoryItem = {
      id: "INV-E2E-CIVIC",
      name: "E2E City Hall Screen",
      operator: institution.name,
      format: "digital",
      x: 50,
      y: 50,
      address: "100 Main Street, Thunder Bay, ON",
      price: 0,
      impressions: 10000,
      traffic: 8000,
      income: 70000,
      audience: "Residents",
      competitor: "Low",
      occupancy: 20,
      imageInterval: 8,
      maxLoopSeconds: 120,
      availableFrom: "2026-01-01",
      availableTo: "2099-12-31",
      approvalStatus: "approved",
      displayTemplate: "fullscreen",
    };
    await createInventory(screen, institution.id, institution.id);
  }
});

test("public portal is available without login", async ({ page }) => {
  await page.goto("/?view=portal");
  await page.getByRole("button", { name: "Start my campaign" }).click();

  await expect(page.getByRole("heading", { name: "Outdoor Campaign Buying Portal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Launch Campaign" })).toHaveAttribute("href", /\/login\?returnTo=/);
});

test("portal map shows only available devices and keeps pins anchored while zooming", async ({ page }) => {
  await page.goto("/?view=portal");
  await page.getByRole("button", { name: "Start my campaign" }).click();

  await expect(page.locator(".map-fallback")).toHaveCount(0);
  await expect(page.locator(".maplibre-device-marker:visible").first()).toBeVisible();
  const devicePin = page.locator(".maplibre-device-marker:visible").first();
  const deviceBox = await devicePin.boundingBox();
  expect(deviceBox?.width).toBeLessThanOrEqual(34);
  expect(deviceBox?.height).toBeLessThanOrEqual(40);
  await expect(devicePin).toHaveAttribute("style", /color: var\(--workspace-muted\)/);
  await expect(devicePin.locator("svg")).toHaveAttribute("viewBox", "0 0 34 40");
  await expect(devicePin.locator(".fallback-pin-glyph")).toHaveCount(0);
  await expect(page.locator(".maplibre-device-marker.selected")).toHaveCount(0);
  await expect(page.locator(".maplibre-business")).toHaveCount(0);
  await expect(page.locator(".maplibre-center")).toHaveCount(0);
  await expect(page.getByText("Available device", { exact: true })).toBeVisible();
  await expect(page.getByText("Selected device", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Nearby business", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Audience match", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Creative status", { exact: true })).toHaveCount(0);
  const zoomOut = page.locator("button.maplibregl-ctrl-zoom-out");
  await zoomOut.click();
  await zoomOut.click();
  await zoomOut.click();

  await expect(page.getByRole("status").filter({ hasText: "Choose a city or zoom in to view devices" })).toBeVisible();
  await expect(page.locator(".maplibre-device-marker:visible")).toHaveCount(0);

  const zoomIn = page.locator("button.maplibregl-ctrl-zoom-in");
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();
  await expect(page.locator(".maplibre-device-marker:visible").first()).toBeVisible();

  const deviceLabel = await devicePin.getAttribute("aria-label");
  const deviceName = deviceLabel?.split(",")[0] ?? "";
  await page.getByRole("textbox", { name: "Map search" }).fill(deviceName);
  await page.locator(".map-search-results button").filter({ hasText: deviceName }).click();

  const anchorDelta = async () => {
    const mapBox = await page.locator(".maplibre-map").boundingBox();
    const nativeTip = await devicePin.locator("svg").evaluate((element) => {
      const svg = element as SVGSVGElement;
      const point = svg.createSVGPoint();
      point.x = 17;
      point.y = 38.5;
      const transformed = point.matrixTransform(svg.getScreenCTM() ?? new DOMMatrix());
      return { x: transformed.x, y: transformed.y };
    });
    if (!mapBox) return Number.POSITIVE_INFINITY;
    return Math.max(
      Math.abs(nativeTip.x - (mapBox.x + mapBox.width / 2)),
      Math.abs(nativeTip.y - (mapBox.y + mapBox.height / 2)),
    );
  };

  await expect.poll(anchorDelta).toBeLessThanOrEqual(2);
  await zoomIn.click();
  await expect.poll(anchorDelta).toBeLessThanOrEqual(2);
});

test("protected campaign page redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/?role=advertiser&view=discover");

  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("government dashboard redirects to its dedicated sign-in", async ({ page }) => {
  await page.goto("/government");

  await expect(page).toHaveURL(/\/government\/login\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Sign in to Civic Screen Operations" })).toBeVisible();
  await expect(page.getByText("Your public screen network, in one command centre.")).toBeVisible();
});

test("government route remains protected when a public marketplace view is requested", async ({ page }) => {
  await page.goto("/government?view=portal");

  await expect(page).toHaveURL(/\/government\/login\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Sign in to Civic Screen Operations" })).toBeVisible();
});

for (const account of accounts) {
  test(`login works for ${account.role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    if (account.role === "institutional") {
      await expect(page).toHaveURL(/\/government/);
      await expect(page.getByRole("heading", { name: "Screen network command centre" })).toBeVisible();
      await expect(page.getByText("Civic Screen Operations").first()).toBeVisible();
      await expect(page.getByText(account.expectedText)).toBeVisible();
    } else if (account.role === "operator") {
      await expect(page).toHaveURL(/role=operator&view=inventory/);
      await expect(page.getByRole("heading", { name: "Inventory management" })).toBeVisible();
      await expect(page.getByText(account.expectedText)).toBeVisible();
    } else {
      await expect(page).toHaveURL(/view=portal/);
      await expect(page.locator("body")).toHaveClass(/starter-active/);
      await page.getByRole("button", { name: "Start my campaign" }).click();
      await expect(page.getByText(account.expectedText)).toBeVisible();
    }
  });
}

test("institution staff can reach screen control from the in-page landing entry", async ({ page }) => {
  const institution = accounts.find((account) => account.role === "institutional")!;
  await page.goto("/");
  await page.getByRole("button", { name: "Start my campaign" }).click();
  await page.getByRole("link", { name: "View workspace details" }).click();
  await expect(page).toHaveURL(/\/government\/about/);
  await expect(page.getByRole("heading", { name: "Public screens, under your authority." })).toBeVisible();
  await expect(page.getByText("Representative content preview — not a live camera feed.")).toBeVisible();
  await page.getByRole("link", { name: "Continue to secure sign in" }).first().click();
  await expect(page).toHaveURL(/\/government\/login\?returnTo=/);
  await page.getByLabel("Work email").fill(institution.email);
  await page.getByLabel("Password", { exact: true }).fill(institution.password);
  await page.getByRole("button", { name: "Enter government workspace" }).click();

  await expect(page).toHaveURL(/\/government/);
  await expect(page.getByRole("heading", { name: "Screen network command centre" })).toBeVisible();
  await expect(page.getByText("Content preview, not a live camera feed")).toBeVisible();
  await expect(page.getByLabel("E2E City Hall Screen display preview")).toBeVisible();
  await page.getByRole("button", { name: "Publish content" }).click();
  await expect(page.getByRole("dialog", { name: "Publish screen content" })).toBeVisible();
  await expect(page.getByText("No approval required")).toBeVisible();
  await expect(page.getByText("This content joins the live screen rotation after upload completes.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("link", { name: "Open EasyAD Platform" }).click();
  const starter = page.getByRole("button", { name: "Start my campaign" });
  if (await starter.isVisible()) await starter.click();
  const topNavigation = page.locator("header.portal-nav");
  await expect(topNavigation.getByRole("link", { name: /institution|public screen/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View workspace details" })).toBeVisible();
  await page.getByRole("link", { name: "View workspace details" }).click();
  await expect(page).toHaveURL(/\/government\/about/);
  await page.getByRole("link", { name: "Open your dashboard" }).first().click();

  await page.getByRole("button", { name: "Create emergency override" }).click();
  await expect(page.getByRole("dialog", { name: "Create emergency screen override" })).toBeVisible();
  await expect(page.getByText("Screen delivery only.")).toBeVisible();
});

test("Super Admin can enter the dedicated government dashboard", async ({ page }) => {
  const admin = accounts.find((account) => account.role === "admin")!;
  await page.goto("/government/login");
  await page.getByLabel("Work email").fill(admin.email);
  await page.getByLabel("Password", { exact: true }).fill(admin.password);
  await page.getByRole("button", { name: "Enter government workspace" }).click();

  await expect(page).toHaveURL(/\/government/);
  await expect(page.getByRole("heading", { name: "Screen network command centre" })).toBeVisible();
  await expect(page.getByText("Cross-institution oversight")).toBeVisible();
  await expect(page.getByText("All institution fleets")).toBeVisible();
});
