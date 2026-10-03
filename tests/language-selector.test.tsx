/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/", refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: navigation.refresh }),
}));

import { LanguageSelector, WebsiteLanguageSelector } from "../app/i18n/client";

beforeEach(() => {
  navigation.pathname = "/";
  navigation.refresh.mockClear();
});

test("the website language selector is absent from standalone device displays", () => {
  navigation.pathname = "/devices/INV-101";
  render(<WebsiteLanguageSelector />);

  expect(screen.queryByRole("button", { name: "Select language" })).not.toBeInTheDocument();
});

test("the website language selector remains available on inventory profiles", () => {
  navigation.pathname = "/inventory/INV-101";
  render(<WebsiteLanguageSelector />);

  expect(screen.getByRole("button", { name: "Select language" })).toBeInTheDocument();
});

test("language menu reveals every locale on hover", async () => {
  const user = userEvent.setup();
  render(<LanguageSelector placement="embedded" />);

  await user.hover(screen.getByRole("button", { name: "Select language" }));

  expect(screen.getByRole("menu", { name: "Language" })).toBeVisible();
  expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("menuitemradio", { name: "Français" })).toBeVisible();
});

test("language menu supports arrow navigation and Escape focus restoration", async () => {
  const user = userEvent.setup();
  render(<LanguageSelector placement="embedded" />);
  const trigger = screen.getByRole("button", { name: "Select language" });

  await user.click(trigger);
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveFocus();

  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitemradio", { name: "Français" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
