import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import sharp from "sharp";
const auth = vi.hoisted(() => ({ user: { role: "advertiser" } as { role: string } | null }));
vi.mock("../app/lib/auth", () => ({ getCurrentUser: async () => auth.user, canBuyAds: (user: { role: string } | null) => user?.role === "advertiser" || user?.role === "admin" }));
import { POST } from "../app/api/creative/logo/route";
import { validateDesignLogo } from "../app/lib/creative-design-assets";
beforeEach(() => { auth.user = { role: "advertiser" }; });
function request(file: File) { const body = new FormData(); body.set("file", file); return new NextRequest("http://localhost/api/creative/logo", { method: "POST", body }); }
test.each([null, { role: "institution" }])("requires an advertiser or administrator", async user => {
  auth.user = user;
  expect((await POST(request(new File(["png"], "logo.png", { type: "image/png" })))).status).toBe(403);
});
test("resizes a real logo into a self-contained PNG without metadata", async () => {
  const bytes = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#1456A0" } }).jpeg().toBuffer();
  const response = await POST(request(new File([new Uint8Array(bytes)], "logo.jpg", { type: "image/jpeg" })));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const { logoDataUrl } = await response.json();
  await expect(validateDesignLogo(logoDataUrl)).resolves.toBeUndefined();
  const metadata = await sharp(Buffer.from(logoDataUrl.split(",")[1], "base64")).metadata();
  expect(metadata).toMatchObject({ width: 512, height: 320, format: "png" });
  expect(metadata.exif).toBeUndefined();
});
test("rejects disguised images, truncated images, SVG, and oversized files", async () => {
  for (const file of [
    new File(["fake"], "logo.png", { type: "image/png" }),
    new File([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])], "logo.png", { type: "image/png" }),
    new File(["<svg></svg>"], "logo.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], "logo.jpg", { type: "image/jpeg" }),
  ]) expect((await POST(request(file))).status).toBe(422);
});
