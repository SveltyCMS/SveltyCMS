/**
 * @file tests/unit/routes/automation-step-guard.test.ts
 * @description Step-gate contract for the automation editor.
 *
 * The editor disables "Next" instead of letting a new user save a trigger that
 * can never fire. This pins each reason the guard can return.
 */

import { describe, expect, it } from "vitest";
import {
  automationBlockReason,
  type AutomationGuardInput,
} from "../../../src/routes/(app)/config/automations/automation-step-guard";

function guard(overrides: Partial<AutomationGuardInput> = {}): AutomationGuardInput {
  return {
    step: 1,
    name: "Notify editors",
    triggerType: "event",
    events: ["entry:publish"],
    cron: "",
    operationCount: 0,
    ...overrides,
  };
}

describe("automation step guard", () => {
  it("requires a name on step 1", () => {
    expect(automationBlockReason(guard({ name: "" }))).toBe("name");
    expect(automationBlockReason(guard({ name: "   " }))).toBe("name");
  });

  it("requires at least one event for an event trigger", () => {
    expect(automationBlockReason(guard({ events: [] }))).toBe("events");
    expect(automationBlockReason(guard({ events: undefined }))).toBe("events");
    expect(automationBlockReason(guard({ events: ["entry:update"] }))).toBeNull();
  });

  it("requires a cron expression for a schedule trigger", () => {
    expect(automationBlockReason(guard({ triggerType: "schedule", cron: "" }))).toBe("cron");
    expect(automationBlockReason(guard({ triggerType: "schedule", cron: "  " }))).toBe("cron");
    expect(
      automationBlockReason(guard({ triggerType: "schedule", cron: "0 9 * * 1-5" })),
    ).toBeNull();
  });

  it("lets a manual trigger continue with only a name", () => {
    expect(automationBlockReason(guard({ triggerType: "manual", events: [] }))).toBeNull();
  });

  it("requires one operation on step 2", () => {
    expect(automationBlockReason(guard({ step: 2, operationCount: 0 }))).toBe("operations");
    expect(automationBlockReason(guard({ step: 2, operationCount: 1 }))).toBeNull();
  });

  it("never blocks the review step", () => {
    expect(automationBlockReason(guard({ step: 3, operationCount: 0, events: [] }))).toBeNull();
  });
});
