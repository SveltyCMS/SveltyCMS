/**
 * @file src/services/commerce/condition-plugin.ts
 * @description
 * Condition engine and rule evaluation for commerce promotions, tiered discounts,
 * minimum order cart values, and BOGO/bundle adjustments.
 *
 * ### Features:
 * - Subtotal threshold rules (minOrderAmount)
 * - Coupon code and cart line quantity checks
 * - Percentage and fixed minor-unit discount computation
 * - Pure computation pipeline (zero I/O, deterministic)
 */

import { money } from "./price";
import type { Adjustment, Price } from "./types";

export type PromotionRuleType = "min_subtotal" | "coupon" | "line_quantity" | "tiered_percentage";

export interface PromotionCondition {
  type: PromotionRuleType;
  /** Minimum minor units required (e.g. 5000 = $50.00). */
  minAmount?: number;
  /** Required coupon code. */
  couponCode?: string;
  /** Minimum line items count in cart. */
  minQuantity?: number;
}

export interface PromotionRule {
  id: string;
  name: string;
  conditions: PromotionCondition[];
  /** Discount mode: "percentage" (e.g. 15 = 15%) or "fixed" minor-unit discount. */
  discountType: "percentage" | "fixed";
  discountValue: number;
  /** Sorting order when applying adjustments. */
  weight?: number;
}

export interface CartEvaluationContext {
  subtotal: Price;
  totalQuantity: number;
  couponCodes?: string[];
}

/**
 * Evaluates whether a cart meets all conditions of a promotion rule.
 */
export function evaluatePromotionConditions(
  rule: PromotionRule,
  context: CartEvaluationContext,
): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return true;

  for (let i = 0; i < rule.conditions.length; i++) {
    const cond = rule.conditions[i]!;
    switch (cond.type) {
      case "min_subtotal":
        if (cond.minAmount !== undefined && context.subtotal.amount < cond.minAmount) {
          return false;
        }
        break;
      case "coupon":
        if (
          cond.couponCode &&
          (!context.couponCodes ||
            !context.couponCodes.some(
              (c) => c.toLowerCase() === cond.couponCode!.toLowerCase(),
            ))
        ) {
          return false;
        }
        break;
      case "line_quantity":
        if (cond.minQuantity !== undefined && context.totalQuantity < cond.minQuantity) {
          return false;
        }
        break;
      default:
        break;
    }
  }
  return true;
}

/**
 * Computes the resulting negative adjustment for an applicable promotion rule.
 */
export function applyPromotionRule(
  rule: PromotionRule,
  context: CartEvaluationContext,
): Adjustment | null {
  if (!evaluatePromotionConditions(rule, context)) return null;

  let discountAmount = 0;
  if (rule.discountType === "percentage") {
    // Percentage: rule.discountValue / 100 * subtotal
    discountAmount = Math.round((context.subtotal.amount * rule.discountValue) / 100);
  } else {
    // Fixed minor units
    discountAmount = Math.min(rule.discountValue, context.subtotal.amount);
  }

  if (discountAmount <= 0) return null;

  return {
    type: "promotion",
    label: rule.name,
    weight: rule.weight ?? 10,
    amount: money(-discountAmount, context.subtotal.currency),
  };
}
