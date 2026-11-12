import { describe, expect, it } from "vitest";
import { buildCouponBatch, validateCoupon } from "@/lib/domain";

const candidates = [
  { match_id: "m1", probability: 91 },
  { match_id: "m2", probability: 88 },
  { match_id: "m3", probability: 86 },
  { match_id: "m4", probability: 82 },
  { match_id: "m5", probability: 79 },
  { match_id: "m6", probability: 76 },
];

describe("single and AKO coupon generation", () => {
  it("creates one-match coupons without combining fixtures", () => {
    const batch = buildCouponBatch(candidates, 5, 1);
    expect(batch).toHaveLength(5);
    expect(batch.every((coupon) => coupon.length === 1)).toBe(true);
    expect(new Set(batch.flat().map((leg) => leg.match_id)).size).toBe(5);
  });

  it("keeps the existing three-match AKO behavior by default", () => {
    const batch = buildCouponBatch(candidates, 2);
    expect(batch).toHaveLength(2);
    expect(batch.every((coupon) => coupon.length === 3)).toBe(true);
  });

  it("validates a single as one leg and rejects a triple in single mode", () => {
    expect(validateCoupon([{ match_id: "m1", probability: 91 }], new Set(), 1)).toEqual([]);
    expect(validateCoupon(candidates.slice(0, 3), new Set(), 1)).toContain(
      "Kupon musi mieć dokładnie 1 zdarzenie.",
    );
  });
});
