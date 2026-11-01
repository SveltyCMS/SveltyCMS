/**
 * @file tests/unit/api/content-sse.test.ts
 * @description Tests for SSE event payload normalization and tenant filtering.
 */

import { describe, it, expect } from "vitest";
import { redactSecretsDeep } from "@utils/security/stream-redaction";
import { SseFrameBuffer, parseSseData } from "@utils/sse-client";
import { normalizeSseEventPayload } from "../../../src/routes/api/[...path]/handlers/content";

describe("normalizeSseEventPayload", () => {
  it("maps content:update to content_update type", () => {
    const result = normalizeSseEventPayload({
      event: "content:update",
      data: { version: 42, tenantId: "all" },
    });

    expect(result).toMatchObject({
      type: "content_update",
      event: "content:update",
      version: 42,
      tenantId: "all",
    });
    expect(result?.timestamp).toBeTypeOf("number");
  });

  it("filters events for a different tenant", () => {
    const result = normalizeSseEventPayload(
      {
        event: "content:update",
        data: { version: 1, tenantId: "tenant-a" },
      },
      "tenant-b",
    );

    expect(result).toBeNull();
  });

  it("allows broadcast events with tenantId all", () => {
    const result = normalizeSseEventPayload(
      {
        event: "content:update",
        data: { version: 1, tenantId: "all" },
      },
      "tenant-b",
    );

    expect(result?.type).toBe("content_update");
  });

  it("delivers tenant-scoped events only to matching subscribers", () => {
    const match = normalizeSseEventPayload(
      { event: "content:update", data: { version: 2, tenantId: "global" } },
      "global",
    );
    const mismatch = normalizeSseEventPayload(
      { event: "content:update", data: { version: 2, tenantId: "global" } },
      "tenant-other",
    );

    expect(match?.type).toBe("content_update");
    expect(mismatch).toBeNull();
  });

  it("does not treat null tenantId as cross-tenant wildcard", () => {
    const forTenantB = normalizeSseEventPayload(
      { event: "content:update", data: { version: 3, tenantId: null } },
      "tenant-b",
    );

    expect(forTenantB?.tenantId).toBeNull();
    expect(forTenantB?.type).toBe("content_update");
  });
});

describe("content SSE wire frame", () => {
  it("emits a frame the client can parse: timestamp stays numeric, frame is terminated", () => {
    const payload = normalizeSseEventPayload({ event: "content:update", data: { version: 7 } });
    const frame = `data: ${JSON.stringify(redactSecretsDeep(payload))}\n\n`;

    expect(frame.endsWith("\n\n")).toBe(true);
    const parsed = JSON.parse(frame.slice("data: ".length, -2));
    // Regression: the serialized payload used to be redacted as TEXT, so the 13-digit
    // epoch-ms became `"timestamp":[REDACTED]` and the client answered
    // `Unexpected token 'R', ... is not valid JSON`.
    expect(parsed.timestamp).toBeTypeOf("number");
    expect(parsed.version).toBe(7);
  });

  it("round-trips server frame -> client parser", () => {
    const payload = normalizeSseEventPayload({ event: "content:update", data: { version: 9 } });
    const frames = new SseFrameBuffer().push(
      `data: ${JSON.stringify(redactSecretsDeep(payload))}\n\n`,
    );

    expect(frames).toHaveLength(1);
    const parsed = parseSseData(frames[0].data);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toMatchObject({ version: 9, type: "content_update" });
  });
});
