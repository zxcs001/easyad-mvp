/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import InstitutionTeamView from "../app/component/institution-team-view";
import type { DbUser } from "../app/lib/db";

const institution: DbUser = {
  id: "USR-INSTITUTION-1",
  name: "Civic Media Group",
  email: "ops@civic.example",
  role: "institutional",
  status: "active",
  institutionId: null,
  operatorLimit: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const operator: DbUser = {
  id: "USR-OPERATOR-1",
  name: "Device Operator",
  email: "operator@civic.example",
  role: "operator",
  status: "active",
  institutionId: institution.id,
  operatorLimit: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
};

test("institution team panel blocks new operators when all seats are used", () => {
  render(<InstitutionTeamView institution={institution} operators={[operator]} onCreateOperator={vi.fn()} onDeleteOperator={vi.fn()} />);

  expect(screen.getByText("1 of 1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Seat limit reached" })).toBeDisabled();
  expect(screen.getByText("Belongs to Civic Media Group")).toBeInTheDocument();
});
