import { describe, it, expect } from "vitest";
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
});
