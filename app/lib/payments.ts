import { randomBytes } from "node:crypto";

export type ChargeResult = {
  ok: boolean;
  gatewayRef: string;
  method: string;
  processedAt: string;
  declineReason?: string;
};

// Mock secure payment gateway. A production integration would call out to a
// provider (Stripe, Adyen, ...) and verify the authorization webhook. Here we
// simulate an authorization so the billing flow is exercised end to end with a
// persisted gateway reference.
export function processCharge({ amount, method = "card" }: { amount: number; method?: string }): ChargeResult {
  const processedAt = new Date().toISOString();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, gatewayRef: "", method, processedAt, declineReason: "Invalid amount" };
  }
  return {
    ok: true,
    gatewayRef: `ch_${randomBytes(10).toString("hex")}`,
    method,
    processedAt,
  };
}

export function processRefund({ gatewayRef }: { gatewayRef: string | null }): ChargeResult {
  const processedAt = new Date().toISOString();
  return {
    ok: true,
    gatewayRef: gatewayRef ? `re_${gatewayRef.replace(/^ch_/, "")}` : `re_${randomBytes(10).toString("hex")}`,
    method: "refund",
    processedAt,
  };
}
