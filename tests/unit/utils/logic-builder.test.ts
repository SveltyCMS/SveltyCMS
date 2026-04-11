import { describe, it, expect } from "vitest";

// Simulating the evaluation logic that would be in the service
function evaluateCondition(condition: any, data: any): boolean {
  if (!condition) return true;

  if (condition.logic) {
    if (condition.logic === "AND") {
      return condition.conditions.every((c: any) => evaluateCondition(c, data));
    }
    if (condition.logic === "OR") {
      return condition.conditions.some((c: any) => evaluateCondition(c, data));
    }
  }

  const { field, operator, value } = condition;
  const fieldValue = data[field];

  switch (operator) {
    case "eq":
      return fieldValue === value;
    case "neq":
      return fieldValue !== value;
    case "gt":
      return fieldValue > value;
    case "lt":
      return fieldValue < value;
    case "contains":
      return typeof fieldValue === "string" && fieldValue.includes(value);
    case "in":
      return Array.isArray(value) && value.includes(fieldValue);
    default:
      return true;
  }
}

describe("Visual Logic Builder Evaluator", () => {
  const mockData = {
    status: "published",
    price: 100,
    tags: ["new", "sale"],
    category: "electronics",
  };

  it("should evaluate simple equality", () => {
    const condition = { field: "status", operator: "eq", value: "published" };
    expect(evaluateCondition(condition, mockData)).toBe(true);
  });

  it("should evaluate numeric comparisons", () => {
    const condition = { field: "price", operator: "gt", value: 50 };
    expect(evaluateCondition(condition, mockData)).toBe(true);
  });

  it("should evaluate recursive AND groups", () => {
    const condition = {
      logic: "AND",
      conditions: [
        { field: "status", operator: "eq", value: "published" },
        { field: "price", operator: "gt", value: 50 },
      ],
    };
    expect(evaluateCondition(condition, mockData)).toBe(true);
  });

  it("should evaluate recursive OR groups", () => {
    const condition = {
      logic: "OR",
      conditions: [
        { field: "status", operator: "eq", value: "draft" },
        { field: "category", operator: "eq", value: "electronics" },
      ],
    };
    expect(evaluateCondition(condition, mockData)).toBe(true);
  });

  it("should handle complex nested logic", () => {
    const condition = {
      logic: "AND",
      conditions: [
        { field: "category", operator: "eq", value: "electronics" },
        {
          logic: "OR",
          conditions: [
            { field: "price", operator: "lt", value: 50 },
            { field: "status", operator: "eq", value: "published" },
          ],
        },
      ],
    };
    expect(evaluateCondition(condition, mockData)).toBe(true);
  });
});
