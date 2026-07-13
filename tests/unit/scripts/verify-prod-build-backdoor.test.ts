/**
 * @file tests/unit/scripts/verify-prod-build-backdoor.test.ts
 * @description Unit tests for build-time testing API backdoor scanner logic.
 */

import { describe, expect, it } from "vitest";

const FULL_HANDLER_MARKERS = [
  "Unauthorized: Testing endpoints are disabled",
  "handleTestingRoutes",
];

const STUB_MARKERS = ['new Response("Not Found", { status: 404 })'];

function classifyChunk(content: string): "full" | "stub" | "none" {
  const full = FULL_HANDLER_MARKERS.some((m) => content.includes(m));
  const stub = STUB_MARKERS.some((m) => content.includes(m));
  if (full) return "full";
  if (stub) return "stub";
  return "none";
}

describe("verify-prod-build-backdoor classification", () => {
  it("detects full testing handler markers", () => {
    expect(
      classifyChunk('throw new AppError("Unauthorized: Testing endpoints are disabled", 401)'),
    ).toBe("full");
  });

  it("detects noop stub", () => {
    expect(
      classifyChunk('export const POST = () => new Response("Not Found", { status: 404 })'),
    ).toBe("stub");
  });

  it("returns none for unrelated chunks", () => {
    expect(classifyChunk("export const foo = 1")).toBe("none");
  });
});
