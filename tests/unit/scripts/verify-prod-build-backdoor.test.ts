/**
 * @file tests/unit/scripts/verify-prod-build-backdoor.test.ts
 * @description Unit tests for build-time testing API backdoor scanner logic.
 */

import { describe, expect, it } from "vitest";

const FULL_HANDLER_MARKERS = [
  "Unauthorized: Testing endpoints are disabled",
  "handleTestingRoutes",
];

const STUB_MARKERS = [
  "SVELTY_TEST_BACKDOOR_STRIPPED",
  'new Response("Not Found", { status: 404 })',
  'new Response("Not Found",{status:404})',
];

function classifyChunk(content: string): "full" | "stub" | "none" {
  const full = FULL_HANDLER_MARKERS.some((m) => content.includes(m));
  const stub = STUB_MARKERS.some((m) => content.includes(m));
  // Mirror deploy gate: full handler without stub is the failure case.
  if (full && !stub) return "full";
  if (stub) return "stub";
  if (full) return "full";
  return "none";
}

describe("verify-prod-build-backdoor classification", () => {
  it("detects full testing handler markers", () => {
    expect(
      classifyChunk('throw new AppError("Unauthorized: Testing endpoints are disabled", 401)'),
    ).toBe("full");
  });

  it("detects pretty-printed noop stub", () => {
    expect(
      classifyChunk('export const POST = () => new Response("Not Found", { status: 404 })'),
    ).toBe("stub");
  });

  it("detects compact noop stub from testBackdoorStripperPlugin", () => {
    expect(
      classifyChunk(
        'export const POST=()=>new Response("Not Found",{status:404});export const SVELTY_TEST_BACKDOOR_STRIPPED=true;',
      ),
    ).toBe("stub");
  });

  it("treats NAMESPACE_CONFIG handleTestingRoutes + strip marker as stub (deploy-safe)", () => {
    expect(
      classifyChunk(
        'testing:{handler:"testing",fn:"handleTestingRoutes"};export const SVELTY_TEST_BACKDOOR_STRIPPED=true;',
      ),
    ).toBe("stub");
  });

  it("returns none for unrelated chunks", () => {
    expect(classifyChunk("export const foo = 1")).toBe("none");
  });
});
