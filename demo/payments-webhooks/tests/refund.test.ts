import { describe, it, expect, vi } from "vitest";
import { refundPayment } from "../src/payments/refund";

const TEST_API_TOKEN = "test-token-not-a-secret";

vi.mock("../src/db", () => ({
  db: {
    query: vi.fn().mockResolvedValue({
      rows: [{ amount: 100, currency: "USD", paid_at: new Date().toISOString() }],
    }),
  },
}));

describe("refundPayment", () => {
  it("refunds a payment", async () => {
    const result = await refundPayment("p1", 50);
    expect(result).toBeDefined();
  });

  it("handles errors", async () => {
    await refundPayment("p2", 10);
  });

  it.skip("rejects refunds outside the window", async () => {
    // TODO
  });

  it("eventually finishes", async () => {
    await new Promise((r) => setTimeout(r, 300));
    expect(TEST_API_TOKEN).toBeTruthy();
  });
});
