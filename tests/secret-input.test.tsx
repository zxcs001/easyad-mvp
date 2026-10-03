/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import SecretInput from "../app/component/secret-input";

test("secret input reveals and remasks its value without clearing it", async () => {
  const user = userEvent.setup();
  render(<SecretInput label="Temporary password" name="password" secretName="temporary password" />);
  const input = screen.getByLabelText("Temporary password");

  await user.type(input, "LocalTest!2026");
  expect(input).toHaveAttribute("type", "password");

  await user.click(screen.getByRole("button", { name: "Show temporary password" }));
  expect(input).toHaveAttribute("type", "text");
  expect(input).toHaveValue("LocalTest!2026");

  await user.click(screen.getByRole("button", { name: "Hide temporary password" }));
  expect(input).toHaveAttribute("type", "password");
});
