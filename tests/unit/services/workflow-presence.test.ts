/**
 * @file tests/unit/services/workflow-presence.test.ts
 * @description The write path may skip the workflow service only after a
 * lookup has recorded a hit or a confirmed miss.
 */

import { describe, expect, it } from "vitest";
import {
  forgetWorkflowPresence,
  noteWorkflowPresence,
  workflowApplies,
  workflowKnownAbsent,
} from "@src/services/background/workflow-presence";

describe("workflow presence", () => {
  it("treats an unknown collection as neither present nor absent", () => {
    forgetWorkflowPresence();
    expect(workflowApplies("Posts", "t1")).toBe(false);
    expect(workflowKnownAbsent("Posts", "t1")).toBe(false);
  });

  it("remembers a definition and a confirmed miss until the cache is cleared", () => {
    forgetWorkflowPresence();
    noteWorkflowPresence("Posts", "t1", true);
    noteWorkflowPresence("Pages", "t1", false);
    expect(workflowApplies("Posts", "t1")).toBe(true);
    expect(workflowKnownAbsent("Posts", "t1")).toBe(false);
    expect(workflowApplies("Pages", "t1")).toBe(false);
    expect(workflowKnownAbsent("Pages", "t1")).toBe(true);
    forgetWorkflowPresence();
    expect(workflowApplies("Posts", "t1")).toBe(false);
    expect(workflowKnownAbsent("Pages", "t1")).toBe(false);
  });
});
