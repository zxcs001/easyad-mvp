/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import DeviceApiGuide from "../app/component/device-api-guide";

test("the inventory API guide exposes the public media endpoints", () => {
  render(<DeviceApiGuide deviceId="INV-101" deviceName="Thunder Bay Screen" mediaCount={2} />);

  expect(screen.getByLabelText("Thunder Bay Screen developer API")).toBeInTheDocument();
  expect(screen.getByText("GET /api/public/devices/INV-101/media")).toBeInTheDocument();
  expect(screen.getByText("GET /api/public/devices/INV-101/media/{position-or-mediaId}")).toBeInTheDocument();
});
