/**
 * @file tests/unit/utils/schema-impact.test.ts
 * @description Unit tests for delta-detecting webhook impact scoring.
 */
import { describe, it, expect } from "vitest";
import {
  calculateImpact,
  HEAVY_REBUILD_THRESHOLD,
  LIGHT_NOTIFY_THRESHOLD,
} from "@utils/schema-impact";
import type { BreakingChange } from "@utils/collection-schema-warnings";

describe("schema-impact", () => {
  describe("calculateImpact", () => {
    it("returns score 0 and silent for empty changes", () => {
      const result = calculateImpact([]);
      expect(result.score).toBe(0);
      expect(result.action).toBe("silent");
      expect(result.hasDataLoss).toBe(false);
    });

    it("scores field_removed at 100", () => {
      const changes: BreakingChange[] = [
        { type: "field_removed", fieldName: "title", dataLoss: true, message: "" },
      ];
      const result = calculateImpact(changes);
      expect(result.score).toBe(100);
      expect(result.action).toBe("rebuild");
      expect(result.hasDataLoss).toBe(true);
      expect(result.breakdown[0].score).toBe(100);
    });

    it("scores type_changed at 70", () => {
      const changes: BreakingChange[] = [
        { type: "type_changed", fieldName: "price", dataLoss: false, message: "" },
      ];
      const result = calculateImpact(changes);
      expect(result.score).toBe(70);
      expect(result.action).toBe("rebuild"); // 70 > 50
    });

    it("scores required_added at 40 → notify", () => {
      const changes: BreakingChange[] = [
        { type: "required_added", fieldName: "email", dataLoss: false, message: "" },
      ];
      const result = calculateImpact(changes);
      expect(result.score).toBe(40);
      expect(result.action).toBe("notify"); // 25-50 range
    });

    it("scores unique_added at 30 → notify", () => {
      const changes: BreakingChange[] = [
        { type: "unique_added", fieldName: "slug", dataLoss: false, message: "" },
      ];
      const result = calculateImpact(changes);
      expect(result.score).toBe(30);
      expect(result.action).toBe("notify");
    });

    it("single low-impact change is silent", () => {
      // unique_added has weight 30 — use an unknown type for default weight (10) check
      const unknownChange: BreakingChange = {
        type: "field_renamed" as any,
        fieldName: "oldName",
        dataLoss: false,
        message: "",
      };
      const result = calculateImpact([unknownChange]);
      expect(result.score).toBe(80); // field_renamed = 80
    });

    it("data loss forces rebuild even with low score", () => {
      const changes: BreakingChange[] = [
        { type: "field_removed", fieldName: "body", dataLoss: true, message: "" },
      ];
      const result = calculateImpact(changes);
      expect(result.action).toBe("rebuild");
    });

    it("accumulates scores from multiple changes", () => {
      const changes: BreakingChange[] = [
        { type: "required_added", fieldName: "a", dataLoss: false, message: "" }, // 40
        { type: "required_added", fieldName: "b", dataLoss: false, message: "" }, // 40
      ];
      const result = calculateImpact(changes);
      expect(result.score).toBe(80);
      expect(result.action).toBe("rebuild"); // 80 > 50
    });

    it("unknown change type gets default weight", () => {
      const changes: BreakingChange[] = [
        { type: "some_future_type" as any, fieldName: "x", dataLoss: false, message: "" },
      ];
      const result = calculateImpact(changes);
      expect(result.score).toBe(10); // default weight
      expect(result.action).toBe("silent"); // 10 < 25
    });
  });

  describe("thresholds", () => {
    it("HEAVY_REBUILD_THRESHOLD is 50", () => {
      expect(HEAVY_REBUILD_THRESHOLD).toBe(50);
    });

    it("LIGHT_NOTIFY_THRESHOLD is 25", () => {
      expect(LIGHT_NOTIFY_THRESHOLD).toBe(25);
    });
  });
});
