/**
 * @file src/components/system/builder/logic-types.ts
 * @description Type definitions for the Visual Conditional Logic Builder.
 */

export interface Rule {
  id: string;
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains" | "in";
  value: any;
}

export interface LogicGroup {
  id: string;
  type: "AND" | "OR";
  rules: (Rule | LogicGroup)[];
}
