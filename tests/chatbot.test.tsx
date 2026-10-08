/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

vi.mock("../app/component/toast", () => ({
  toast: { error: vi.fn() },
}));

import Chatbot from "../app/component/chatbot";

describe("site assistant visibility", () => {
  beforeEach(() => {
    route.pathname = "/";
  });

  test.each(["/devices/INV-101", "/inventory/INV-101"])("does not render on public device route %s", (pathname) => {
    route.pathname = pathname;

    render(<Chatbot />);

    expect(screen.queryByRole("button", { name: "Open assistant" })).not.toBeInTheDocument();
  });

  test.each(["/government", "/government/about", "/government/login"])("does not render in the institution workspace %s", (pathname) => {
    route.pathname = pathname;

    render(<Chatbot />);

    expect(screen.queryByRole("button", { name: "Open assistant" })).not.toBeInTheDocument();
  });

  test("remains available on marketplace routes", () => {
    route.pathname = "/login";

    render(<Chatbot />);

    expect(screen.getByRole("button", { name: "Open assistant" })).toBeInTheDocument();
  });
});
