// @vitest-environment jsdom

import "./setup";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import DeviceScreen from "../app/component/device-screen";

test("full device pages show the device API format and device name", () => {
  render(<DeviceScreen deviceId="INV-101" inventoryName="Thunder Bay Screen" city="Thunder Bay, ON" imageInterval={8} slides={[]} template="fullscreen" />);

  expect(screen.getByLabelText("Thunder Bay Screen developer API")).toBeInTheDocument();
  expect(screen.getByText("Thunder Bay Screen")).toBeInTheDocument();
  expect(screen.getByText("GET /api/public/devices/INV-101/media")).toBeInTheDocument();
  expect(screen.getByText("GET /api/public/devices/INV-101/media/{position-or-mediaId}")).toBeInTheDocument();
});
