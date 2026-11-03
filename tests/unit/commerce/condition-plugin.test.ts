/**
 * @file tests/unit/commerce/condition-plugin.test.ts
 * @description Unit tests for promotion rules and condition plugin evaluation.
 */

import { describe, expect, it } from "vitest";
import {
  applyPromotionRule,
  evaluatePromotionConditions,
  type PromotionRule,
} from "@src/services/commerce/condition-plugin";
import { money } from "@src/services/commerce/price";

describe("commerce condition plugin", () => {
  const minFiftyRule: PromotionRule = {
    id: "promo-1",
    name: "$10 off over $50",
    discountType: "fixed",
    discountValue: 1000,
    conditions: [
      {
        type: "min_subtotal",
        minAmount: 5000,
      },
    ],
  };

  const couponRule: PromotionRule = {
    id: "promo-2",
    name: "20% with SAVE20",
    discountType: "percentage",
    discountValue: 20,
    conditions: [
      {
        type: "coupon",
        couponCode: "SAVE20",
      },
    ],
  };

  it("evaluates min_subtotal condition", () => {
    expect(
      evaluatePromotionConditions(minFiftyRule, {
        subtotal: money(4000, "USD"),
        totalQuantity: 2,
      }),
    ).toBe(false);

    expect(
      evaluatePromotionConditions(minFiftyRule, {
        subtotal: money(5000, "USD"),
        totalQuantity: 2,
      }),
    ).toBe(true);
  });

  it("applies fixed discount when eligible", () => {
    const adj = applyPromotionRule(minFiftyRule, {
      subtotal: money(6000, "USD"),
      totalQuantity: 3,
    });
    expect(adj).not.toBeNull();
    expect(adj?.amount.amount).toBe(-1000);
    expect(adj?.type).toBe("promotion");
  });

  it("applies percentage discount with coupon", () => {
    const adj = applyPromotionRule(couponRule, {
      subtotal: money(10000, "USD"),
      totalQuantity: 1,
      couponCodes: ["save20"],
    });
    expect(adj).not.toBeNull();
    expect(adj?.amount.amount).toBe(-2000);
  });

  it("rejects coupon rule without matching code", () => {
    const adj = applyPromotionRule(couponRule, {
      subtotal: money(10000, "USD"),
      totalQuantity: 1,
      couponCodes: ["OTHERCODE"],
    });
    expect(adj).toBeNull();
  });
});
