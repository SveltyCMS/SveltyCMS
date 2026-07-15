/**
 * @file tests/unit/api/media-security-critical.test.ts
 * @description Unit tests for critical media security vulnerabilities.
 *
 * Uses shared createMockRequestEvent + callApiDispatcher.
 */

import { describe, it, expect, vi } from "vitest";
import { createMockRequestEvent, callApiDispatcher } from "../utils/mock-event";

describe("Media Security Critical Unit Tests", () => {
  it("should process media save correctly", async () => {
    const formDataEntries: Record<string, any> = {
      processType: "save",
      files: [new File(["test content"], "test.jpg", { type: "image/jpeg" })],
    };

    const formData = {
      get: (key: string) => formDataEntries[key],
      getAll: (key: string) => formDataEntries[key] || [],
      has: (key: string) => key in formDataEntries,
    };

    const adapter = {
      media: {
        files: {
          getByFolder: vi.fn().mockResolvedValue({ success: true, data: [] }),
          getByHash: vi.fn().mockResolvedValue({ success: true, data: null }),
          upload: vi.fn().mockResolvedValue({
            success: true,
            data: { _id: "m1", path: "test.jpg" },
          }),
        },
        updateMedia: vi.fn().mockResolvedValue({ success: true }),
        saveMedia: vi.fn().mockResolvedValue({ success: true, _id: "m1" }),
        deleteMedia: vi.fn().mockResolvedValue({ success: true }),
        batchProcessImages: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
      crud: {
        findOne: vi.fn().mockResolvedValue({ success: true, data: {} }),
        findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
        insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "new" } }),
      },
      auth: { getUserById: vi.fn(), validateSession: vi.fn() },
      system: {
        preferences: { getMany: vi.fn().mockResolvedValue({}) },
        widgets: {
          getActiveWidgets: vi.fn().mockResolvedValue({ success: true, data: [] }),
        },
      },
      collection: {
        getModel: vi.fn().mockResolvedValue({ name: "test", fields: [] }),
      },
    };

    const event = createMockRequestEvent({
      method: "POST",
      path: "media/process",
      formData,
      user: { _id: "u1", role: "admin", isAdmin: true },
      tenantId: "t1",
      roles: [
        {
          _id: "admin",
          name: "Administrator",
          isAdmin: true,
          permissions: [],
        },
      ],
      dbAdapter: adapter,
      headers: { "content-type": "multipart/form-data" },
    });

    const response = await callApiDispatcher("POST", event);
    const result = await response.json();

    if (!result.success) {
      console.error("Critical test failed. Result:", JSON.stringify(result, null, 2));
    }

    expect(result.success).toBe(true);
  });
});
