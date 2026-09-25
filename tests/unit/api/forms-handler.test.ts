/**
 * @file tests/unit/api/forms-handler.test.ts
 * @description Unit tests for first-party native form ingestion handler.
 */

import { describe, expect, it, vi } from "vitest";
import { handleFormsRoutes } from "@src/routes/api/[...path]/handlers/forms";
import { eventBus } from "@utils/event-bus";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/content/types";

const TEST_TENANT = "test-tenant" as DatabaseId;

describe("Forms API Handler", () => {
  function createMockEvent(
    method: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): RequestEvent {
    return {
      request: {
        method,
        headers: new Headers({
          "content-type": "application/json",
          ...headers,
        }),
        json: async () => body ?? {},
        formData: async () => new FormData(),
      },
      url: new URL("http://localhost:5173/api/forms/contact"),
      locals: {},
      getClientAddress: () => "192.168.1.50",
    } as unknown as RequestEvent;
  }

  function createMockCms(insertResult = { _id: "entry_123" }) {
    return {
      db: {
        crud: {
          insert: vi.fn().mockResolvedValue(insertResult),
        },
      },
      collections: {
        find: vi.fn().mockResolvedValue({ success: true, data: [{ _id: "sub_1", name: "Alice" }] }),
      },
    } as any;
  }

  it("silently drops spam submissions when honeypot field is filled", async () => {
    const cms = createMockCms();
    const event = createMockEvent("POST", {
      name: "Spam Bot",
      email: "bot@spam.com",
      _hp: "I am a bot",
    });

    const res = await handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    // Crucial: DB insert was NEVER called
    expect(cms.db.crud.insert).not.toHaveBeenCalled();
  });

  it("persists legitimate form submission with metadata and fires event", async () => {
    const cms = createMockCms({ _id: "sub_abc" });
    const event = createMockEvent("POST", {
      name: "John Doe",
      email: "john@example.com",
      message: "Hello world!",
    });

    const eventSpy = vi.spyOn(eventBus, "emit");

    const res = await handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe("sub_abc");

    // DB insert was called with enriched metadata
    expect(cms.db.crud.insert).toHaveBeenCalledTimes(1);
    const [collection, payload, options] = cms.db.crud.insert.mock.calls[0];
    expect(collection).toBe("contact");
    expect(options).toEqual({ tenantId: TEST_TENANT });
    expect(payload.name).toBe("John Doe");
    expect(payload._formSubmittedAt).toBeDefined();
    expect(payload._formIpHash).toBeDefined();
    expect(payload._formUserAgent).toBeDefined();

    // Event bus emission
    expect(eventSpy).toHaveBeenCalledWith(
      "form:submit",
      expect.objectContaining({
        collection: "contact",
        id: "sub_abc",
        tenantId: "test-tenant",
      }),
    );

    eventSpy.mockRestore();
  });

  it("requires authentication for GET /api/forms/:collection", async () => {
    const cms = createMockCms();
    const event = createMockEvent("GET");
    (event.locals as any).user = null;

    await expect(handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"])).rejects.toThrow(
      "Authentication required",
    );
  });

  it("returns submissions for authenticated users on GET", async () => {
    const cms = createMockCms();
    const event = createMockEvent("GET");
    (event.locals as any).user = { _id: "admin_1", role: "admin" };

    const res = await handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(cms.collections.find).toHaveBeenCalledWith(
      "contact",
      expect.objectContaining({
        tenantId: "test-tenant",
      }),
    );
  });
});
