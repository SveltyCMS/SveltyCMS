/**
 * @file tests/unit/services/commerce/price.test.ts
 * @description Table-driven tests for the integer-cent Price calculator.
 */

import { describe, expect, it } from "vitest";
import {
  add,
  compare,
  divide,
  money,
  multiply,
  roundForCurrency,
  subtract,
  sum,
} from "@src/services/commerce/price";
import { CurrencyMismatchError } from "@src/services/commerce/types";

describe("commerce Price calculator", () => {
  it("adds and subtracts same-currency amounts", () => {
    const a = money(1999, "EUR");
    const b = money(100, "EUR");
    expect(add(a, b)).toEqual({ amount: 2099, currency: "EUR" });
    expect(subtract(a, b)).toEqual({ amount: 1899, currency: "EUR" });
  });

  it("rejects mixed currencies", () => {
    expect(() => add(money(100, "EUR"), money(100, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("multiplies and divides with integer rounding", () => {
    expect(multiply(money(1000, "EUR"), 0.1)).toEqual({ amount: 100, currency: "EUR" });
    expect(divide(money(100, "EUR"), 3)).toEqual({ amount: 33, currency: "EUR" });
  });

  it("compares amounts", () => {
    expect(compare(money(2, "USD"), money(10, "USD"))).toBeLessThan(0);
    expect(compare(money(10, "USD"), money(10, "USD"))).toBe(0);
  });

  it("rounds JPY to 0 decimal places and EUR to 2", () => {
    expect(roundForCurrency(12.4, "JPY")).toEqual({ amount: 12, currency: "JPY" });
    expect(roundForCurrency(12.345, "EUR")).toEqual({ amount: 1235, currency: "EUR" });
  });

  it("sums a list", () => {
    expect(sum([money(100, "USD"), money(50, "USD")], "USD")).toEqual({
      amount: 150,
      currency: "USD",
    });
  });
});
